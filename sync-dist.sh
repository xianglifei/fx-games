#!/usr/bin/env bash
# 把各游戏的源 index.html 同步到其 dist/ 目录(凡已存在 dist/ 的游戏)。
# dist/ 是部署上线的副本:改完游戏后、部署前,在仓库根跑一次本脚本,
# 不要再手工复制——手工同步迟早漂移。新游戏要上线时,先建 dist/ 再跑。
set -euo pipefail
cd "$(dirname "$0")"

for dist in */dist; do
  [ -d "$dist" ] || continue
  game=$(dirname "$dist")
  if [ -f "$game/index.html" ]; then
    cp "$game/index.html" "$dist/index.html"
    echo "已同步 $dist/index.html"
  fi
done
