#!/usr/bin/env bash
#
# На VDS в .env.local выставляет актуальные строки каталога BestBenefits (MyUnion org API).
# Не трогает BB_PROFSOYUZY_TOKEN и остальные переменные.
#
# Запуск с локальной машины (тот же ключ, что у ./deploy.sh):
#   bash scripts/ensure-vds-bb-catalog-env.sh
#
# Переменные (опционально):
#   VDS_HOST VDS_USER VDS_SSH_KEY VDS_PATH
#
set -euo pipefail

VDS_HOST="${VDS_HOST:-79.143.29.66}"
VDS_USER="${VDS_USER:-root}"
VDS_SSH_KEY="${VDS_SSH_KEY:-$HOME/.ssh/myunion_vds}"
VDS_PATH="${VDS_PATH:-/opt/my-union-pro}"

if [[ ! -f "$VDS_SSH_KEY" ]]; then
  echo "❌ SSH ключ не найден: $VDS_SSH_KEY" >&2
  exit 1
fi

echo "📋 Обновление BB catalog env на $VDS_USER@$VDS_HOST:$VDS_PATH/.env.local"

ssh -i "$VDS_SSH_KEY" -o StrictHostKeyChecking=no "$VDS_USER@$VDS_HOST" \
  "VDS_PATH='$VDS_PATH'" bash -s <<'REMOTE'
set -euo pipefail
ENV="${VDS_PATH}/.env.local"
cd "$VDS_PATH"
touch "$ENV"
cp -a "$ENV" "${ENV}.bak.bb-catalog-$(date +%Y%m%d%H%M%S)"
tmp="$(mktemp)"
# Убираем старые строки каталога и маркер-блок (если уже добавляли скриптом)
grep -v '^BEST_BENEFITS_API_URL=' "$ENV" \
  | grep -v '^BESTBENEFITS_CATALOG_MAX_PAGES=' \
  | grep -v '^# --- BestBenefits catalog (MyUnion org API) ---$' \
  > "$tmp"
mv "$tmp" "$ENV"
printf '\n# --- BestBenefits catalog (MyUnion org API) ---\n' >> "$ENV"
printf 'BEST_BENEFITS_API_URL=https://bestbenefits.ru/api/myunion/products\n' >> "$ENV"
printf 'BESTBENEFITS_CATALOG_MAX_PAGES=500\n' >> "$ENV"
echo "✅ Записано: BEST_BENEFITS_API_URL, BESTBENEFITS_CATALOG_MAX_PAGES"
pm2 restart my-union-pro --update-env >/dev/null 2>&1 || true
pm2 restart my-union-socket --update-env >/dev/null 2>&1 || true
echo "✅ PM2 перезапущен (my-union-pro, my-union-socket)"
REMOTE

echo "✅ Готово."
