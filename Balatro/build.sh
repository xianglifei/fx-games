#!/usr/bin/env bash
# 小丑牌单文件构建:把 src/ 各模块合成一个可直接双击打开的 index.html
set -euo pipefail
cd "$(dirname "$0")"

OUT=index.html
{
  cat <<HEAD
<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, user-scalable=no">
<meta name="theme-color" content="#0c1f16">
<meta name="description" content="小丑牌 Balatro 风格扑克肉鸽单文件网页游戏:筹码×倍率计分,小丑/塔罗/星球/光谱牌构筑,8 个盲注通关,原创视觉与合成音效">
<title>小丑牌 · JOKER'S DECK</title>
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><rect width='100' height='100' rx='16' fill='%230c1f16'/><text x='50' y='74' font-size='62' text-anchor='middle' fill='%23ffcf5c' font-family='serif' font-weight='bold'>&#127183;</text></svg>">
<style>
HEAD
  sed "s|__FONT_B64__|$(cat src/font_b64.txt)|" src/fontface.css
  echo "</style>"
  echo "<style>"
  cat src/style.css
  echo "</style>"
  echo "</head>"
  echo "<body>"
  cat src/body.html
  echo "<script>"
  cat src/data.js
  echo "</script>"
  echo "<script>"
  cat src/audio.js
  echo "</script>"
  echo "<script>"
  cat src/engine.js
  echo "</script>"
  echo "<script>"
  cat src/ui.js
  echo "</script>"
  echo "</body>"
  echo "</html>"
} > "$OUT"

echo "built $OUT ($(wc -c < "$OUT") bytes, $(wc -l < "$OUT") lines)"
