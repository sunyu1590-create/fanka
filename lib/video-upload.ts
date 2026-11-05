export const POST_VIDEO_MAX_BYTES = 50 * 1024 * 1024;
export const POST_VIDEO_TYPES = ["video/mp4", "video/webm"] as const;
export const TUS_CHUNK_BYTES = 6 * 1024 * 1024;

export function videoExtension(type: string) {
  if (type === "video/mp4") return "mp4";
  if (type === "video/webm") return "webm";
  return null;
}

function resumableEndpoint(supabaseUrl: string) {
  const url = new URL(supabaseUrl);
  if (url.hostname.endsWith(".supabase.co")) {
    url.hostname = url.hostname.replace(/\.supabase\.co$/, ".storage.supabase.co");
  }
  url.pathname = "/storage/v1/upload/resumable";
  url.search = "";
  return url.toString();
}

export async function uploadVideoResumable({
  file,
  path,
  supabaseUrl,
  publishableKey,
  accessToken,
  onProgress,
}: {
  file: File;
  path: string;
  supabaseUrl: string;
  publishableKey: string;
  accessToken: string;
  onProgress: (percent: number) => void;
}) {
  const extension = videoExtension(file.type);
  if (!extension || !POST_VIDEO_TYPES.includes(file.type as (typeof POST_VIDEO_TYPES)[number])) {
    throw new Error("视频测试版仅支持 MP4、WebM 格式");
  }
  if (!file.size || file.size > POST_VIDEO_MAX_BYTES) {
    throw new Error("视频大小需在 1 B 到 50 MB 之间");
  }

  const { Upload } = await import("tus-js-client");
  await new Promise<void>((resolve, reject) => {
    const upload = new Upload(file, {
      endpoint: resumableEndpoint(supabaseUrl),
      chunkSize: TUS_CHUNK_BYTES,
      retryDelays: [0, 3000, 5000, 10000, 20000],
      headers: {
        apikey: publishableKey,
        Authorization: `Bearer ${accessToken}`,
        "x-upsert": "false",
      },
      metadata: {
        bucketName: "post-videos",
        objectName: path,
        contentType: file.type,
        cacheControl: "3600",
      },
      storeFingerprintForResuming: true,
      removeFingerprintOnSuccess: true,
      onProgress: (sent, total) => onProgress(Math.min(100, Math.round((sent / Math.max(total, 1)) * 100))),
      onError: (error) => reject(new Error(`视频上传失败：${error.message}`)),
      onSuccess: () => {
        onProgress(100);
        resolve();
      },
    });

    void upload.findPreviousUploads().then((uploads) => {
      if (uploads.length) upload.resumeFromPreviousUpload(uploads[0]);
      upload.start();
    }).catch((error: unknown) => reject(error instanceof Error ? error : new Error("无法恢复视频上传")));
  });
}
