# 🚀 Быстрый старт: Google Pay Passes API

## ✅ Что уже сделано

1. ✅ Установлены необходимые библиотеки (`google-auth-library`, `jsonwebtoken`)
2. ✅ Создана утилита `lib/google-pay-passes.ts` для работы с API
3. ✅ Обновлен endpoint `/api/wallet/google-pass`
4. ✅ Интеграция с существующим Firebase Service Account

## 📝 Что нужно сделать ВАМ

### Шаг 1: Включить Google Pay Passes API (5 минут)

1. Откройте [Google Cloud Console](https://console.cloud.google.com/)
2. Выберите проект **`myunion-c3187`**
3. Перейдите в **APIs & Services** → **Library**
4. В поиске введите **"Google Wallet API"** или **"Google Pay Passes API"**
5. Нажмите **Enable**

### Шаг 2: Создать Issuer ID (10 минут)

1. Откройте [Google Pay Business Console](https://pay.google.com/business/console)
2. Войдите с аккаунтом, который имеет доступ к проекту `myunion-c3187`
3. Если Issuer Account еще не создан:
   - Нажмите **"Get Started"** или **"Create Issuer Account"**
   - Заполните информацию о вашей организации
   - Подтвердите email
4. После создания найдите **Issuer ID** (это число, например: `3388000000022`)
5. Скопируйте Issuer ID

### Шаг 3: Проверить права Service Account (2 минуты)

1. В [Google Cloud Console](https://console.cloud.google.com/) перейдите в **IAM & Admin** → **Service Accounts**
2. Найдите `firebase-adminsdk-fbsvc@myunion-c3187.iam.gserviceaccount.com`
3. Убедитесь, что у Service Account есть роль:
   - **Google Pay Passes API Admin** (рекомендуется) или
   - **Service Account Token Creator**
4. Если роли нет, нажмите **"Edit"** → **"Add Role"** → выберите нужную роль

### Шаг 4: Добавить переменную окружения (1 минута)

Добавьте в ваш `.env.local`:

```bash
GOOGLE_PAY_ISSUER_ID=ваш_issuer_id_здесь
```

**Пример (для MyUnion):**
```bash
GOOGLE_PAY_ISSUER_ID=3388000000023063666
```

### Шаг 5: Перезапустить сервер

```bash
pnpm dev
```

## 🧪 Тестирование

1. Откройте приложение на Android устройстве
2. Перейдите в **Мои скидки** → выберите любую скидку
3. Нажмите **"Скачать"**
4. Должно открыться окно Google Wallet для добавления пропуска

## ❌ Если что-то не работает

### Ошибка: "GOOGLE_PAY_ISSUER_ID is not set"
- Убедитесь, что добавили переменную в `.env.local`
- Перезапустите сервер

### Ошибка: "401 Unauthorized" или "403 Forbidden"
- Проверьте, что Google Pay Passes API включен
- Проверьте права Service Account
- Убедитесь, что `FIREBASE_PRIVATE_KEY` правильно настроен

### Ошибка: "Issuer ID not found"
- Проверьте правильность Issuer ID
- Убедитесь, что Issuer Account создан и активен

## 📚 Дополнительная информация

- Полная документация: `GOOGLE_PAY_SETUP.md`
- Конфигурация переменных: `ENV_CONFIGURATION.md`

## 🆘 Нужна помощь?

Если возникли проблемы:
1. Проверьте логи сервера
2. Проверьте консоль браузера (F12)
3. Убедитесь, что все шаги выполнены правильно

