#!/bin/bash
# Обновление переменных BestBenefits на проде (VDS) без полного деплоя.
# Использование:
#   export VDS_PASSWORD='...'
#   export VDS_HOST='79.143.29.66'   # опционально
#   export BB_PROFSOYUZY_TOKEN='...'
#   bash scripts/update-bb-env-on-vds.sh
#
# Или передать из локального .env (только эти переменные):
#   set -a && source .env 2>/dev/null; set +a
#   bash scripts/update-bb-env-on-vds.sh

set -e

VDS_HOST="${VDS_HOST:-79.143.29.66}"
VDS_USER="${VDS_USER:-root}"
VDS_PASSWORD="${VDS_PASSWORD:-}"

if [ -z "$VDS_PASSWORD" ]; then
  if [ -f ".env" ]; then
    VDS_PASSWORD=$(grep -E '^VDS_PASSWORD=' .env 2>/dev/null | sed 's/^VDS_PASSWORD=//;s/^["'\'']//;s/["'\'']$//' | head -1)
  fi
fi

if [ -z "$VDS_PASSWORD" ]; then
  echo "❌ Установите VDS_PASSWORD (или добавьте в .env)"
  exit 1
fi

if [ -z "$BB_PROFSOYUZY_TOKEN" ] && [ -f ".env" ]; then
  BB_PROFSOYUZY_TOKEN=$(grep -E '^BB_PROFSOYUZY_TOKEN=' .env 2>/dev/null | sed 's/^BB_PROFSOYUZY_TOKEN=//;s/^["'\'']//;s/["'\'']$//' | head -1)
fi
# Достаточно одного BB_PROFSOYUZY_TOKEN для всех запросов к BestBenefits
if [ -z "$BB_PROFSOYUZY_TOKEN" ]; then
  echo "❌ Нужен BB_PROFSOYUZY_TOKEN (в .env или export)."
  exit 1
fi

TMP=$(mktemp)
trap 'rm -f "$TMP"' EXIT
echo "BB_PROFSOYUZY_TOKEN=$BB_PROFSOYUZY_TOKEN" > "$TMP"

echo "📤 Обновление BestBenefits env на ${VDS_USER}@${VDS_HOST}..."

sshpass -p "$VDS_PASSWORD" scp -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null "$TMP" "${VDS_USER}@${VDS_HOST}:/opt/my-union-pro/.bb_env_update"

sshpass -p "$VDS_PASSWORD" ssh -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null "${VDS_USER}@${VDS_HOST}" 'cd /opt/my-union-pro && \
  cp -a .env.local .env.local.bak.$(date +%Y%m%d%H%M%S) 2>/dev/null || true && \
  touch .env.local 2>/dev/null; (grep -v "^BB_PROFSOYUZY_TOKEN=" .env.local | grep -v "^BB_LOGIN=" | grep -v "^BB_PASSWORD=" || true) > .env.local.tmp && \
  cat .bb_env_update >> .env.local.tmp && \
  mv .env.local.tmp .env.local && \
  rm -f .bb_env_update && \
  echo "✅ .env.local обновлён" && \
  pm2 restart my-union-pro && \
  echo "✅ PM2 перезапущен"'

echo "✅ Готово. BestBenefits-переменные на проде обновлены, приложение перезапущено."
