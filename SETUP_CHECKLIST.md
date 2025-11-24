# Чеклист установки проекта

## Обязательные шаги после клонирования проекта

### 1. Установка зависимостей

```bash
npm install
# или
pnpm install
```

### 2. ✅ КРИТИЧЕСКИ ВАЖНО: Установка Chromium для Puppeteer

```bash
npx puppeteer browsers install chrome
```

**Почему это необходимо:**
- Система генерирует PDF документы (заявления о вступлении и взносах) через Puppeteer
- Puppeteer требует Chromium для генерации PDF
- Без этого шага документы **НЕ БУДУТ ГЕНЕРИРОВАТЬСЯ**

**Признаки проблемы:**
- Пользователь заполняет профиль полностью
- Чат показывает "Профиль заполнен!"
- Но документы не появляются в разделе "Мои документы"

### 3. Настройка переменных окружения

```bash
cp .env.example .env.local
```

Заполните все необходимые переменные (см. `ENV_QUICKSTART.md`)

### 4. Настройка базы данных

```bash
# Сгенерировать Prisma Client
npx prisma generate

# Выполнить миграции
npx prisma migrate deploy

# (Опционально) Заполнить тестовыми данными
npx prisma db seed
```

### 5. Проверка установки

```bash
# Проверить что Chrome установлен
ls -la ~/.cache/puppeteer/

# Должно быть что-то вроде:
# chrome/
#   mac_arm-142.0.7444.61/
#   или
#   linux-142.0.7444.61/
```

### 6. Запуск приложения

```bash
npm run dev
```

### 7. Тест генерации документов

```bash
# Создайте тестового пользователя через интерфейс
# Затем проверьте генерацию:
pnpm tsx scripts/generate-documents-for-user.ts <email>
```

Если всё ок, увидите:

```
✅ Membership application: /uploads/documents/membership_..._xxx.pdf
✅ Contributions application: /uploads/documents/contributions_..._xxx.pdf
✅ Documents saved to database!
```

## Дополнительные настройки

### Redis (для очередей)

```bash
# macOS
brew install redis
brew services start redis

# Linux
sudo apt-get install redis-server
sudo systemctl start redis
```

### DaData (для валидации адресов)

Получите API ключ на https://dadata.ru и добавьте в `.env.local`:

```
DADATA_API_KEY=your_api_key
DADATA_SECRET_KEY=your_secret_key
```

### BestBenefits (для скидок)

Настройте интеграцию согласно `BESTBENEFITS_ACTIVATION_FINAL.md`

## Troubleshooting

### Проблема: Документы не генерируются

**Решение:**
```bash
npx puppeteer browsers install chrome
```

### Проблема: "Could not find Chrome"

**Причина:** Chrome не установлен или установлен неправильно

**Решение:**
```bash
# Удалить старый кеш
rm -rf ~/.cache/puppeteer/

# Установить заново
npx puppeteer browsers install chrome
```

### Проблема: PDF документы пустые или некорректные

**Причина:** Puppeteer не может правильно рендерить HTML

**Решение:**
- Проверьте что Chrome установлен правильно
- Проверьте логи в консоли
- Попробуйте сгенерировать документ вручную через скрипт

## Production Deployment

При деплое на production сервер не забудьте:

1. Установить Chrome:
```bash
npx puppeteer browsers install chrome
```

2. Установить системные зависимости для Chromium (Linux):
```bash
sudo apt-get install -y \
  libnss3 \
  libatk-bridge2.0-0 \
  libdrm2 \
  libxkbcommon0 \
  libgbm1 \
  libasound2
```

3. Настроить права доступа к директории uploads:
```bash
chmod -R 755 public/uploads
```

См. подробнее в `VDS_DEPLOY_INSTRUCTIONS.md`

