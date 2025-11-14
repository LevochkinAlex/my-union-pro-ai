# ✅ Система логирования и мониторинга - ГОТОВА К ИСПОЛЬЗОВАНИЮ

## Что было реализовано

### 1️⃣ Централизованная система логирования (`lib/logger.ts`)

Создан класс `Logger` с методами:

```typescript
// Основные методы логирования
Logger.info(source, message, details?, userId?)
Logger.warning(source, message, details?, userId?)
Logger.error(source, message, error?, details?, userId?)
Logger.critical(source, message, error?, details?, userId?) ⚠️ ОТПРАВЛЯЕТ УВЕДОМЛЕНИЕ АДМИНАМ!

// Управление логами
Logger.getRecentLogs(limit?, level?, resolved?)
Logger.getLogsStats()
Logger.getLogsBySource(source, limit?)
Logger.resolveLog(logId, resolvedBy)
```

### 2️⃣ База данных (`prisma/schema.prisma`)

Добавлена модель `SystemLog` с полями:
- `id` - уникальный ID логи
- `level` - INFO, WARNING, ERROR, CRITICAL
- `source` - откуда пришла ошибка (API endpoint, функция)
- `message` - описание ошибки
- `details` - дополнительная информация (JSON)
- `stackTrace` - полный stack trace
- `userId` - кто столкнулся с ошибкой
- `metadata` - метаданные для анализа
- `resolved` - решена ли ошибка
- `resolvedAt` - когда решена
- `resolvedBy` - кто её решил
- `notificationSent` - было ли отправлено уведомление
- Индексы для оптимальной производительности

### 3️⃣ API endpoints (`app/api/admin/logs/route.ts`)

```bash
# Получить логи с фильтрацией
GET /api/admin/logs?limit=50&level=ERROR&resolved=false

# Отметить логи как решённые
PATCH /api/admin/logs { logId: "..." }

# Удалить старые логи
DELETE /api/admin/logs?older_than_days=30
```

### 4️⃣ UI админ-панели (`app/admin/logs/page.tsx`)

Красивый интерфейс для просмотра логов с:
- 📊 **Статистикой** - Всего логов, Критических, Ошибок, Предупреждений, Нерешённых
- 🔍 **Фильтрацией** - По уровню, по источнику, по статусу
- 📋 **Таблицей логов** - Уровень, источник, сообщение, пользователь, время
- 👁️ **Развёртыванием деталей** - Полная информация об ошибке с JSON и Stack Trace
- ✅ **Решением проблем** - Кнопка "Решить" для отметки как обработанного
- 🧹 **Очисткой** - Удаления старых разрешённых логов

### 5️⃣ Интеграция с существующим кодом

#### Chat API (`app/api/chat/route.ts`)
```typescript
// При критической ошибке в чате
await Logger.critical(
  "api/chat/POST",
  errorMessage,
  error,
  { userMessage, sessionExists: !!session },
  session?.user?.id
);
```

#### Generate Documents (`app/api/admin/generate-user-documents/route.ts`)
```typescript
// При ошибке при генерации документов
await Logger.error(
  "api/admin/generate-user-documents/POST",
  "Failed to generate documents",
  error,
  { userId },
  session?.user?.id
);
```

### 6️⃣ Уведомления администраторов

Когда возникает **CRITICAL** ошибка:
- ✅ Логируется в БД
- ✅ Отправляется **push-уведомление** всем суперадминам
- ✅ Суперадмин видит красный бейджик "🚨 Критические"

Требует переменных окружения:
```env
ONESIGNAL_API_KEY=...
INTERNAL_API_TOKEN=...
```

### 7️⃣ Документация

- `docs/LOGGING_GUIDE.md` - Полный гайд по использованию Logger
- `MONITORING_SETUP.md` - Инструкция по установке и настройке

## Как использовать

### Для разработчиков - Добавить логирование в новый код

```typescript
import { Logger } from "@/lib/logger";

// Информация
await Logger.info("api/endpoint/METHOD", "Successfully completed operation");

// Предупреждение
await Logger.warning("api/service/check", "Service response slow", { ms: 5000 });

// Ошибка (не блокирует)
try {
  await riskyOperation();
} catch (error) {
  await Logger.error(
    "api/operation/POST",
    "Operation failed",
    error,
    { userId, operationId }
  );
}

// КРИТИЧЕСКАЯ (отправляет уведомление админам!)
await Logger.critical(
  "api/payment/process",
  "Payment gateway is down",
  error,
  { amount: 5000 }
);
```

### Для администраторов - Просмотр ошибок

1. Откройте админ-панель: http://localhost:3004/admin
2. Перейдите в "Логи системы"
3. Используйте фильтры:
   - Все / Критические / Ошибки / Предупреждения
   - Очистить старые логи
4. Нажмите "Детали" для полной информации об ошибке
5. Нажмите "Решить" после обработки

## 📊 Примеры использования

### Сценарий 1: Мониторинг ошибок генерации PDF

```typescript
try {
  const pdf = await generateMembershipApplication(user);
  await Logger.info("documents/PDF", `PDF created for user ${user.id}`);
} catch (error) {
  await Logger.critical(
    "documents/PDF",
    "Cannot create PDF document",
    error,
    { userId: user.id, userName: `${user.firstName} ${user.lastName}` },
    userId
  );
}
```

### Сценарий 2: Отслеживание внешних API

```typescript
try {
  const response = await fetch("https://external-api.com");
  if (!response.ok) {
    await Logger.warning("external/api", `API error ${response.status}`, {
      status: response.status,
      endpoint: "https://external-api.com"
    });
  }
} catch (error) {
  await Logger.critical("external/api", "Cannot reach external API", error);
}
```

### Сценарий 3: Аудит действий админа

```typescript
await Logger.info(
  "admin/action",
  `Admin ${admin.email} changed settings`,
  {
    adminId: admin.id,
    action: "UPDATE_SETTINGS",
    fields: ["language", "theme"]
  }
);
```

## 🔧 Конфигурация

### Переменные окружения для уведомлений

```env
# OneSignal для push-уведомлений
ONESIGNAL_APP_ID=your_app_id
ONESIGNAL_API_KEY=your_api_key

# Токен для внутренних API запросов
INTERNAL_API_TOKEN=your_internal_token

# URL приложения
NEXTAUTH_URL=http://localhost:3004
```

### Удаление старых логов

```bash
# Удалить разрешённые логи старше 30 дней
curl -X DELETE "http://localhost:3004/api/admin/logs?older_than_days=30"

# Удалить разрешённые логи старше 7 дней
curl -X DELETE "http://localhost:3004/api/admin/logs?older_than_days=7"
```

## 📈 Статистика системы

API возвращает статистику:
```json
{
  "total": 1523,       // Всего логов
  "errors": 45,        // Только ERROR уровня
  "warnings": 120,     // Только WARNING уровня
  "critical": 3,       // Только CRITICAL уровня
  "unresolved": 15     // ERROR + CRITICAL, не решённые
}
```

## 🚀 Развёртывание

1. ✅ Миграция БД применена: `npx prisma migrate deploy`
2. ✅ Prisma Client регенерирован: `npx prisma generate`
3. ✅ Всё готово к использованию!

## 🔍 Проверка

### Тестирование логирования

```bash
# Перейти в админ-панель
http://localhost:3004/admin/logs

# Должны видеть:
# - Статистику логов
# - Таблицу с существующими логами
# - Фильтры по уровню
# - Кнопка "Очистить старые"
```

### Тестирование API

```bash
# Получить недавние логи
curl "http://localhost:3004/api/admin/logs?limit=10&level=ERROR"

# Отметить логи как решённые
curl -X PATCH "http://localhost:3004/api/admin/logs" \
  -H "Content-Type: application/json" \
  -d '{"logId":"cuid_here"}'

# Удалить старые логи
curl -X DELETE "http://localhost:3004/api/admin/logs?older_than_days=30"
```

## 💾 База данных

### Таблица SystemLog

```sql
SELECT * FROM "SystemLog" 
ORDER BY "createdAt" DESC 
LIMIT 20;

-- Статистика
SELECT level, COUNT(*) as count 
FROM "SystemLog" 
GROUP BY level;

-- Нерешённые ошибки
SELECT * FROM "SystemLog" 
WHERE resolved = false 
  AND level IN ('ERROR', 'CRITICAL')
ORDER BY "createdAt" DESC;
```

## 📝 Следующие шаги

### Рекомендуемые улучшения

- [ ] Интегрировать Discord/Telegram для критических ошибок
- [ ] Добавить экспорт логов в CSV/PDF
- [ ] Создать Sentry интеграцию
- [ ] Добавить корреляцию логов по sessionId
- [ ] Автоматическое архивирование логов > 90 дней
- [ ] GraphQL API для логов
- [ ] Поиск с regex поддержкой
- [ ] Alert rules и автоматические действия

## ✨ Преимущества

✅ **Централизованное логирование** - Все ошибки в одном месте
✅ **Real-time уведомления** - Админы узнают о критических ошибках сразу
✅ **Полный контекст** - Stack trace, метаданные, информация о пользователе
✅ **Фильтрация** - Легко найти нужные логи
✅ **Управление** - Отметить как решённые, удалить старые
✅ **Статистика** - Видеть общую картину проблем
✅ **Интегрируемость** - Легко добавить в новый код

---

**Система полностью готова к использованию! 🎉**

Начните логировать ошибки в вашем коде и отслеживайте их через админ-панель.

