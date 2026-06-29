#!/bin/sh

CUR=$(pwd)

CURRENT=$(cd "$(dirname "$0")" || exit;pwd)
echo "${CURRENT}"

cd "${CURRENT}" || exit
git pull --prune
result=$?
if [ $result -ne 0 ]; then
  cd "${CUR}" || exit
  exit $result
fi

cd "${CURRENT}" || exit
result=$?
if [ $result -ne 0 ]; then
  cd "${CUR}" || exit
  exit $result
fi
echo ""
pwd

if ! (pnx pnpm@latest self-update && pnpm clean --lockfile && pnpm install && pnpm up -r && pnpm audit --fix override  && pnpm up -r && pnpm lint-fix && pnpm build && pnpm install --no-frozen-lockfile); then
  cd "${CUR}" || exit
  exit 1
fi

cd "${CURRENT}" || exit
result=$?
if [ $result -ne 0 ]; then
  cd "${CUR}" || exit
  exit $result
fi

if ! (git commit -am "Bumps node modules" && git push); then
  cd "${CUR}" || exit
  exit 1
fi

cd "${CUR}" || exit
