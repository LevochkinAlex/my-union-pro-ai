# 🎫 Настройка Google Pay Passes API

## 📋 Что нужно для подключения

### 1. Google Cloud Console настройки

У вас уже есть:
- ✅ Google Cloud Project: `myunion-c3187`
- ✅ Service Account: `firebase-adminsdk-fbsvc@myunion-c3187.iam.gserviceaccount.com`
- ✅ Service Account ключ (в Firebase Admin)

### 2. Что нужно сделать

#### Шаг 1: Включить Google Pay Passes API

1. Перейдите в [Google Cloud Console](https://console.cloud.google.com/)
2. Выберите проект `myunion-c3187`
3. Перейдите в **APIs & Services** → **Library**
4. Найдите **"Google Pay Passes API"** или **"Google Wallet API"**
5. Нажмите **Enable**

#### Шаг 2: Создать Issuer ID

1. Перейдите на [Google Pay Business Console](https://pay.google.com/business/console)
2. Войдите с аккаунтом, который имеет доступ к проекту `myunion-c3187`
3. Создайте новый Issuer Account (если еще не создан)
4. Скопируйте **Issuer ID** (обычно это число, например: `3388000000023063666`)

#### Шаг 3: Настроить Service Account

1. В Google Cloud Console перейдите в **IAM & Admin** → **Service Accounts**
2. Найдите `firebase-adminsdk-fbsvc@myunion-c3187.iam.gserviceaccount.com`
3. Убедитесь, что у Service Account есть роль:
   - **Google Pay Passes API Admin** или
   - **Service Account Token Creator**

#### Шаг 4: Добавить переменные окружения

Добавьте в `.env.local`:

```bash
# Google Pay Passes API
GOOGLE_PAY_ISSUER_ID=3388000000023063666
GOOGLE_PAY_SERVICE_ACCOUNT_EMAIL=firebase-adminsdk-fbsvc@myunion-c3187.iam.gserviceaccount.com
GOOGLE_PAY_PROJECT_ID=myunion-c3187
```

**Примечание:** Service Account ключ уже используется из Firebase Admin, но если нужен отдельный ключ:
1. Создайте новый ключ в Service Account
2. Сохраните JSON файл
3. Добавьте путь к файлу в `.env.local`:
   ```bash
   GOOGLE_PAY_SERVICE_ACCOUNT_KEY_PATH=/path/to/service-account-key.json
   ```

## 🔧 Установка зависимостей

```bash
pnpm add google-auth-library
```

## 📝 Структура пропуска (Pass)

Google Pay Passes API поддерживает несколько типов пропусков:
- **Loyalty** - для скидок и бонусных программ
- **Offer** - для предложений и акций
- **Gift Card** - для подарочных карт
- **Event Ticket** - для билетов

Для скидок лучше всего подходит тип **Loyalty** или **Offer**.

## 🚀 Использование

После настройки API будет автоматически работать при нажатии на "Скачать" на Android устройствах.

## 📚 Дополнительные ресурсы

- [Google Pay Passes API Documentation](https://developers.google.com/wallet/generic/rest)
- [Google Pay Business Console](https://pay.google.com/business/console)
- [Google Cloud Console](https://console.cloud.google.com/)

