#!/usr/bin/env bash
# Настройка remotes под переезд на GitHub (организация myunion-pro).
#
#   ./scripts/use-github-origin.sh add      — добавляет remote github (ничего не ломает)
#   ./scripts/use-github-origin.sh cutover — origin → только GitHub (после создания repo и первого push)
#
set -euo pipefail
GITHUB_SSH="git@github.com:myunion-pro/my-union-pro-ai.git"

case "${1:-add}" in
  add)
    if git remote get-url github &>/dev/null; then
      git remote set-url github "$GITHUB_SSH"
      echo "→ обновлён remote github → $GITHUB_SSH"
    else
      git remote add github "$GITHUB_SSH"
      echo "→ добавлен remote github → $GITHUB_SSH"
    fi
    ;;
  cutover)
    echo "→ origin переводится только на GitHub (Bitbucket через origin использоваться не будет)"
    git remote set-url origin "$GITHUB_SSH"
    ;;
  *)
    echo "Использование: $0 [add|cutover]" >&2
    exit 2
    ;;
esac
echo "Текущие remotes:"
git remote -v
