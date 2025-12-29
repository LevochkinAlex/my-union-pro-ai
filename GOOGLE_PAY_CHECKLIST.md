# ✅ Чеклист настройки Google Pay Passes API

## ✅ Выполнено:

- [x] Business Profile завершен и одобрен в Google Pay Business Console
- [x] Issuer ID получен: `3388000000023063666`
- [x] Переменная `GOOGLE_PAY_ISSUER_ID` добавлена в `.env`

## 📋 Осталось сделать:

### 1. Включить Google Pay Passes API в Google Cloud Console

1. Откройте [Google Cloud Console](https://console.cloud.google.com/welcome?project=myunion-c3187)
2. Перейдите: **APIs & Services** → **Library**
3. В поиске введите: **"Google Wallet API"** или **"Google Pay Passes API"**
4. Нажмите **Enable**

### 2. Проверить права Service Account

1. В Google Cloud Console: **IAM & Admin** → **Service Accounts**
2. Найдите: `firebase-adminsdk-fbsvc@myunion-c3187.iam.gserviceaccount.com`
3. Убедитесь, что есть роль: **Google Pay Passes API Admin**
4. Если нет — добавьте эту роль

### 3. Перезапустить сервер

Если сервер уже запущен, перезапустите его чтобы подхватить переменную окружения:

```bash
# Остановите (Ctrl+C) и запустите заново:
pnpm dev
```

### 4. Проверить работу

1. Откройте приложение на Android устройстве
2. Перейдите в **Мои скидки** (`/dashboard/discounts/my`)
3. Выберите любую скидку
4. Нажмите **"Скачать"**
5. Должно открыться окно Google Wallet для добавления пропуска

## 🎉 Готово!

После выполнения этих шагов интеграция будет полностью работать.

