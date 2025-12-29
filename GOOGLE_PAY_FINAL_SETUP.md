# ✅ Финальная настройка Google Pay Passes API

## ✅ Issuer ID получен

**Ваш Issuer ID:** `3388000000023063666`

## 📝 Шаг 1: Добавить переменную окружения

Добавьте в ваш `.env.local`:

```bash
GOOGLE_PAY_ISSUER_ID=3388000000023063666
```

**Важно:** Переменная должна быть добавлена именно в `.env.local`, не в другие файлы.

## 🔧 Шаг 2: Включить Google Pay Passes API

1. Откройте [Google Cloud Console](https://console.cloud.google.com/welcome?project=myunion-c3187)
2. Перейдите в **APIs & Services** → **Library**
3. В поиске введите: **"Google Wallet API"** или **"Google Pay Passes API"**
4. Нажмите на результат
5. Нажмите кнопку **"Enable"**

## 🔐 Шаг 3: Проверить права Service Account

1. В Google Cloud Console перейдите в **IAM & Admin** → **Service Accounts**
2. Найдите: `firebase-adminsdk-fbsvc@myunion-c3187.iam.gserviceaccount.com`
3. Убедитесь, что у Service Account есть роль:
   - **Google Pay Passes API Admin** (рекомендуется) или
   - **Service Account Token Creator**
4. Если роли нет:
   - Нажмите на Service Account
   - Перейдите на вкладку **"Permissions"** или **"IAM"**
   - Нажмите **"Grant Access"** или **"Add Principal"**
   - Добавьте роль **Google Pay Passes API Admin**

## 🚀 Шаг 4: Перезапустить сервер

После добавления переменной окружения перезапустите dev сервер:

```bash
# Остановите текущий сервер (Ctrl+C)
# Запустите заново:
pnpm dev
```

## 🧪 Шаг 5: Тестирование

1. Откройте приложение на Android устройстве (или эмуляторе)
2. Перейдите в **Мои скидки** (`/dashboard/discounts/my`)
3. Выберите любую скидку
4. Нажмите кнопку **"Скачать"**
5. Должно открыться окно Google Wallet для добавления пропуска

## ✅ Готово!

После выполнения всех шагов интеграция Google Pay будет работать. Пропуски будут автоматически добавляться в Google Wallet при нажатии "Скачать" на Android устройствах.

## ❌ Если что-то не работает

### Ошибка: "GOOGLE_PAY_ISSUER_ID is not set"
- Проверьте, что добавили переменную в `.env.local`
- Перезапустите сервер после добавления переменной

### Ошибка: "401 Unauthorized" или "403 Forbidden"
- Проверьте, что Google Pay Passes API включен в Google Cloud Console
- Проверьте права Service Account
- Убедитесь, что `FIREBASE_PRIVATE_KEY` правильно настроен

### Ошибка: "Issuer ID not found"
- Проверьте правильность Issuer ID: `3388000000023063666`
- Убедитесь, что Business Profile завершен в Google Pay Business Console

## 📚 Дополнительная информация

- Все файлы настроены и готовы к работе
- Код автоматически использует Issuer ID из переменной окружения
- Service Account уже настроен и используется из Firebase

