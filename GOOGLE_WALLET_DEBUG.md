# 🐛 Отладка Google Wallet на Android

## Возможные проблемы:

### 1. Проверьте логи сервера
Когда нажимаете "Скачать" на Android, проверьте:
- Логи сервера в терминале
- Консоль браузера (F12) на Android устройстве
- Сетевые запросы в DevTools

### 2. Проверьте переменную окружения
Убедитесь что `GOOGLE_PAY_ISSUER_ID` в `.env.local` (не `.env`):
```bash
GOOGLE_PAY_ISSUER_ID=3388000000023063666
```

### 3. Проверьте права Service Account
- Google Wallet API должен быть включен
- Service Account должен иметь права

### 4. Типичные ошибки:

**401 Unauthorized:**
- Проблема с Service Account ключом
- Проверьте FIREBASE_PRIVATE_KEY

**403 Forbidden:**
- Недостаточно прав Service Account
- API не включен

**404 Not Found:**
- Неправильный Issuer ID
- API не включен

**500 Internal Server Error:**
- Ошибка в коде
- Проверьте логи сервера

## Что нужно проверить:

1. Откройте консоль браузера на Android (Chrome DevTools Remote Debugging)
2. Нажмите "Скачать"
3. Посмотрите:
   - Какой запрос отправляется на `/api/wallet/google-pass`
   - Какой ответ приходит
   - Есть ли ошибки в консоли

4. Проверьте логи сервера:
   - Есть ли ошибки при генерации пропуска
   - Успешно ли создается Loyalty Class
   - Успешно ли создается Loyalty Object

