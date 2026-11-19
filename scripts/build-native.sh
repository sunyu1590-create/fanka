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

echo "== 2/6 清理缓存并编译 release =="
cd "$SRC"
# Hilt 的注解处理在增量构建下会漏掉新增的 @HiltViewModel，运行时表现为
# NoSuchMethodException: <init>[] 并直接把 App 崩在启动路径上（2.5.0/2.6.0 事故）。
# 发布包一律全量编译，宁可多花两分钟，也不让漏项进包。
rm -rf app/build
# 口令不进仓库：放在 $KEYS/keystore.env（权限 600），缺失就中止，绝不用默认值兜底。
KEYENV="$KEYS/keystore.env"
test -f "$KEYENV" || { echo "缺少签名配置文件 $KEYENV，构建中止"; exit 1; }
set -a; . "$KEYENV"; set +a
: "${HEIKA_KEYSTORE_PASSWORD:?签名口令未配置}"
: "${HEIKA_KEY_PASSWORD:?签名口令未配置}"
export HEIKA_KEYSTORE_PATH="$KEYS/heika-release.jks"
export HEIKA_KEY_ALIAS="${HEIKA_KEY_ALIAS:-heika}"
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

# 逐个核对 @HiltViewModel 是否都生成了 Hilt 模块；少一个就不发布。
/usr/bin/python3 - <<'PY'
import pathlib, re, sys
src = pathlib.Path('app/src/main/java')
gen = pathlib.Path('app/build/generated/ksp/release/java/hilt_aggregated_deps')
# 两种写法都算：@HiltViewModel 与全限定 @dagger.hilt.android.lifecycle.HiltViewModel。
pattern = re.compile(r'@(?:dagger\.hilt\.android\.lifecycle\.)?HiltViewModel\b[\s\S]{0,240}?class\s+(\w+)')
names = set()
for f in src.rglob('*.kt'):
    names.update(pattern.findall(f.read_text(encoding='utf-8')))
modules = list(gen.glob('*_HiltModules_KeyModule.java')) if gen.exists() else []
missing = sorted(n for n in names if not any(p.name.endswith(f'_{n}_HiltModules_KeyModule.java') for p in modules))
print(f'Hilt 校验：源码 {len(names)} 个 ViewModel，生成 {len(modules)} 个模块')
if missing:
    print('缺失：' + ', '.join(missing))
    sys.exit(1)
PY

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
