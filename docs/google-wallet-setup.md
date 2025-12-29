# Настройка Google Wallet Integration

## Текущий статус

✅ **Установлено:**
- `GOOGLE_PAY_ISSUER_ID=3388000000023063666` в `.env.local`
- Зависимости установлены (`google-auth-library`, `jsonwebtoken`)
- Код интеграции реализован

❌ **Проблема:**
- Ошибка 401 (UNAUTHENTICATED) при попытке создать Loyalty Class
- Это означает проблему с аутентификацией Service Account

## Что нужно проверить в Google Cloud Console

### 1. Включить Google Pay Passes API

1. Перейдите в [Google Cloud Console](https://console.cloud.google.com/)
2. Выберите проект `myunion-c3187`
3. Перейдите в **APIs & Services** → **Library**
4. Найдите **"Google Pay Passes API"** или **"Wallet Objects API"**
5. Убедитесь, что API **включен** (Enabled)

### 2. Проверить права Service Account

1. Перейдите в **IAM & Admin** → **Service Accounts**
2. Найдите Service Account: `firebase-adminsdk-fbsvc@myunion-c3187.iam.gserviceaccount.com`
3. Убедитесь, что у него есть роль с правами на Wallet Objects API:
   - Минимум: **"Service Account User"**
   - Или: **"Wallet Objects API Admin"** (если доступна)

### 3. Проверить Issuer ID

1. Перейдите в [Google Pay & Wallet Console](https://pay.google.com/business/console)
2. Убедитесь, что Issuer ID `3388000000023063666` существует и активен
3. Проверьте, что Service Account связан с этим Issuer

### 4. Проверить Scope

Текущий scope: `https://www.googleapis.com/auth/wallet_object.issuer`

Это правильный scope для Google Pay Passes API.

## Тестирование

После настройки запустите тест:

```bash
pnpm dotenv -e .env.local -- tsx scripts/test-google-wallet.ts
```

## Возможные решения

Если проблема сохраняется:

1. **Создать новый Service Account специально для Google Wallet:**
   - Создайте новый Service Account в Google Cloud Console
   - Выдайте ему роль с правами на Wallet Objects API
   - Скачайте JSON ключ
   - Добавьте переменные в `.env.local`:
     - `GOOGLE_PAY_SERVICE_ACCOUNT_EMAIL=новый-email@project.iam.gserviceaccount.com`
     - `GOOGLE_PAY_SERVICE_ACCOUNT_KEY` (содержимое JSON ключа)

2. **Проверить, что Issuer ID правильный:**
   - Убедитесь, что Issuer ID соответствует вашему аккаунту в Google Pay Console

3. **Проверить, что API включен для правильного проекта:**
   - Убедитесь, что Google Pay Passes API включен именно для проекта `myunion-c3187`

