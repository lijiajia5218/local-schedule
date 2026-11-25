#!/usr/bin/env bash
set -euo pipefail

export PATH="$HOME/.cargo/bin:$PATH"

APP_NAME="本地日程"
SRC_APP="src-tauri/target/release/bundle/macos/${APP_NAME}.app"
DEST_APP="/Applications/${APP_NAME}.app"

echo "正在增量编译 macOS 客户端..."
npm run tauri build -- --bundles app --config '{"bundle":{"createUpdaterArtifacts":false}}'

if [ ! -d "$SRC_APP" ]; then
  echo "未找到编译产物：$SRC_APP"
  exit 1
fi

if pgrep -x "local-schedule" >/dev/null 2>&1; then
  echo "正在关闭运行中的 ${APP_NAME}..."
  osascript -e "tell application \"${APP_NAME}\" to quit" >/dev/null 2>&1 || true
  sleep 1
  pkill -x "local-schedule" >/dev/null 2>&1 || true
fi

echo "正在更新 ${DEST_APP}..."
rm -rf "$DEST_APP"
ditto "$SRC_APP" "$DEST_APP"

echo "正在启动 ${APP_NAME}..."
open "$DEST_APP"
echo "本地升级完成（用户数据保留在 ~/Documents/本地日程）。"
