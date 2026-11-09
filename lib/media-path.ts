export const POST_IMAGE_BUCKET = "post-covers";
export const POST_VIDEO_BUCKET = "post-videos";

export function isVideoMediaPath(path: string) {
  return /\.(?:mp4|webm)$/i.test(path);
}

export function mediaBucketForPath(path: string) {
  return isVideoMediaPath(path) ? POST_VIDEO_BUCKET : POST_IMAGE_BUCKET;
}

export function splitPostMediaPaths(paths: readonly string[]) {
  return {
    images: paths.filter((path) => !isVideoMediaPath(path)),
    videos: paths.filter(isVideoMediaPath),
  };
}
