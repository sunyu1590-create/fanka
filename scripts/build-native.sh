#!/usr/bin/env bash
# 在服务器上构建原生安卓包，并发布到 /home/ubuntu/downloads。
# 用法：NOTES="第一条|第二条" ./build-native.sh
set -euo pipefail

REPO=/home/ubuntu/fanka
SRC="$REPO/android-native"
DL=/home/ubuntu/downloads
KEYS=/home/ubuntu/.heika-keys

export JAVA_HOME=/usr/lib/jvm/java-17-openjdk-amd64
export ANDROID_HOME=/opt/android-sdk
export ANDROID_SDK_ROOT=/opt/android-sdk
export PATH="$JAVA_HOME/bin:$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools:$PATH"

echo "== 1/6 同步源码 =="
cd "$REPO"
git pull --ff-only origin main

echo "== 2/6 编译 release =="
cd "$SRC"
export HEIKA_KEYSTORE_PATH="$KEYS/heika-release.jks"
export HEIKA_KEYSTORE_PASSWORD="Heika2026App"
export HEIKA_KEY_ALIAS="heika"
export HEIKA_KEY_PASSWORD="Heika2026App"
./gradlew assembleRelease -x lintVitalRelease --no-daemon --max-workers=1

APK="$SRC/app/build/outputs/apk/release/app-release.apk"
test -f "$APK" || { echo "构建产物缺失"; exit 1; }

echo "== 3/6 读取版本与校验 =="
BADGE=$("$ANDROID_HOME/build-tools/35.0.0/aapt2" dump badging "$APK")
CODE=$(printf '%s\n' "$BADGE" | sed -n "s/^package:.*versionCode='\([0-9]*\)'.*/\1/p")
NAME=$(printf '%s\n' "$BADGE" | sed -n "s/^package:.*versionName='\([^']*\)'.*/\1/p")
MIN_SDK=$(printf '%s\n' "$BADGE" | sed -n "s/^sdkVersion:'\([0-9]*\)'.*/\1/p")
SIZE=$(stat -c %s "$APK")
SHA=$(sha256sum "$APK" | cut -d' ' -f1)
echo "版本 $NAME (code $CODE)  $((SIZE / 1024 / 1024)) MB"
"$ANDROID_HOME/build-tools/35.0.0/apksigner" verify "$APK"

echo "== 4/6 发布安装包 =="
mkdir -p "$DL"
TARGET="$DL/heika-native-$NAME-code$CODE.apk"
cp "$APK" "$TARGET"
ln -sfn "heika-native-$NAME-code$CODE.apk" "$DL/heika-native-latest.apk"

echo "== 5/6 更新清单 =="
NOTES_JSON=$(
  NOTES="${NOTES:-}" /usr/bin/python3 - <<'PY'
import json, os
raw = os.environ.get("NOTES", "").strip()
items = [part.strip() for part in raw.split("|") if part.strip()]
print(json.dumps(items, ensure_ascii=False))
PY
)

VERSION="$NAME" CODE="$CODE" SIZE="$SIZE" SHA="$SHA" MIN_SDK="$MIN_SDK" NOTES_JSON="$NOTES_JSON" /usr/bin/python3 - <<'PY'
import json, os, datetime
path = "/home/ubuntu/downloads/manifest.json"
try:
    manifest = json.load(open(path, encoding="utf-8"))
except Exception:
    manifest = {}
today = datetime.date.today().isoformat()
manifest["updated_at"] = datetime.datetime.now(datetime.timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
manifest["native"] = {
    "label": "原生版",
    "version": os.environ["VERSION"],
    "code": int(os.environ["CODE"]),
    "file": "heika-native-latest.apk",
    "size": int(os.environ["SIZE"]),
    "sha256": os.environ["SHA"],
    "min_sdk": int(os.environ["MIN_SDK"] or 26),
    "updated": today,
    "notes": json.loads(os.environ["NOTES_JSON"]),
}
manifest.setdefault("webview", {"label": "兼容版", "frozen": True})
with open(path, "w", encoding="utf-8") as handle:
    json.dump(manifest, handle, ensure_ascii=False, indent=2)
    handle.write("\n")
print("清单已更新")
PY

echo "== 6/6 清理旧包 =="
find "$DL" -maxdepth 1 -name "heika-native-*-code*.apk" ! -name "heika-native-$NAME-code$CODE.apk" -print -delete

echo
echo "完成：https://moonclean.shop/dl/heika-native-latest.apk"
echo "版本：$NAME (code $CODE)  $((SIZE / 1024 / 1024)) MB"
echo "SHA-256：$SHA"
ls -lh "$DL" | tail -6
