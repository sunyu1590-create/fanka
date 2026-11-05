import type { SupabaseClient } from "@supabase/supabase-js";
import { mediaBucketForPath } from "@/lib/media-path";

export async function signPostMedia(db: SupabaseClient, paths: readonly string[], expiresIn: number) {
  const grouped = new Map<string, string[]>();
  for (const path of [...new Set(paths)]) {
    const bucket = mediaBucketForPath(path);
    grouped.set(bucket, [...(grouped.get(bucket) || []), path]);
  }

  const results = await Promise.all([...grouped].flatMap(([bucket, bucketPaths]) => {
    const batches = Array.from({ length: Math.ceil(bucketPaths.length / 100) }, (_, index) => bucketPaths.slice(index * 100, (index + 1) * 100));
    return batches.map((batch) => db.storage.from(bucket).createSignedUrls(batch, expiresIn));
  }));
  const error = results.find((result) => result.error)?.error;
  if (error) return { data: null, error };
  return {
    data: results.flatMap((result) => result.data || []),
    error: null,
  };
}
