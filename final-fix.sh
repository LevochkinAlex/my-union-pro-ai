#!/bin/bash
# Final fix script - run this on the server

cd /opt/my-union-pro

echo "=========================================="
echo "FIXING SERVER - Step by Step"
echo "=========================================="

echo ""
echo "Step 1: Stopping application..."
pm2 delete my-union-pro 2>&1
sleep 2

echo ""
echo "Step 2: Pulling latest code..."
git pull 2>&1 | head -10

echo ""
echo "Step 3: Checking version in package.json..."
grep '"version"' package.json

echo ""
echo "Step 4: Installing dependencies..."
pnpm install --frozen-lockfile 2>&1 | tail -5

echo ""
echo "Step 5: Building application (this embeds version)..."
pnpm build 2>&1 | tail -30

echo ""
echo "Step 6: Starting application..."
pm2 start npm --name my-union-pro -- start
sleep 10

echo ""
echo "Step 7: PM2 Status..."
pm2 list

echo ""
echo "Step 8: Recent logs..."
pm2 logs my-union-pro --lines 20 --nostream 2>&1 | tail -20

echo ""
echo "Step 9: Testing local API..."
sleep 3
curl -s -o /dev/null -w "HTTP Status: %{http_code}\n" http://localhost:3004/api/profile 2>&1

echo ""
echo "=========================================="
echo "FIX COMPLETE"
echo "=========================================="
