# 🚀 Руководство по деплою МойСоюз v1.5.0

## 📋 Что реализовано

### ✅ 2FA Аутентификация:

**Каналы доставки PIN-кодов:**
1. **Telegram Bot** (Приоритет 1) - Бесплатно, без лимитов 📱
2. **WhatsApp Business** (Приоритет 2) - 1000 бесплатно/месяц 💬

**SMS отключен** - слишком дорого для старта

---

## 🎯 Преимущества:

- ✅ **100% бесплатно** для первых 1000 пользователей/месяц
- ✅ **Мгновенная доставка** кодов
- ✅ **Умный fallback** - если Telegram не привязан, используется WhatsApp
- ✅ **Популярные каналы** - Telegram и WhatsApp активно используются в России

---

## 📝 Checklist перед деплоем

### 1️⃣ Переменные окружения

Добавьте в `.env` на проде:

```env
# Telegram Bot
TELEGRAM_BOT_TOKEN=8321416024:AAGKjoe4tL_OCe1xysXx0sMfMf8RTMsGnlo
TELEGRAM_BOT_USERNAME=myunionpro_bot

# SendPulse (WhatsApp)
SENDPULSE_USER_ID=92d73a0d4d7eac351eb5c90b418cd3d8
SENDPULSE_SECRET=5e28be602856d3d1e390e56bdce95ca7
```

### 2️⃣ База данных

Примените миграцию:

```bash
pnpm prisma db push
```

**Новые поля в модели `User`:**
- `telegramChatId` - Chat ID для отправки PIN-кодов
- `telegramUsername` - Username пользователя (для справки)

### 3️⃣ Код

Закоммитьте и запушьте изменения:

```bash
git add .
git commit -m "feat: add 2FA via Telegram and WhatsApp (v1.5.0)"
git push origin main
```

---

## 🔧 Настройка после деплоя

### 1️⃣ Telegram Webhook

После того как сайт задеплоен на `https://myunion.pro`:

```bash
curl -X POST "https://api.telegram.org/bot8321416024:AAGKjoe4tL_OCe1xysXx0sMfMf8RTMsGnlo/setWebhook" \
  -d "url=https://myunion.pro/api/telegram/webhook"
```

**Проверка webhook:**

```bash
curl "https://api.telegram.org/bot8321416024:AAGKjoe4tL_OCe1xysXx0sMfMf8RTMsGnlo/getWebhookInfo"
```

**Ожидаемый ответ:**
```json
{
  "ok": true,
  "result": {
    "url": "https://myunion.pro/api/telegram/webhook",
    "has_custom_certificate": false,
    "pending_update_count": 0
  }
}
```

### 2️⃣ Проверка WhatsApp

Убедитесь, что WhatsApp Business активен в SendPulse:

1. Откройте: https://login.sendpulse.com/messengers/bots/whatsapp/
2. Проверьте статус: должен быть **"Активен"** или **"Active"**
3. Если нет - дождитесь верификации от Facebook (1-2 дня)

---

## 🧪 Тестирование после деплоя

### Тест 1: Вход с Telegram

1. Откройте `https://myunion.pro/login`
2. Введите номер телефона
3. Если Telegram привязан:
   - ✅ Код должен прийти в Telegram за 1-2 секунды
4. Если не привязан:
   - Покажется кнопка "Привязать Telegram"
   - После привязки код придет в Telegram

### Тест 2: Вход через WhatsApp (если Telegram не привязан)

1. Откройте `https://myunion.pro/login`
2. Введите номер телефона (без привязанного Telegram)
3. Система отправит код в WhatsApp
4. ✅ Код должен прийти в WhatsApp за 5-10 секунд

### Тест 3: Привязка Telegram

1. При входе нажмите "Привязать Telegram"
2. Откроется бот `@myunionpro_bot`
3. Нажмите `/start`
4. Вернитесь на сайт
5. Повторите запрос кода
6. ✅ Теперь код должен приходить в Telegram

---

## 📊 Мониторинг

### Логи сервера

Все события 2FA логируются с префиксом `[2FA Auth]`:

```bash
# Просмотр логов (Docker)
docker logs -f myunion-app | grep "2FA Auth"

# Успешная доставка
[2FA Auth] ✅ PIN-код успешно отправлен через Telegram

# Fallback на WhatsApp
[2FA Auth] Попытка отправки через WhatsApp на номер: +79991234567
[2FA Auth] ✅ PIN-код успешно отправлен через WhatsApp

# Ошибки
[2FA Auth] ❌ Telegram не сработал: Chat ID не найден
[2FA Auth] ❌ WhatsApp не сработал: [детали ошибки]
```

### SendPulse Dashboard

Отслеживайте статистику:

1. **WhatsApp:** https://login.sendpulse.com/messengers/bots/whatsapp/
   - Количество отправленных сообщений
   - Лимит: 1000/месяц бесплатно
   - После 1000: ~0.5-2 руб/сообщение

2. **Статистика по боту:**
   - Доставленные/прочитанные
   - Ошибки доставки

---

## 🔧 Troubleshooting

### Проблема 1: PIN-код не приходит в Telegram

**Причина:** Webhook не настроен или недоступен

**Решение:**
```bash
# Проверьте webhook
curl "https://api.telegram.org/bot8321416024:AAGKjoe4tL_OCe1xysXx0sMfMf8RTMsGnlo/getWebhookInfo"

# Если URL неправильный, настройте заново
curl -X POST "https://api.telegram.org/bot8321416024:AAGKjoe4tL_OCe1xysXx0sMfMf8RTMsGnlo/setWebhook" \
  -d "url=https://myunion.pro/api/telegram/webhook"
```

### Проблема 2: PIN-код не приходит в WhatsApp

**Причина:** WhatsApp Business не активен в SendPulse

**Решение:**
1. Проверьте статус: https://login.sendpulse.com/messengers/bots/whatsapp/
2. Если "не активен" - дождитесь верификации от Facebook
3. Пока ждете - пользователи могут привязать Telegram

### Проблема 3: Кнопка "Привязать Telegram" не работает

**Причина:** Deep link неправильно сформирован

**Решение:**
1. Проверьте переменную `TELEGRAM_BOT_USERNAME` в `.env`
2. Должна быть: `myunionpro_bot`
3. Перезапустите приложение

### Проблема 4: Оба канала не работают

**Причина:** Неправильные API ключи или сетевые проблемы

**Решение:**
1. Проверьте логи: `docker logs -f myunion-app | grep "2FA Auth"`
2. Проверьте переменные окружения на проде
3. Убедитесь, что сервер может делать исходящие HTTPS запросы

---

## 💰 Стоимость

### Текущая конфигурация (Telegram + WhatsApp):

**Сценарий для 1000 пользователей/месяц:**

| Канал | Доля | Количество | Стоимость | Итого |
|-------|------|------------|-----------|-------|
| Telegram | 70% | 700 | 0 руб | **0 руб** |
| WhatsApp | 30% | 300 | 0 руб* | **0 руб** |
| **ИТОГО** | | **1000** | | **0 руб/месяц** |

\* *В лимите 1000 бесплатных сообщений SendPulse*

### После 1000 пользователей/месяц:

WhatsApp станет платным (~0.5-2 руб/сообщение после лимита)

**Рекомендация:** Мотивировать пользователей привязывать Telegram!

**Способы:**
- При входе показывать: "Привяжите Telegram для мгновенного получения кодов"
- В профиле: "Telegram привязан ✅" / "Привязать Telegram 📱"
- После первого входа: "Хотите получать коды моментально? Привяжите Telegram!"

---

## 📈 Метрики для отслеживания

### Ключевые показатели:

1. **Распределение по каналам:**
   - % пользователей с привязанным Telegram
   - % входов через Telegram
   - % входов через WhatsApp

2. **Конверсия:**
   - % пользователей, получивших код
   - % пользователей, успешно вошедших
   - Среднее время от запроса до входа

3. **Стоимость:**
   - Количество сообщений WhatsApp/месяц
   - Близость к лимиту (1000)
   - Прогноз превышения лимита

### Рекомендуемые actions:

**Если WhatsApp приближается к лимиту (>800/месяц):**
- Активнее предлагать Telegram
- Рассмотреть подключение SMS как платный fallback
- Или оплатить SendPulse после 1000

---

## 🎯 Следующие шаги после деплоя

### День 1-7:

1. ✅ Мониторить логи на ошибки
2. ✅ Проверить первые 50 входов
3. ✅ Убедиться, что оба канала работают
4. ✅ Собрать feedback от пользователей

### День 7-30:

1. 📊 Проанализировать метрики использования
2. 📊 Посмотреть распределение Telegram/WhatsApp
3. 💡 Оптимизировать UX для привязки Telegram
4. 💡 Добавить notifications о преимуществах Telegram

### Месяц 2+:

1. 📈 Если WhatsApp превышает лимит - рассмотреть варианты:
   - Подключить платный SMS fallback
   - Оплатить SendPulse после 1000
   - Активнее push-ить Telegram

---

## ✅ Production Checklist

### Перед деплоем:
- [x] Переменные окружения настроены
- [x] Код закоммичен и запушен
- [x] Миграция БД подготовлена

### Сразу после деплоя:
- [ ] Применить миграцию БД
- [ ] Настроить Telegram webhook
- [ ] Проверить WhatsApp в SendPulse

### Тестирование:
- [ ] Протестировать вход через Telegram
- [ ] Протестировать вход через WhatsApp
- [ ] Протестировать привязку Telegram
- [ ] Проверить логи на ошибки

### Мониторинг (первая неделя):
- [ ] Ежедневно проверять логи
- [ ] Отслеживать метрики в SendPulse
- [ ] Собирать feedback пользователей
- [ ] Оптимизировать UX при необходимости

---

## 📚 Дополнительные материалы

- **Telegram Bot:** `TELEGRAM_AUTH_SETUP.md`
- **SendPulse:** `SENDPULSE_SETUP.md`
- **Полный обзор:** `2FA_COMPLETE_GUIDE.md`

---

## 🎉 Готово к деплою!

**Версия:** v1.5.0
**Дата:** 27 ноября 2024
**Статус:** ✅ Готов к продакшену

**Команда для деплоя:**
```bash
# 1. Закоммитить изменения
git add .
git commit -m "feat: 2FA via Telegram + WhatsApp (v1.5.0)"
git push origin main

# 2. После деплоя настроить webhook
curl -X POST "https://api.telegram.org/bot8321416024:AAGKjoe4tL_OCe1xysXx0sMfMf8RTMsGnlo/setWebhook" \
  -d "url=https://myunion.pro/api/telegram/webhook"

# 3. Проверить
curl "https://api.telegram.org/bot8321416024:AAGKjoe4tL_OCe1xysXx0sMfMf8RTMsGnlo/getWebhookInfo"
```

**Вопросы?** Смотрите troubleshooting выше или пишите в поддержку.

---

🚀 **Успешного деплоя!**

