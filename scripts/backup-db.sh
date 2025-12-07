#!/bin/bash
# Ежедневный бэкап базы данных
# Добавить в cron: 0 3 * * * /opt/my-union-pro/scripts/backup-db.sh

BACKUP_DIR="/opt/backups/db"
DATE=$(date +%Y-%m-%d_%H-%M)
DB_NAME="myunionpro"

# Создать директорию если не существует
mkdir -p $BACKUP_DIR

# Создать бэкап
pg_dump -U postgres $DB_NAME | gzip > "$BACKUP_DIR/backup_$DATE.sql.gz"

# Удалить бэкапы старше 30 дней
find $BACKUP_DIR -name "backup_*.sql.gz" -mtime +30 -delete

echo "✅ Backup created: $BACKUP_DIR/backup_$DATE.sql.gz"

