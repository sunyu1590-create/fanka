export const VIDEO_COMPRESSION_THRESHOLD = 12 * 1024 * 1024;

export type VideoCompressionResult = {
  file: File;
  compressed: boolean;
  reason: "compressed" | "small" | "unsupported" | "unchanged";
};

export function supportsVideoCompression() {
  if (typeof window === "undefined" || typeof MediaRecorder === "undefined") return false;
  const canvas = document.createElement("canvas");
  if (typeof canvas.captureStream !== "function") return false;
  const AudioContextConstructor = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextConstructor) return false;
  return ["video/mp4", "video/webm;codecs=vp8,opus", "video/webm;codecs=vp9,opus", "video/webm"].some((type) => MediaRecorder.isTypeSupported(type));
}

function outputMimeType(inputType: string) {
  const candidates = inputType === "video/mp4"
    ? ["video/mp4;codecs=avc1.42E01E,mp4a.40.2", "video/mp4", "video/webm;codecs=vp8,opus", "video/webm;codecs=vp9,opus", "video/webm"]
    : ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm", "video/mp4;codecs=avc1.42E01E,mp4a.40.2", "video/mp4"];
  return candidates.find((type) => MediaRecorder.isTypeSupported(type)) || "";
}

function evenDimension(value: number) {
  return Math.max(2, Math.floor(value / 2) * 2);
}

export async function compressVideoForUpload(
  file: File,
  onProgress: (percent: number) => void,
  signal?: AbortSignal,
): Promise<VideoCompressionResult> {
  if (file.size <= VIDEO_COMPRESSION_THRESHOLD) return { file, compressed: false, reason: "small" };
  if (!supportsVideoCompression()) return { file, compressed: false, reason: "unsupported" };
  if (signal?.aborted) throw new DOMException("视频压缩已取消", "AbortError");

  const recorderMime = outputMimeType(file.type);
  if (!recorderMime) return { file, compressed: false, reason: "unsupported" };
  const normalizedType = recorderMime.startsWith("video/mp4") ? "video/mp4" : "video/webm";
  const extension = normalizedType === "video/mp4" ? "mp4" : "webm";
  const sourceUrl = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.preload = "auto";
  video.playsInline = true;
  video.muted = false;

  const AudioContextConstructor = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextConstructor) {
    URL.revokeObjectURL(sourceUrl);
    return { file, compressed: false, reason: "unsupported" };
  }

  // Start the audio context while the file picker still has user activation. Audio is routed
  // into the encoded stream instead of the speakers, so compression stays silent for bystanders.
  let audioContext: AudioContext;
  try {
    audioContext = new AudioContextConstructor();
    void audioContext.resume();
  } catch {
    URL.revokeObjectURL(sourceUrl);
    return { file, compressed: false, reason: "unsupported" };
  }

  let sourceNode: MediaElementAudioSourceNode | null = null;
  let drawFrame = 0;
  let recorder: MediaRecorder | null = null;
  let videoStream: MediaStream | null = null;
  let audioDestination: MediaStreamAudioDestinationNode | null = null;

  try {
    await new Promise<void>((resolve, reject) => {
      const finish = (error?: Error) => {
        window.clearTimeout(timeout);
        signal?.removeEventListener("abort", abort);
        video.onloadedmetadata = null;
        video.onerror = null;
        if (error) reject(error);
        else resolve();
      };
      const timeout = window.setTimeout(() => finish(new Error("读取视频超时")), 20000);
      const abort = () => finish(new DOMException("视频压缩已取消", "AbortError"));
      signal?.addEventListener("abort", abort, { once: true });
      if (signal?.aborted) { abort(); return; }
      video.onloadedmetadata = () => finish();
      video.onerror = () => finish(new Error("无法读取这个视频"));
      video.src = sourceUrl;
      video.load();
    });

    if (!video.videoWidth || !video.videoHeight || !Number.isFinite(video.duration) || video.duration <= 0) {
      return { file, compressed: false, reason: "unsupported" };
    }
    if (signal?.aborted) throw new DOMException("视频压缩已取消", "AbortError");
    if (audioContext.state !== "running") {
      await audioContext.resume();
      if ((audioContext.state as AudioContextState) !== "running") return { file, compressed: false, reason: "unsupported" };
    }

    const scale = Math.min(1, 1280 / Math.max(video.videoWidth, video.videoHeight));
    const canvas = document.createElement("canvas");
    canvas.width = evenDimension(video.videoWidth * scale);
    canvas.height = evenDimension(video.videoHeight * scale);
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) return { file, compressed: false, reason: "unsupported" };

    const canvasStream = canvas.captureStream(24);
    audioDestination = audioContext.createMediaStreamDestination();
    sourceNode = audioContext.createMediaElementSource(video);
    sourceNode.connect(audioDestination);
    videoStream = new MediaStream([
      ...canvasStream.getVideoTracks(),
      ...audioDestination.stream.getAudioTracks(),
    ]);

    const chunks: BlobPart[] = [];
    let finishRecording: ((error?: Error) => void) | null = null;
    const output = new Promise<Blob>((resolve, reject) => {
      recorder = new MediaRecorder(videoStream!, {
        mimeType: recorderMime,
        videoBitsPerSecond: 1_600_000,
        audioBitsPerSecond: 128_000,
      });
      recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
      recorder.onerror = () => {
        const error = new Error("视频压缩失败");
        video.pause();
        finishRecording?.(error);
        reject(error);
      };
      recorder.onstop = () => resolve(new Blob(chunks, { type: recorder?.mimeType || normalizedType }));
    });
    void output.catch(() => {});

    let lastProgress = -1;
    const paint = () => {
      if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        const progress = Math.min(99, Math.round((video.currentTime / video.duration) * 100));
        if (progress !== lastProgress) { lastProgress = progress; onProgress(progress); }
      }
      if (!video.ended && !video.paused) drawFrame = requestAnimationFrame(paint);
    };

    const stopped = new Promise<void>((resolve, reject) => {
      let settled = false;
      const finish = (error?: Error) => {
        if (settled) return;
        settled = true;
        signal?.removeEventListener("abort", abort);
        if (error) reject(error);
        else resolve();
      };
      const abort = () => {
        video.pause();
        if (recorder?.state === "recording") recorder.stop();
        finish(new DOMException("视频压缩已取消", "AbortError"));
      };
      finishRecording = finish;
      signal?.addEventListener("abort", abort, { once: true });
      video.onended = () => {
        if (recorder?.state === "recording") recorder.stop();
        finish();
      };
      video.onabort = () => {
        if (recorder?.state === "recording") recorder.stop();
        finish(new Error("视频读取中断"));
      };
      try {
        recorder?.start(1000);
        void video.play().then(() => { drawFrame = requestAnimationFrame(paint); }).catch((error: unknown) => {
          if (recorder?.state === "recording") recorder.stop();
          finish(error instanceof Error ? error : new Error("无法播放此视频"));
        });
      } catch (error) {
        if (recorder?.state === "recording") recorder.stop();
        finish(error instanceof Error ? error : new Error("无法开始视频压缩"));
      }
    });

    await stopped;
    const blob = await output;
    if (!blob.size || blob.size >= file.size) return { file, compressed: false, reason: "unchanged" };
    onProgress(100);
    const stem = file.name.replace(/\.[^.]+$/, "") || "video";
    return {
      file: new File([blob], `${stem}.${extension}`, { type: normalizedType, lastModified: file.lastModified }),
      compressed: true,
      reason: "compressed",
    };
  } finally {
    cancelAnimationFrame(drawFrame);
    video.pause();
    video.removeAttribute("src");
    video.load();
    sourceNode?.disconnect();
    videoStream?.getTracks().forEach((track) => track.stop());
    audioDestination?.stream.getTracks().forEach((track) => track.stop());
    await audioContext.close().catch(() => {});
    URL.revokeObjectURL(sourceUrl);
  }
}
