# ⚡ Шпаргалка по переменным окружения

> **Быстрая справка для `.env.local`** | [Полная документация →](./ENV_CONFIGURATION.md)

---

## 🔴 Обязательные (минимум для запуска)

```bash
# БД
DATABASE_URL="postgresql://postgres:password@localhost:5432/myunion?schema=public"

# Аутентификация
NEXTAUTH_URL="http://localhost:3004"
NEXTAUTH_SECRET=""  # openssl rand -base64 32

# AI
OPENROUTER_API_KEY=""  # https://openrouter.ai/keys

# Шифрование
BB_PASSWORD_ENCRYPTION_KEY=""  # openssl rand -hex 16 (ровно 32 символа!)
```

---

## ⚠️ Критически важные (рекомендуется)

```bash
# DaData - Проверка организаций по ЕГРЮЛ/Минюст РФ
DADATA_API_KEY=""  # https://dadata.ru/
# БЕЗ ЭТОГО ОРГАНИЗАЦИИ НЕ БУДУТ ПРОВЕРЯТЬСЯ!

# Email
SMTP_HOST="smtp.gmail.com"
SMTP_PORT="587"
SMTP_USER=""
SMTP_PASSWORD=""  # Gmail: App Password
SMTP_FROM="MyUnion Pro <noreply@myunion.pro>"
```

---

## 🎁 BestBenefits (скидки)

```bash
USE_REAL_BB_API="false"  # true для production
BEST_BENEFITS_API_URL="https://bestbenefits.ru/api/products"
BB_LOGIN=""
BB_PASSWORD=""
BB_PROFSOYUZY_TOKEN=""
```

---

## 🔔 Push-уведомления

```bash
# OneSignal
NEXT_PUBLIC_ONESIGNAL_APP_ID=""
ONESIGNAL_REST_API_KEY=""

# Firebase
FIREBASE_PROJECT_ID=""
FIREBASE_CLIENT_EMAIL=""
FIREBASE_PRIVATE_KEY=""
NEXT_PUBLIC_FIREBASE_VAPID_KEY=""
```

---

## 🎯 Быстрая генерация ключей

```bash
# NEXTAUTH_SECRET
openssl rand -base64 32

# BB_PASSWORD_ENCRYPTION_KEY (ровно 32 символа)
openssl rand -hex 16
```

---

## 🐛 Быстрая диагностика

| Проблема | Проверьте | Лог |
|----------|-----------|-----|
| Организации не находятся | `DADATA_API_KEY` | `[organization-search]` |
| БД не подключается | `DATABASE_URL` | `Error: Can't reach database` |
| AI не отвечает | `OPENROUTER_API_KEY` | `[chat] API error` |
| Email не отправляется | `SMTP_*` | `[email]` |

---

## 📋 Где получить ключи

- **PostgreSQL:** [supabase.com](https://supabase.com/) (бесплатно)
- **OpenRouter:** [openrouter.ai/keys](https://openrouter.ai/keys)
- **DaData:** [dadata.ru](https://dadata.ru/) (10k бесплатно/день)
- **OneSignal:** [onesignal.com](https://onesignal.com/)

---

## 🔒 Безопасность

- ❌ **НИКОГДА** не коммитьте `.env.local`
- ✅ Используйте App Password для Gmail
- ✅ Храните бэкап ключей в 1Password/Bitwarden
- ✅ Для production используйте переменные окружения сервера

---

## 🚀 Быстрый старт

```bash
# 1. Скопируйте шаблон
cp .env.example .env.local

# 2. Сгенерируйте секреты
echo "NEXTAUTH_SECRET=\"$(openssl rand -base64 32)\"" >> .env.local
echo "BB_PASSWORD_ENCRYPTION_KEY=\"$(openssl rand -hex 16)\"" >> .env.local

# 3. Заполните остальные переменные вручную

# 4. Запустите
npm run dev
```

---

**📖 Подробнее:**
- [ENV_QUICKSTART.md](./ENV_QUICKSTART.md) - Пошаговая настройка
- [ENV_CONFIGURATION.md](./ENV_CONFIGURATION.md) - Полное описание
- [ORGANIZATION_VALIDATION.md](./ORGANIZATION_VALIDATION.md) - Как работает проверка организаций

