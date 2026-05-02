#!/usr/bin/env bash
# Создание центрального репозитория в организации myunion-pro.
# Перед запуском: авторизация с правом создания repo в org, например:
#   gh auth login
#
# Или неинтерактивно (PAT со scope repo + write:org при необходимости):
#   echo "$GH_PAT" | gh auth login --hostname github.com --with-token
#
set -euo pipefail
ORG="myunion-pro"
NAME="my-union-pro-ai"
DESC="МойСоюз — платформа профсоюзных организаций (myunion.pro)"

if ! gh auth status >/dev/null 2>&1; then
  echo "Сначала: gh auth login   (нет активной авторизации gh)" >&2
  exit 1
fi

if gh repo view "${ORG}/${NAME}" >/dev/null 2>&1; then
  echo "Уже есть: https://github.com/${ORG}/${NAME}"
  exit 0
fi

gh repo create "${ORG}/${NAME}" \
  --private \
  --description "${DESC}"

echo ""
echo "Создано: https://github.com/${ORG}/${NAME}"
echo ""
echo "Дальше с локальной копией проекта:"
echo "  ./scripts/use-github-origin.sh add"
echo "  git push -u github main"
echo "На VDS смените origin — см. DEPLOY-CHECKLIST.md"
