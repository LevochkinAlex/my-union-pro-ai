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

🔄 В процессе: AI чат для сбора данных профиля

## 📁 Основные файлы

- `PROJECT_STATUS.md` - **ПОЛНАЯ ИНФОРМАЦИЯ О ПРОЕКТЕ** (читай первым!)
- `prisma/schema.prisma` - схема базы данных
- `.env.local` - переменные окружения
- `app/(auth)/` - страницы авторизации
- `lib/auth.ts` - конфигурация NextAuth
- `lib/email.ts` - функции отправки email

## 🔑 Важные переменные окружения

Все в `.env.local`:
- `DATABASE_URL` - PostgreSQL
- `NEXTAUTH_SECRET` - секрет для NextAuth
- `OPENROUTER_API_KEY` - для AI чата
- `SMTP_*` - настройки email
- `DADATA_API_KEY`, `DADATA_SECRET_KEY` - поиск организаций

## 📚 Документация

**Смотри `PROJECT_STATUS.md` для полной информации!**

Там описано:
- Что сделано
- Что нужно сделать дальше
- Структура проекта
- Процесс регистрации
- Технические детали

## 🎯 Следующие шаги

1. Интегрировать OpenRouter AI для чата
2. Создать генератор PDF заявлений
3. Создать dashboard с меню

---

**Для продолжения работы в другом чате - читай `PROJECT_STATUS.md`**
