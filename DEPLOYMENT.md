# Инструкция по развёртыванию MyUnion Pro

> **Актуально на:** 7 декабря 2025  
> **Сервер:** VDS Ubuntu 24.04 (Timeweb Cloud)  
> **Домен:** myunion.pro

---

## Требования к серверу

- **ОС:** Ubuntu 24.04 LTS
- **RAM:** минимум 2 GB
- **Диск:** минимум 20 GB
- **SSH:** доступ по ключам (пароль отключён)
- **IP:** 194.87.49.210

---

## 1. Подготовка SSH ключей

### На локальной машине:

```bash
# Генерация ключа для подключения к VDS
ssh-keygen -t ed25519 -C "myunion-vds" -f ~/.ssh/myunion_vds -N ""

# Публичный ключ для Timeweb панели:
cat ~/.ssh/myunion_vds.pub
```

### На сервере (генерация ключа для GitHub):

```bash
ssh-keygen -t ed25519 -C "myunion-server" -f ~/.ssh/github_deploy -N ""
cat ~/.ssh/github_deploy.pub
```

Добавьте этот ключ в GitHub: Settings → SSH and GPG keys

---

## 2. Установка необходимого ПО

```bash
# Подключение к серверу
ssh -i ~/.ssh/myunion_vds root@194.87.49.210

# Обновление системы
apt-get update && apt-get upgrade -y

# Установка базового ПО
apt-get install -y curl git nginx postgresql postgresql-contrib certbot python3-certbot-nginx

# Установка Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs

# Установка pnpm и PM2
npm install -g pnpm pm2
```

---

## 3. Настройка PostgreSQL

```bash
# Создание пользователя и базы данных
sudo -u postgres psql << EOF
CREATE USER myunion_user WITH PASSWORD 'MyUnion2024SecurePass!';
CREATE DATABASE myunion_db OWNER myunion_user;
GRANT ALL PRIVILEGES ON DATABASE myunion_db TO myunion_user;
\q
EOF

# Проверка
sudo -u postgres psql -l | grep myunion
```

---

## 4. Клонирование репозитория

```bash
# Настройка SSH для GitHub
eval "$(ssh-agent -s)"
ssh-add ~/.ssh/github_deploy
git config --global core.sshCommand "ssh -i ~/.ssh/github_deploy"

# Клонирование
cd /opt
git clone git@github.com:usmanoffcom/my-union-pro-ai.git my-union-pro
cd my-union-pro
```

---

## 5. Настройка .env.local

Создайте файл `/opt/my-union-pro/.env.local`:

```env
# Database
DATABASE_URL="postgresql://myunion_user:MyUnion2024SecurePass!@localhost:5432/myunion_db"

# NextAuth
NEXTAUTH_URL="https://myunion.pro"
NEXTAUTH_SECRET="your-secret-key-here"

# VDS Storage (локальный режим - прямая запись без SSH)
VDS_IS_LOCAL=true

# Email (если используется)
SMTP_HOST="smtp.example.com"
SMTP_PORT=587
SMTP_USER="your-email@example.com"
SMTP_PASSWORD="your-password"

# AI (если используется)
OPENAI_API_KEY="sk-..."
GOOGLE_CUSTOM_SEARCH_API_KEY="..."
GOOGLE_CUSTOM_SEARCH_ENGINE_ID="..."

# Firebase (если используется)
NEXT_PUBLIC_FIREBASE_API_KEY="..."
# ... другие переменные
```

---

## 6. Сборка и запуск

```bash
cd /opt/my-union-pro

# Установка зависимостей
pnpm install

# Генерация Prisma Client
npx prisma generate

# Применение миграций (если нужно)
npx prisma migrate deploy

# Сборка production версии
NODE_OPTIONS="--max-old-space-size=2048" pnpm build

# Запуск через PM2
pm2 start npm --name "my-union-pro" -- start -- -p 3004
pm2 save
pm2 startup

# Проверка
pm2 status
curl http://localhost:3004
```

---

## 7. Настройка Nginx + SSL

### Создайте конфигурацию nginx:

```bash
cat > /etc/nginx/sites-available/myunion << 'NGINX'
server {
    listen 80;
    server_name myunion.pro www.myunion.pro;

    location / {
        proxy_pass http://127.0.0.1:3004;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 86400;
    }

    client_max_body_size 100M;
    
    # Security headers
    add_header X-Content-Type-Options "nosniff";
    add_header X-Frame-Options "DENY";
    add_header X-XSS-Protection "1; mode=block";
    add_header Referrer-Policy "no-referrer-when-downgrade";
}
NGINX

# Активация конфигурации
ln -sf /etc/nginx/sites-available/myunion /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default

# Проверка и перезагрузка
nginx -t
systemctl reload nginx
```

### Получите SSL сертификат:

```bash
certbot --nginx \
  -d myunion.pro \
  -d www.myunion.pro \
  --non-interactive \
  --agree-tos \
  -m ceo@yappix.ru \
  --redirect
```

---

## 8. Безопасность SSH

### Отключите вход по паролю:

```bash
# Резервная копия
cp /etc/ssh/sshd_config /etc/ssh/sshd_config.backup

# Отключаем пароли
sed -i 's/PasswordAuthentication yes/PasswordAuthentication no/' /etc/ssh/sshd_config
sed -i 's/#PasswordAuthentication yes/PasswordAuthentication no/' /etc/ssh/sshd_config

# Проверка и применение
sshd -t
systemctl reload sshd
```

**⚠️ ВАЖНО:** Убедитесь, что SSH ключ работает ДО отключения паролей!

```bash
# Тест с локальной машины:
ssh -i ~/.ssh/myunion_vds root@194.87.49.210 'echo "SSH KEY WORKS!"'
```

---

## 9. Восстановление из бэкапа

Если нужно восстановить данные после переустановки:

```bash
# На локальной машине - загрузка бэкапа на сервер
scp -i ~/.ssh/myunion_vds backups/backup_myunion/* root@194.87.49.210:/tmp/

# На сервере
cd /opt/my-union-pro

# Восстановление базы данных
sudo -u postgres psql myunion_db < /tmp/database.sql

# Восстановление файлов
cd /opt/my-union-pro/public
tar -xzf /tmp/uploads.tar.gz

# Перезапуск
pm2 restart my-union-pro
```

---

## 10. Обновление приложения (после изменений)

```bash
# Локально - пуш изменений
git add -A
git commit -m "Описание изменений"
git push

# На сервере
ssh -i ~/.ssh/myunion_vds root@194.87.49.210

cd /opt/my-union-pro
git pull
pnpm install
pnpm build
pm2 restart my-union-pro
```

---

## Полезные команды

### Просмотр логов:

```bash
pm2 logs my-union-pro --lines 100
pm2 logs my-union-pro --lines 100 --err  # Только ошибки
```

### Мониторинг:

```bash
pm2 monit
pm2 status
```

### Перезапуск:

```bash
pm2 restart my-union-pro
pm2 reload my-union-pro  # Без downtime
```

### Проверка статуса:

```bash
# Nginx
systemctl status nginx
nginx -t

# PostgreSQL
systemctl status postgresql
sudo -u postgres psql -l

# SSL сертификат
certbot certificates
```

---

## Резервное копирование

### Создание бэкапа:

```bash
cd /tmp
mkdir backup_myunion

# База данных
sudo -u postgres pg_dump myunion_db > backup_myunion/database.sql

# Файлы
tar -czf backup_myunion/uploads.tar.gz -C /opt/my-union-pro/public uploads

# .env.local
cp /opt/my-union-pro/.env.local backup_myunion/

# Скачать на локальную машину
scp -i ~/.ssh/myunion_vds -r root@194.87.49.210:/tmp/backup_myunion ./backups/
```

---

## Безопасность

### Регулярные обновления:

```bash
apt-get update && apt-get upgrade -y
```

### Мониторинг вторжений:

```bash
# Проверка последних входов
last | head -20

# Проверка подозрительных процессов
ps aux | grep -E "cpu|mem" | sort -k3 -r | head -10

# Проверка изменённых системных файлов
find /usr/bin -type f -size +5M -ls
```

### Если обнаружен взлом:

1. **Немедленно отключите сервер от сети**
2. **Сделайте бэкап данных** (база, uploads)
3. **Переустановите систему** в панели Timeweb
4. **Восстановите из бэкапа** (см. раздел 9)
5. **Смените ВСЕ пароли** (база данных, API ключи)

---

## Контакты

**Сервер:** 194.87.49.210  
**Домен:** https://myunion.pro  
**Email:** ceo@yappix.ru  
**GitHub:** https://github.com/usmanoffcom/my-union-pro-ai

---

## История изменений

- **7 декабря 2025:** Переустановка сервера после взлома криптомайнером "Titan"
- Настроен SSH только по ключам (пароли отключены)
- VDS Storage настроен на прямую запись (VDS_IS_LOCAL=true)
- SSL сертификат получен через Let's Encrypt

