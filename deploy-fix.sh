#!/bin/bash

LOG_FILE="/tmp/deploy-fix-$(date +%s).log"

echo "Starting server fix..." | tee "$LOG_FILE"

# Step 1: Check PM2 status
echo "" | tee -a "$LOG_FILE"
echo "=== Step 1: PM2 Status ===" | tee -a "$LOG_FILE"
sshpass -p 'wu,iMrZj6goZh?' ssh -o StrictHostKeyChecking=no root@194.87.49.210 "cd /opt/my-union-pro && pm2 status" 2>&1 | tee -a "$LOG_FILE"

# Step 2: Check logs
echo "" | tee -a "$LOG_FILE"
echo "=== Step 2: Recent Logs ===" | tee -a "$LOG_FILE"
sshpass -p 'wu,iMrZj6goZh?' ssh -o StrictHostKeyChecking=no root@194.87.49.210 "cd /opt/my-union-pro && pm2 logs my-union-pro --lines 15 --nostream" 2>&1 | tail -15 | tee -a "$LOG_FILE"

# Step 3: Restart PM2
echo "" | tee -a "$LOG_FILE"
echo "=== Step 3: Restarting PM2 ===" | tee -a "$LOG_FILE"
sshpass -p 'wu,iMrZj6goZh?' ssh -o StrictHostKeyChecking=no root@194.87.49.210 "cd /opt/my-union-pro && pm2 restart my-union-pro" 2>&1 | tee -a "$LOG_FILE"

# Step 4: Wait and check status
sleep 5
echo "" | tee -a "$LOG_FILE"
echo "=== Step 4: PM2 Status After Restart ===" | tee -a "$LOG_FILE"
sshpass -p 'wu,iMrZj6goZh?' ssh -o StrictHostKeyChecking=no root@194.87.49.210 "cd /opt/my-union-pro && pm2 status" 2>&1 | tee -a "$LOG_FILE"

# Step 5: Pull latest code and rebuild
echo "" | tee -a "$LOG_FILE"
echo "=== Step 5: Pulling Latest Code ===" | tee -a "$LOG_FILE"
sshpass -p 'wu,iMrZj6goZh?' ssh -o StrictHostKeyChecking=no root@194.87.49.210 "cd /opt/my-union-pro && git pull" 2>&1 | tee -a "$LOG_FILE"

echo "" | tee -a "$LOG_FILE"
echo "=== Step 6: Building Application ===" | tee -a "$LOG_FILE"
sshpass -p 'wu,iMrZj6goZh?' ssh -o StrictHostKeyChecking=no root@194.87.49.210 "cd /opt/my-union-pro && pnpm build" 2>&1 | tail -20 | tee -a "$LOG_FILE"

echo "" | tee -a "$LOG_FILE"
echo "=== Step 7: Final Restart ===" | tee -a "$LOG_FILE"
sshpass -p 'wu,iMrZj6goZh?' ssh -o StrictHostKeyChecking=no root@194.87.49.210 "cd /opt/my-union-pro && pm2 restart my-union-pro && sleep 3 && pm2 status" 2>&1 | tee -a "$LOG_FILE"

# Step 8: Test API
echo "" | tee -a "$LOG_FILE"
echo "=== Step 8: Testing API ===" | tee -a "$LOG_FILE"
sleep 3
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" https://myunion.pro/api/profile)
echo "API /api/profile HTTP Code: $HTTP_CODE" | tee -a "$LOG_FILE"

if [ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "401" ]; then
  echo "✅ Server is responding correctly!" | tee -a "$LOG_FILE"
else
  echo "⚠️ Server returned: $HTTP_CODE (may need more time to start)" | tee -a "$LOG_FILE"
fi

echo "" | tee -a "$LOG_FILE"
echo "=== Fix Complete ===" | tee -a "$LOG_FILE"
echo "Log saved to: $LOG_FILE" | tee -a "$LOG_FILE"
