#!/usr/bin/env bash
#
# Единая точка деплоя проекта на прод-сервер.
#
# Использует SSH по ключу (никаких паролей в скриптах). Переменные:
#   VDS_HOST     — IP/hostname прод-сервера (по умолчанию 79.143.29.66)
#   VDS_SSH_KEY  — путь к SSH ключу (по умолчанию ~/.ssh/myunion_vds)
#   VDS_USER     — пользователь (по умолчанию root)
#   VDS_PATH     — путь к проекту (по умолчанию /opt/my-union-pro)
#
# Что делает:
# 1. git pull origin main (на проде)
# 2. pnpm install --frozen-lockfile (если изменился lockfile)
# 3. pnpm prisma generate
# 4. pnpm prisma migrate deploy (безопасно, только новые миграции)
# 5. rm -rf .next && pnpm build
# 6. pm2 restart my-union-pro && pm2 restart my-union-socket
# 7. Быстрый smoke-test по https
#
# Необходимо, чтобы git уже был синхронизирован с bitbucket (делайте
# commit+push заранее или используйте `./deploy.sh --push`).

set -euo pipefail

VDS_HOST="${VDS_HOST:-79.143.29.66}"
VDS_SSH_KEY="${VDS_SSH_KEY:-$HOME/.ssh/myunion_vds}"
VDS_USER="${VDS_USER:-root}"
VDS_PATH="${VDS_PATH:-/opt/my-union-pro}"

PUSH_FIRST=0
if [[ "${1:-}" == "--push" ]]; then
  PUSH_FIRST=1
fi

if [[ ! -f "$VDS_SSH_KEY" ]]; then
  echo "❌ SSH ключ не найден: $VDS_SSH_KEY" >&2
  exit 1
fi

ssh_cmd() {
  ssh -i "$VDS_SSH_KEY" -o StrictHostKeyChecking=no "$VDS_USER@$VDS_HOST" "$@"
}

echo "🚀 Deploy to $VDS_USER@$VDS_HOST:$VDS_PATH"

if [[ "$PUSH_FIRST" == "1" ]]; then
  echo "--- git push origin main ---"
  git push origin main
fi

# Кавычки у heredoc — иначе локальный bash подставляет \$CHROME_PATH и ломает set -u.
ssh_cmd env VDS_PATH="$VDS_PATH" bash -s <<'REMOTE'
set -e
cd "$VDS_PATH"

echo "--- git fetch/reset ---"
git fetch origin main
git reset --hard origin/main

if [ package.json -nt node_modules/.package-lock ] || [ pnpm-lock.yaml -nt node_modules/.package-lock ] || [ ! -d node_modules ]; then
  echo "--- pnpm install (lockfile changed) ---"
  pnpm install --frozen-lockfile 2>&1 | tail -5
else
  echo "--- pnpm install skipped (lockfile unchanged) ---"
fi

# Puppeteer не кладёт Chrome в node_modules — без скачанного браузера падают PDF (повестка/протокол профкома).
echo "--- Puppeteer Chrome (PDF) ---"
CHROME_PATH=$(node -e "try { console.log(require('puppeteer').executablePath()); } catch (e) { console.log(''); }" 2>/dev/null || true)
if [ -n "${CHROME_PATH:-}" ] && [ -x "$CHROME_PATH" ]; then
  echo "OK: $CHROME_PATH"
else
  echo "Браузер не найден, ставим: npx puppeteer browsers install chrome"
  npx puppeteer browsers install chrome 2>&1 | tail -25
fi

echo "--- prisma generate ---"
pnpm prisma generate 2>&1 | tail -3

echo "--- prisma migrate deploy ---"
pnpm prisma migrate deploy 2>&1 | tail -10

echo "--- build ---"
rm -rf .next
pnpm build 2>&1 | tail -6

echo "--- pm2 restart ---"
pm2 restart my-union-pro --update-env
pm2 restart my-union-socket --update-env
pm2 save

echo "--- pm2 list ---"
pm2 list | head -7
REMOTE

echo ""
echo "--- smoke test ---"
sleep 2
STATUS=$(curl -sI --max-time 15 "https://myunion.pro" | head -1 | awk '{print $2}')
echo "https://myunion.pro → HTTP $STATUS"
if [[ "$STATUS" == "200" ]]; then
  echo "✅ Deploy OK"
else
  echo "⚠️  Проверьте лог: pm2 logs my-union-pro"
  exit 1
fi
