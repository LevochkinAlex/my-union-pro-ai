# 📱 WhatsApp Authentication Templates для МойСоюз

## 🎯 Требования WhatsApp Business API

Для отправки **одноразовых паролей (OTP)** через WhatsApp необходимо:

1. ✅ Использовать **утвержденную категорию AUTHENTICATION**
2. ✅ Создать **template message** в SendPulse
3. ✅ Получить **одобрение от Facebook** (обычно несколько часов)
4. ✅ Использовать только **одобренные** templates для отправки

---

## 📋 Шаблоны для создания

### Шаблон 1: Основной (Обязательный) ⭐

**Template Name:** `myunion_auth_code`  
**Category:** AUTHENTICATION  
**Language:** Русский (ru)

**Body Text:**
```
Ваш код для входа в МойСоюз: *{{1}}*

⏱ Код действителен 5 минут
⚠️ Никому не сообщайте этот код
```

**Переменные:**
- `{{1}}` - 4-значный PIN-код (например: 1234)

**Add security recommendation:** ✅ (опция WhatsApp)

**Button (опционально):**
- Type: Copy code
- Text: Скопировать код

---

### Шаблон 2: English fallback (Рекомендуется)

**Template Name:** `myunion_auth_code_en`  
**Category:** AUTHENTICATION  
**Language:** English (en)

**Body Text:**
```
Your MyUnion login code: *{{1}}*

⏱ Code expires in 5 minutes
⚠️ Never share this code with anyone
```

**Переменные:**
- `{{1}}` - 4-digit PIN code

---

### Шаблон 3: Повторная отправка (Опционально)

**Template Name:** `myunion_auth_code_resend`  
**Category:** AUTHENTICATION  
**Language:** Русский (ru)

**Body Text:**
```
🔄 Новый код для входа в МойСоюз: *{{1}}*

Предыдущий код больше не действителен.

⏱ Код действителен 5 минут
```

**Переменные:**
- `{{1}}` - 4-значный PIN-код

---

## 🔧 Инструкция по созданию в SendPulse

### Шаг 1: Откройте WhatsApp Bot

1. Войдите в SendPulse: https://login.sendpulse.com/
2. Перейдите: **Чат-боты → WhatsApp → YappiX**
3. Или прямая ссылка: https://login.sendpulse.com/messengers/bots/whatsapp/69285cff0016f7374d089440/

### Шаг 2: Создайте Template

1. Найдите раздел **"Шаблоны сообщений"** (Message Templates)
2. Нажмите **"Создать шаблон"** (Create Template)
3. Заполните форму:

**Параметры:**
```
Название: myunion_auth_code
Категория: AUTHENTICATION (⚠️ Важно!)
Язык: Русский

Текст сообщения:
Ваш код для входа в МойСоюз: *{{1}}*

⏱ Код действителен 5 минут
⚠️ Никому не сообщайте этот код

Переменные:
1. {{1}} - Код подтверждения

Кнопка (опционально):
☑️ Add security recommendation
Тип: Copy code
Текст: Скопировать код
```

### Шаг 3: Отправьте на модерацию

1. Нажмите **"Отправить на проверку"** (Submit for review)
2. Шаблон отправится на модерацию в Facebook
3. Обычно одобряется за **2-24 часа**

### Шаг 4: Проверьте статус

В SendPulse будет отображаться статус:
- 🟡 **Pending** - На модерации
- 🟢 **Approved** - Одобрен (можно использовать!)
- 🔴 **Rejected** - Отклонен (нужно исправить и отправить заново)

---

## 📝 Требования Facebook к Authentication Templates

### ✅ Что МОЖНО:

- Использовать для **входа в систему** (login)
- Использовать для **подтверждения действий** (verify actions)
- Отправлять **одноразовые пароли** (OTP)
- Указывать **срок действия кода**
- Добавлять **предупреждения о безопасности**

### ❌ Что НЕЛЬЗЯ:

- Использовать для маркетинга
- Добавлять рекламные сообщения
- Использовать для не-авторизационных целей
- Отправлять без запроса пользователя

### 📏 Ограничения:

- **Максимум 1024 символа** в body
- **До 3 переменных** {{1}}, {{2}}, {{3}}
- **До 2 кнопок** (опционально)
- Только **утвержденные категории**

---

## 🧪 Тестирование после одобрения

### Тест 1: Отправка через API

После одобрения template протестируйте:

```bash
# Создайте тестовый скрипт
node scripts/test-whatsapp-template.mjs +79991234567
```

**Ожидаемый результат:**
```
✅ Template отправлен успешно
   WhatsApp должен получить сообщение с PIN-кодом
```

### Тест 2: Полный процесс входа

1. Откройте `/login` на сайте
2. Введите номер телефона
3. Если Telegram не привязан → код придет в WhatsApp
4. Проверьте WhatsApp на номере
5. Введите код на сайте
6. ✅ Вход выполнен!

---

## 🔧 Конфигурация

### Переменные окружения

Добавьте в `.env.local`:

```env
# SendPulse WhatsApp
SENDPULSE_USER_ID=92d73a0d4d7eac351eb5c90b418cd3d8
SENDPULSE_SECRET=5e28be602856d3d1e390e56bdce95ca7
SENDPULSE_WHATSAPP_BOT_ID=69285cff0016f7374d089440
```

### Код уже готов!

Код в `lib/sendpulse.ts` использует template `myunion_auth_code` и ждет только его одобрения от Facebook.

---

## 🚨 Troubleshooting

### Проблема 1: Template отклонен (Rejected)

**Возможные причины:**
- Неправильная категория (должна быть AUTHENTICATION)
- Текст содержит маркетинговую информацию
- Не указан срок действия кода
- Отсутствует предупреждение о безопасности

**Решение:**
1. Проверьте категорию: **AUTHENTICATION**
2. Убедитесь, что текст про **одноразовый пароль**
3. Добавьте **срок действия** (5 минут)
4. Добавьте **предупреждение** (никому не сообщайте)

---

### Проблема 2: Template не отправляется (404 error)

**Причина:** Template еще не одобрен или имя неправильное

**Решение:**
1. Проверьте статус template в SendPulse
2. Убедитесь, что имя в коде совпадает: `myunion_auth_code`
3. Дождитесь одобрения (🟢 Approved)

---

### Проблема 3: "Template not found"

**Причина:** Template создан, но имя не совпадает

**Решение:**
```typescript
// В lib/sendpulse.ts проверьте:
name: "myunion_auth_code", // Должно совпадать с именем в SendPulse
```

---

## 💰 Стоимость

### WhatsApp Business API через SendPulse:

**Бесплатно:**
- Первые **1000 сообщений/месяц**
- Authentication templates

**После 1000:**
- ~0.5-2 руб за сообщение
- Зависит от страны получателя

**Рекомендация:**
- Приоритет Telegram (бесплатно, без лимитов)
- WhatsApp как fallback (1000 бесплатно)
- Мотивировать пользователей привязывать Telegram

---

## ✅ Checklist

- [ ] Создан template `myunion_auth_code` в SendPulse
- [ ] Категория: AUTHENTICATION ⚠️
- [ ] Отправлен на модерацию в Facebook
- [ ] Статус: 🟢 Approved
- [ ] Переменные окружения настроены
- [ ] Протестирована отправка
- [ ] Работает в production

---

## 📚 Дополнительные ресурсы

- **SendPulse WhatsApp Docs:** https://sendpulse.com/integrations/api/chatbot/whatsapp
- **Facebook WhatsApp Templates:** https://developers.facebook.com/docs/whatsapp/message-templates/
- **Authentication Templates Guidelines:** https://developers.facebook.com/docs/whatsapp/message-templates/guidelines/authentication

---

## 🎉 После одобрения

Когда template будет одобрен:

1. ✅ WhatsApp автоматически заработает
2. ✅ Код не нужно менять - уже готов
3. ✅ Система автоматически использует Telegram → WhatsApp fallback

**Стоимость:** 0 руб/месяц для первых 1000 входов! 🎉

---

**Текущий статус:** ⏳ Ожидается создание и одобрение template

**Следующий шаг:** Создайте template в SendPulse и дождитесь одобрения от Facebook

