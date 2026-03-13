#!/bin/bash
set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT"
[ -f "$ROOT/vds.deploy.env" ] && source "$ROOT/vds.deploy.env"
if [ -z "$VDS_PASSWORD" ] && [ -f "$ROOT/.env" ]; then
  VDS_PASSWORD=$(grep -E '^VDS_PASSWORD=' "$ROOT/.env" 2>/dev/null | sed 's/^VDS_PASSWORD=//;s/^["'\'']//;s/["'\'']$//' | head -1)
fi
VDS_PASSWORD="${VDS_PASSWORD:?Set VDS_PASSWORD in vds.deploy.env or .env}"
sshpass -p "$VDS_PASSWORD" ssh -o StrictHostKeyChecking=no root@194.87.49.210 "cd /opt/my-union-pro && pnpm seed:reports"
