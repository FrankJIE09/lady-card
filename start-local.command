#!/bin/zsh
set -e
cd "${0:A:h}"
if ! command -v node >/dev/null 2>&1; then
  bundled_runtime="$HOME/.cache/codex-runtimes/codex-primary-runtime/dependencies"
  if [[ -x "$bundled_runtime/node/bin/node" ]]; then
    export PATH="$bundled_runtime/node/bin:$bundled_runtime/bin/fallback:$PATH"
  fi
fi
if ! command -v node >/dev/null 2>&1 || ! command -v pnpm >/dev/null 2>&1; then
  echo '请先安装 Node.js 22+ 和 pnpm，再重新打开。'
  read -r 'reply?按回车关闭'
  exit 1
fi
if [[ ! -d node_modules ]]; then pnpm install; fi
exec pnpm dev
