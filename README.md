# MyUnion Pro

AI-агент для управления профсоюзом на базе Next.js + TailAdmin UI.

## 🚀 Быстрый старт

```bash
cd /Users/renatusmanov/my-union-pro
pnpm install
pnpm prisma migrate dev
pnpm dev
```

## 📋 Текущий статус

✅ Базовая авторизация (Login, Register, Forgot Password)  
✅ Prisma схема с моделями  
✅ Email отправка через SMTP  
✅ TailAdmin UI компоненты интегрированы  
✅ AI чат для сбора данных профиля  
✅ Генерация заявлений в PDF  
✅ Проверка организаций по ЕГРЮЛ/Минюст РФ (DaData)  
✅ Проверка профиля и перегенерация документов  

🔄 В процессе: Интеграция со скидками Best Benefits

## 📁 Основные файлы

- `PROJECT_STATUS.md` - **ПОЛНАЯ ИНФОРМАЦИЯ О ПРОЕКТЕ** (читай первым!)
- `prisma/schema.prisma` - схема базы данных
- `.env.local` - переменные окружения
- `app/(auth)/` - страницы авторизации
- `lib/auth.ts` - конфигурация NextAuth
- `lib/email.ts` - функции отправки email

## 🔑 Переменные окружения

Все настройки в `.env.local`:
- `DATABASE_URL` - PostgreSQL
- `NEXTAUTH_SECRET` - секрет для NextAuth
- `OPENROUTER_API_KEY` - для AI чата
- `SMTP_*` - настройки email
- `DADATA_API_KEY` - **⚠️ Обязательно!** Проверка организаций по ЕГРЮЛ/Минюст РФ

📖 **Полная документация по настройке:**
- [ENV_QUICKSTART.md](./ENV_QUICKSTART.md) - Быстрый старт (5 минут)
- [ENV_CONFIGURATION.md](./ENV_CONFIGURATION.md) - Полное описание всех переменных

## 📚 Документация

**Смотри `PROJECT_STATUS.md` для полной информации о проекте!**

### 📋 Основные документы

- **[PROJECT_STATUS.md](./PROJECT_STATUS.md)** - Полный статус проекта
- **[ENV_QUICKSTART.md](./ENV_QUICKSTART.md)** - 🚀 Быстрая настройка окружения
- **[ENV_CONFIGURATION.md](./ENV_CONFIGURATION.md)** - 📖 Все переменные окружения

### 🔍 Специальные темы

- [ORGANIZATION_VALIDATION.md](./ORGANIZATION_VALIDATION.md) - 🏢 Проверка организаций по ЕГРЮЛ/Минюст РФ
- [DADATA_CITY_EXTRACTION.md](./DADATA_CITY_EXTRACTION.md) - 🏙️ Автоматическое извлечение города из DaData
- [PROFILE_UPDATE_AND_REGENERATION.md](./PROFILE_UPDATE_AND_REGENERATION.md) - 🔄 Проверка профиля и перегенерация документов
- [PROFILE_CONFIRMATION_FIX.md](./PROFILE_CONFIRMATION_FIX.md) - ✅ Логика подтверждения профиля перед генерацией
- [CHAT_UX_IMPROVEMENTS.md](./CHAT_UX_IMPROVEMENTS.md) - 🎯 Улучшение UX чата и подтверждения данных
- [PROFILE_FIELDS_ANALYSIS.md](./PROFILE_FIELDS_ANALYSIS.md) - 📊 Анализ полей профиля пользователя
- [BOT_TRAINING_UPDATE.md](./BOT_TRAINING_UPDATE.md) - 🤖 Обучение бота для сбора профиля
- [APPEAL_BOT_FEATURES.md](./APPEAL_BOT_FEATURES.md) - AI бот для обращений
- [KNOWLEDGE_BASE_GUIDE.md](./KNOWLEDGE_BASE_GUIDE.md) - База знаний профсоюза
- [BEST_BENEFITS_API.md](./BEST_BENEFITS_API.md) - Интеграция со скидками
- [TESTING_GUIDE.md](./TESTING_GUIDE.md) - Тестирование функционала
- [TESTING_PLAN_REGENERATION.md](./TESTING_PLAN_REGENERATION.md) - 🧪 План тестирования перегенерации
- [ENV_CHEATSHEET.md](./ENV_CHEATSHEET.md) - ⚡ Шпаргалка по настройкам

## 🎯 Следующие шаги

1. Интегрировать OpenRouter AI для чата
2. Создать генератор PDF заявлений
3. Создать dashboard с меню

---

**Для продолжения работы в другом чате - читай `PROJECT_STATUS.md`**
