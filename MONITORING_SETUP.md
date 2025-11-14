# Система мониторинга и логирования MyUnion Pro

## Установка и настройка

### 1. Применение миграции БД

Миграция уже применена. Таблица `SystemLog` создана с полем `id`, `level`, `source`, `message`, `details`, `stackTrace`, `userId`, `metadata`, `resolved`, `resolvedAt`, `resolvedBy`, `notificationSent`, `createdAt`, `updatedAt`.

### 2. Добавлено в админ-панель

- Новый пункт меню "Логи системы" (`/admin/logs`)
- API endpoints для получения и управления логами (`/api/admin/logs`)

## Компоненты системы

### 1. `lib/logger.ts` - Центральный Logger

Предоставляет методы для логирования:

```typescript
// Основные методы
Logger.info(source, message, details?, userId?)
Logger.warning(source, message, details?, userId?)
Logger.error(source, message, error?, details?, userId?)
Logger.critical(source, message, error?, details?, userId?) // Отправляет уведомление!

// Дополнительные методы
Logger.getRecentLogs(limit?, level?, resolved?)
Logger.getLogsStats()
Logger.getLogsBySource(source, limit?)
Logger.resolveLog(logId, resolvedBy)
```

### 2. `app/api/admin/logs/route.ts` - API для логов

Endpoints:
- `GET /api/admin/logs` - Получить логи (с фильтрацией)
- `PATCH /api/admin/logs` - Отметить логлог как решённый
- `DELETE /api/admin/logs?older_than_days=30` - Удалить старые логи

### 3. `app/admin/logs/page.tsx` - UI админ-панели

Интерфейс для просмотра логов с:
- Фильтрацией по уровню и источнику
- Статистикой по типам ошибок
- Возможностью просмотра деталей каждого лога
- Функцией "Решить" для отметки логов как обработанных

## Интеграция логирования в существующий код

### Chat API (`app/api/chat/route.ts`)

Добавлено логирование критических ошибок:

```typescript
import { Logger } from "@/lib/logger";

// В catch блоке
catch (error) {
  await Logger.critical(
    "api/chat/POST",
    errorMessage,
    error,
    { userMessage: userMessage?.substring(0, 100), sessionExists: !!session },
    session?.user?.id
  );
}
```

### Generate Documents API (`app/api/admin/generate-user-documents/route.ts`)

Логирует все ошибки при генерации документов:

```typescript
import { Logger } from "@/lib/logger";

catch (error) {
  await Logger.error(
    "api/admin/generate-user-documents/POST",
    "Failed to generate documents",
    error,
    { userId },
    session?.user?.id
  );
}
```

## Как использовать

### Просмотр логов в админ-панели

1. Залогиньтесь как суперадмин
2. Откройте `http://localhost:3004/admin/logs`
3. Используйте фильтры для поиска ошибок
4. Нажмите "Детали" для просмотра полной информации
5. Нажмите "Решить" для отметки логов как обработанных

### Логирование в новом коде

```typescript
import { Logger } from "@/lib/logger";

// Логирование информации
await Logger.info("api/endpoint/METHOD", "Операция выполнена успешно");

// Логирование предупреждений
await Logger.warning("api/service", "API медленно отвечает", { responseTime: 5000 });

// Логирование ошибок
try {
  await riskyOperation();
} catch (error) {
  await Logger.error("api/operation", "Операция не удалась", error, { userId });
}

// Логирование критических ошибок (отправляет уведомление админам)
await Logger.critical(
  "api/payment/POST",
  "Платёж не прошел",
  error,
  { amount: 5000, paymentId: "xyz" }
);
```

## Уведомления администраторам

Когда возникает критическая ошибка (level === "CRITICAL"):

1. ✅ Логируется в БД с `notificationSent = true`
2. ✅ Отправляется push-уведомление всем суперадминам через OneSignal
3. ✅ Суперадмин видит красный бейдж "Критические" в админ-панели

### Требования для уведомлений

Нужны переменные окружения:

```env
ONESIGNAL_APP_ID=your_app_id
ONESIGNAL_API_KEY=your_api_key
INTERNAL_API_TOKEN=your_internal_token
NEXTAUTH_URL=http://localhost:3004
```

## Статистика

Функция `Logger.getLogsStats()` возвращает:

```typescript
{
  total: 1523,           // Всего логов
  errors: 45,            // Только ERROR
  warnings: 120,         // Только WARNING
  critical: 3,           // Только CRITICAL
  unresolved: 15         // ERROR + CRITICAL, не решенные
}
```

Отображается как карточки на странице логов.

## Хранение логов

- Логи хранятся в таблице `SystemLog` в PostgreSQL
- Индексы оптимизируют поиск по `level`, `source`, `resolved`, `createdAt`
- Старые логи можно удалить через `DELETE /api/admin/logs?older_than_days=30`

## Проблемы и решения

### Проблема: Уведомления не приходят

**Решение:**
1. Проверьте переменные окружения (ONESIGNAL_API_KEY)
2. Убедитесь, что суперадмины подписаны на уведомления
3. Проверьте лог браузера на ошибки при инициализации OneSignal

### Проблема: Логи занимают много места

**Решение:**
1. Регулярно чистите старые логи:
   ```bash
   curl -X DELETE "http://localhost:3004/api/admin/logs?older_than_days=30"
   ```
2. Рассмотрите архивирование логов старше 90 дней

### Проблема: Фильтрация работает медленно

**Решение:**
1. Убедитесь, что индексы созданы (они в миграции)
2. Используйте временные фильтры (не ищите все логи)
3. Рассмотрите добавление партиционирования по дате

## Будущие улучшения

- [ ] Экспорт логов в CSV/JSON
- [ ] Интеграция с Sentry или similar
- [ ] GraphQL API для логов
- [ ] Поиск с regex
- [ ] Автоматическое архивирование
- [ ] Alert rules и автоматические действия
- [ ] Корреляция логов по sessionId

## Документация

Полная документация: [`docs/LOGGING_GUIDE.md`](docs/LOGGING_GUIDE.md)

