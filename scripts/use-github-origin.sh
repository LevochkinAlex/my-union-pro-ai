#!/usr/bin/env bash
# Переключить origin на репозиторий организации GitHub (без Bitbucket).
set -euo pipefail
GITHUB_SSH="git@github.com:myunion-pro/my-union-pro-ai.git"
echo "→ git remote set-url origin $GITHUB_SSH"
git remote set-url origin "$GITHUB_SSH"
echo "→ remotes:"
git remote -v
