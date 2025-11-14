# Система логирования платформы MyUnion Pro

## Обзор

Система логирования предоставляет централизованный способ отслеживания ошибок, предупреждений и критических событий на платформе. Все логи хранятся в базе данных и доступны в админ-панели.

## Уровни логирования

- **INFO** - Информационные сообщения (обычно не требуют внимания)
- **WARNING** - Предупреждения (потенциальные проблемы)
- **ERROR** - Ошибки (требуют внимания)
- **CRITICAL** - Критические ошибки (автоматически отправляют уведомление администраторам)

## Использование в коде

### Базовое использование

```typescript
import { Logger } from "@/lib/logger";

// INFO
await Logger.info("api/users/GET", "Пользователь получен успешно");

// WARNING
await Logger.warning("api/chat/POST", "Ответ AI был пустым", { userId: "123" });

// ERROR
try {
  // какой-то код
} catch (error) {
  await Logger.error("api/documents/POST", "Ошибка при генерации PDF", error);
}

// CRITICAL - отправляет уведомление админам
await Logger.critical("api/payment/POST", "Платеж не прошел", error, { amount: 5000 });
```

### С метаданными

```typescript
await Logger.error(
  "api/chat/POST",
  "Ошибка при обработке сообщения",
  error,
  {
    messageLength: userMessage.length,
    botId: bot.id,
    language: "ru"
  },
  userId // ID пользователя, в контексте которого произошла ошибка
);
```

### С полной информацией об ошибке

```typescript
await Logger.log({
  level: "ERROR",
  source: "api/appeals/POST",
  message: "Не удалось создать обращение",
  details: {
    userId,
    type: appealType,
    error: error.message
  },
  stackTrace: error.stack,
  userId,
  metadata: {
    timestamp: new Date(),
    endpoint: "POST /api/appeals"
  }
});
```

## Просмотр логов в админ-панели

1. Откройте админ-панель (`/admin`)
2. Перейдите в раздел "Логи системы"
3. Используйте фильтры для поиска нужных логов:
   - По уровню (CRITICAL, ERROR, WARNING, INFO)
   - По источнику (API endpoint, функция)
   - По статусу разрешения (решено/не решено)

## Фильтрация и поиск

### Через админ-панель UI

- Кнопки фильтров в верхней части страницы
- Кнопка "Очистить старые" для удаления разрешенных логов старше 30 дней
- Клик на "Детали" для просмотра полной информации об ошибке

### Через API

```bash
# Получить ошибки за последний день
curl -X GET "/api/admin/logs?level=ERROR&limit=50"

# Получить логи для конкретного источника
curl -X GET "/api/admin/logs?source=api/chat/POST&limit=100"

# Получить только нерешенные ошибки
curl -X GET "/api/admin/logs?level=ERROR&resolved=false"
```

## Разрешение ошибок

После анализа ошибки администратор может отметить её как разрешенную:

```typescript
await Logger.resolveLog(logId, resolvedByUserId);
```

Или через админ-панель, нажав кнопку "Решить" рядом с логом.

## Уведомления администраторов

Когда возникает критическая ошибка (level === "CRITICAL"):

1. Логируется в базу данных
2. Автоматически отправляется push-уведомление всем суперадминам
3. Уведомление содержит:
   - Описание ошибки
   - Источник (API endpoint)
   - Ссылку на лог в админ-панели

## Лучшие практики

### ✅ Правильное использование

```typescript
// Логируйте ошибки сразу при их возникновении
try {
  const result = await someAsyncOperation();
} catch (error) {
  await Logger.error("api/endpoint/METHOD", "Описание ошибки", error);
}

// Используйте правильные уровни
await Logger.warning("api/cache/GET", "Кеш пуст, используется БД");
await Logger.critical("api/payment/POST", "Платежная система недоступна", error);

// Добавляйте полезный контекст
await Logger.error(
  "api/document/PDF",
  "Ошибка при генерации PDF",
  error,
  { userId, documentType, fileSize }
);
```

### ❌ Неправильное использование

```typescript
// ❌ Не логируйте во время catch - используйте Logger
try {
  // код
} catch (error) {
  console.error(error); // Плохо, используйте Logger вместо этого
}

// ❌ Не отправляйте слишком много деталей
await Logger.error("api/endpoint", "error", error); // Используйте описательные сообщения

// ❌ Не используйте CRITICAL для обычных ошибок
await Logger.critical("api/users/GET", "Пользователь не найден", error); // ERROR будет достаточно
```

## Настройка

### Переменные окружения

```env
# Для отправки уведомлений администраторам необходимо:
ONESIGNAL_API_KEY=your_key
INTERNAL_API_TOKEN=your_internal_token
```

### Удаление старых логов

Логи автоматически НЕ удаляются. Используйте:

```bash
# Удалить разрешенные логи старше 30 дней
DELETE /api/admin/logs?older_than_days=30

# Удалить разрешенные логи старше 7 дней
DELETE /api/admin/logs?older_than_days=7
```

## Интеграция с ботом (опционально)

Для отправки логов в отдельный Discord/Telegram бот:

```typescript
if (entry.level === "CRITICAL") {
  // Отправить сообщение в Discord webhook
  await fetch(process.env.DISCORD_WEBHOOK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      content: `🚨 КРИТИЧЕСКАЯ ОШИБКА: ${entry.message}`,
      embeds: [{
        title: entry.source,
        description: entry.message,
        fields: [
          { name: "Деталь", value: JSON.stringify(entry.details) }
        ]
      }]
    })
  });
}
```

## Примеры реальных сценариев

### Сценарий 1: Обработка ошибки при генерации PDF

```typescript
try {
  const pdfPath = await generateMembershipApplication(user);
  await Logger.info(
    "api/documents/PDF",
    `PDF успешно создан для пользователя ${user.id}`
  );
} catch (error) {
  await Logger.critical(
    "api/documents/PDF",
    "Не удалось создать PDF заявление",
    error,
    { userId: user.id, userName: `${user.firstName} ${user.lastName}` },
    userId
  );
}
```

### Сценарий 2: Отслеживание внешних API

```typescript
try {
  const response = await fetch("https://external-api.com/data");
  if (!response.ok) {
    await Logger.warning(
      "external/api/fetch",
      `Ошибка API: ${response.status}`,
      {
        status: response.status,
        statusText: response.statusText
      }
    );
  }
} catch (error) {
  await Logger.critical(
    "external/api/fetch",
    "Не удалось подключиться к внешнему API",
    error
  );
}
```

### Сценарий 3: Аудит действий администратора

```typescript
await Logger.info(
  "admin/action",
  `Администратор ${admin.email} изменил настройки`,
  {
    adminId: admin.id,
    action: "UPDATE_SETTINGS",
    changedFields: ["language", "timezone"]
  }
);
```

## Мониторинг и аналитика

### Статистика логов

```typescript
const stats = await Logger.getLogsStats();
console.log(stats);
// {
//   total: 1523,
//   errors: 45,
//   warnings: 120,
//   critical: 3,
//   unresolved: 15
// }
```

### Получение логов по источнику

```typescript
const chatLogs = await Logger.getLogsBySource("api/chat/POST", 20);
```

## Заключение

Правильное логирование помогает:
- 🚀 Быстро найти и исправить ошибки
- 📊 Отслеживать здоровье системы
- 👥 Понять поведение пользователей
- 🔍 Проводить аудит и анализ проблем

