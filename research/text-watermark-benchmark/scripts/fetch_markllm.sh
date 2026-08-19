#!/usr/bin/env bash
set -euo pipefail

MARKLLM_COMMIT="c45ddc40f7b761beabe55a1b8dc4690e531d1c6d"
MARKLLM_TARGET="${1:-.markllm-source}"

if [[ -e "$MARKLLM_TARGET" ]]; then
  echo "Refusing to overwrite existing path: $MARKLLM_TARGET" >&2
  exit 1
fi

git init "$MARKLLM_TARGET"
git -C "$MARKLLM_TARGET" remote add origin https://github.com/THU-BPM/MarkLLM.git
git -C "$MARKLLM_TARGET" fetch --depth 1 --filter=blob:none origin "$MARKLLM_COMMIT"
git -C "$MARKLLM_TARGET" checkout --detach FETCH_HEAD
echo "MarkLLM pinned at $MARKLLM_COMMIT in $MARKLLM_TARGET"
