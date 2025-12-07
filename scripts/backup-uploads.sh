#!/bin/bash
# Ежедневный бэкап файлов uploads
# Добавить в cron: 0 4 * * * /opt/my-union-pro/scripts/backup-uploads.sh

BACKUP_DIR="/opt/backups/uploads"
UPLOADS_DIR="/opt/my-union-pro/public/uploads"
DATE=$(date +%Y-%m-%d_%H-%M)

# Создать директорию если не существует
mkdir -p $BACKUP_DIR

# Создать архив
tar -czf "$BACKUP_DIR/uploads_$DATE.tar.gz" -C /opt/my-union-pro/public uploads

# Удалить бэкапы старше 14 дней
find $BACKUP_DIR -name "uploads_*.tar.gz" -mtime +14 -delete

echo "✅ Uploads backup created: $BACKUP_DIR/uploads_$DATE.tar.gz"

