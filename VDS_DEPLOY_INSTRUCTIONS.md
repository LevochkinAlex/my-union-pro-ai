# 🚀 Инструкция по деплою на VDS

## 📋 Данные подключения

- **Host:** `root@194.87.49.210`
- **Password:** `sAt,8?Bh+Ny_BW`
- **Путь на сервере:** `/opt/my-union-pro`
- **PM2 процесс:** `my-union-pro`
- **Домен:** `myunion.pro`

## 🔧 Настройка перед первым деплоем

## 🌐 Текущий статус

- ✅ **Приложение развернуто** на сервере через PM2
- ✅ **Домен:** https://myunion.pro
- ✅ **Путь на сервере:** `/opt/my-union-pro`
- ✅ **PM2 процесс:** `my-union-pro`

## 🔧 Настройка перед первым деплоем

### 1. Установите sshpass (для автоматического ввода пароля)

**macOS:**
```bash
brew install hudochenkov/sshpass/sshpass
```

**Linux:**
```bash
apt-get install sshpass
```

### 2. Конфигурация сохранена

SSH данные сохранены в `.deploy/vds-config.sh` (не коммитится в git).

Если нужно изменить путь деплоя или другие параметры, отредактируйте этот файл.

## 🚀 Быстрый деплой

```bash
./scripts/deploy-to-vds.sh
```

Скрипт автоматически:
1. ✅ Загрузит конфигурацию из `.deploy/vds-config.sh`
2. ✅ Проверит SSH подключение
3. ✅ Подключится к серверу
4. ✅ Обновит код из репозитория
5. ✅ Установит зависимости
6. ✅ Обновит Prisma схему
7. ✅ Соберет приложение
8. ✅ Перезапустит приложение (PM2/systemd/Docker)

## 📝 Ручной деплой (если нужен другой путь или ветка)

```bash
./scripts/deploy-to-vds.sh root@194.87.49.210 /path/to/project main
```

## 🔍 Проверка после деплоя

### Проверить логи PM2:
```bash
ssh root@194.87.49.210 'pm2 logs my-union-pro'
```

### Проверить статус PM2:
```bash
ssh root@194.87.49.210 'pm2 status'
```

### Проверить информацию о процессе:
```bash
ssh root@194.87.49.210 'pm2 info my-union-pro'
```

### Проверить systemd:
```bash
ssh root@194.87.49.210 'sudo systemctl status my-union-pro'
```

### Проверить логи systemd:
```bash
ssh root@194.87.49.210 'sudo journalctl -u my-union-pro -f'
```

## 🛠️ Первоначальная настройка на сервере (если еще не сделано)

### 1. Подключитесь к серверу:
```bash
ssh root@194.87.49.210
```

### 2. Установите необходимые инструменты:
```bash
# Node.js (если еще не установлен)
curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
apt-get install -y nodejs

# pnpm
npm install -g pnpm

# PM2 (для управления процессами)
npm install -g pm2

# Git (если еще не установлен)
apt-get install -y git
```

### 3. Клонируйте репозиторий (если еще не клонирован):
```bash
cd /opt
git clone https://github.com/usmanoffcom/my-union-pro-ai.git my-union-pro
cd my-union-pro
```

**Примечание:** На сервере проект уже развернут в `/opt/my-union-pro` и работает через PM2.

### 4. Создайте `.env.production` файл:
```bash
nano .env.production
```

Добавьте все необходимые переменные окружения (DATABASE_URL, NEXTAUTH_SECRET, и т.д.)

### 5. Установите зависимости и соберите:
```bash
pnpm install
npx prisma generate
pnpm run build
```

### 6. Запустите приложение через PM2:
```bash
pm2 start npm --name "my-union-pro" -- start
pm2 save
pm2 startup  # Следуйте инструкциям для автозапуска
```

**Примечание:** На сервере приложение уже запущено через PM2 с именем `my-union-pro`.

## 🔐 Безопасность

⚠️ **Важно:** 
- Файл `.deploy/vds-config.sh` не коммитится в git (добавлен в `.gitignore`)
- Пароль хранится в открытом виде локально, но не передается в репозиторий
- Для production рекомендуется использовать SSH ключи вместо паролей

### Настройка SSH ключей (рекомендуется):

```bash
# На локальной машине
ssh-copy-id root@194.87.49.210

# Затем удалите VDS_PASSWORD из .deploy/vds-config.sh
```

