# 🎫 Настройка Google Pay Issuer ID

## Текущая ситуация

В Google Pay Business Console у вас открыт проект:
- **Название:** YAPPIX LLC
- **Merchant ID / Issuer ID:** `BCR2DN5T7354ZQB7`

## Решение: Использовать существующий Issuer ID

Если этот Issuer ID подходит для MyUnion (или если YAPPIX LLC = ваша организация для MyUnion), вы можете использовать его:

### Шаг 1: Добавить в .env.local

```bash
GOOGLE_PAY_ISSUER_ID=BCR2DN5T7354ZQB7
```

### Шаг 2: Завершить Business Profile

1. В Google Pay Business Console нажмите на карточку "Business profile" с тегом "Incomplete"
2. Заполните всю необходимую информацию о бизнесе
3. Сохраните изменения

### Шаг 3: Включить Google Pay Passes API в Google Cloud Console

1. Откройте Google Cloud Console: https://console.cloud.google.com/welcome?project=myunion-c3187
2. Перейдите в **APIs & Services** → **Library**
3. Найдите **"Google Wallet API"** или **"Google Pay Passes API"**
4. Нажмите **Enable**

### Шаг 4: Проверить права Service Account

1. В Google Cloud Console перейдите в **IAM & Admin** → **Service Accounts**
2. Найдите `firebase-adminsdk-fbsvc@myunion-c3187.iam.gserviceaccount.com`
3. Убедитесь, что у него есть роль **Google Pay Passes API Admin**

### Шаг 5: Перезапустить сервер

```bash
pnpm dev
```

## Альтернатива: Создать новый Issuer Account

Если нужен отдельный Issuer Account для MyUnion:

1. В Google Pay Business Console нажмите на название проекта в правом верхнем углу
2. Выберите "Add account" или "Switch account" → "Create new account"
3. Заполните информацию для MyUnion
4. Скопируйте новый Issuer ID
5. Используйте его в `.env.local`

## Проверка работы

После настройки при нажатии "Скачать" на Android устройстве должен открыться Google Wallet для добавления пропуска.

