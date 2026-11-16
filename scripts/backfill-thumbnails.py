#!/usr/bin/env python3
"""为历史帖子补齐 480/960 WebP 缩略图，并回写 post_media 路径。

迁移到新 Supabase 后，早期导入的图片只有原图（100-700 KB），
原生端在移动网络下加载容易超时。此脚本按 media-variant 命名规则
生成 `<name>-480.webp` 与 `<name>-960.webp`，写回缩略图字段。
"""
import io, os, sys
import psycopg2
import requests
from PIL import Image

DSN = os.environ["DATABASE_URL"]
BASE = os.environ["SUPABASE_URL"].rstrip("/")
KEY = os.environ["SUPABASE_SECRET_KEY"]
H = {"apikey": KEY, "Authorization": f"Bearer {KEY}"}
BUCKET = os.environ.get("MEDIA_BUCKET", "post-covers")


def variants(path: str):
    folder, name = path.rsplit("/", 1)
    base = name.rsplit(".", 1)[0]
    return f"{folder}/{base}-480.webp", f"{folder}/{base}-960.webp"


def main():
    conn = psycopg2.connect(DSN)
    conn.autocommit = True
    cur = conn.cursor()
    cur.execute("select id, storage_path from post_media where thumbnail_path is null order by sort_order")
    rows = cur.fetchall()
    print(f"待处理 {len(rows)} 条")
    for pid, path in rows:
        src = requests.get(f"{BASE}/storage/v1/object/authenticated/{BUCKET}/{path}", headers=H, timeout=60)
        if src.status_code != 200:
            print("跳过（原图不可读）", path, src.status_code)
            continue
        img = Image.open(io.BytesIO(src.content)).convert("RGB")
        p480, p960 = variants(path)
        for width, target in ((480, p480), (960, p960)):
            thumb = img.copy()
            thumb.thumbnail((width, width * 4), Image.LANCZOS)
            buf = io.BytesIO()
            thumb.save(buf, "WEBP", quality=76, method=4)
            up = requests.post(
                f"{BASE}/storage/v1/object/{BUCKET}/{target}",
                headers={**H, "Content-Type": "image/webp", "x-upsert": "true"},
                data=buf.getvalue(), timeout=60,
            )
            print(" ", target, up.status_code, f"{len(buf.getvalue()) // 1024} KB")
        cur.execute("update post_media set thumbnail_path=%s, retina_thumbnail_path=%s where id=%s", (p480, p960, pid))


if __name__ == "__main__":
    sys.exit(main())
