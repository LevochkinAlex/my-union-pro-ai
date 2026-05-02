#!/usr/bin/env bash
# Настройка remotes: единственный канал — GitHub org myunion-pro.
#
#   ./scripts/use-github-origin.sh add       — remote github → org (дополнительно к origin)
#   ./scripts/use-github-origin.sh cutover   — origin только на GitHub + удалить типичные legacy-remotes
#   ./scripts/use-github-origin.sh cleanup   — только удалить legacy-remotes (bitbucket, bb), origin не трогает
#
set -euo pipefail
GITHUB_SSH="git@github.com:myunion-pro/my-union-pro-ai.git"

remove_legacy_remotes() {
  for name in bitbucket bb; do
    if git remote get-url "$name" &>/dev/null; then
      git remote remove "$name"
      echo "→ удалён remote: $name"
    fi
  done
}

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
    echo "→ origin → $GITHUB_SSH"
    git remote set-url origin "$GITHUB_SSH"
    remove_legacy_remotes
    ;;
  cleanup)
    remove_legacy_remotes
    ;;
  *)
    echo "Использование: $0 [add|cutover|cleanup]" >&2
    exit 2
    ;;
esac
echo "Текущие remotes:"
git remote -v
