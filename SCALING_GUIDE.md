# Руководство по масштабированию до 20 млн пользователей

## 🎯 Цель
Оптимизация платформы для поддержки 20 миллионов пользователей с фокусом на:
- Быстрая загрузка переписки (чат)
- Быстрая загрузка профсети (пользователи)
- Быстрая загрузка постов и новостей

## ✅ Реализованные оптимизации

### 1. Redis кеширование
**Файл:** `lib/cache.ts`

Универсальный слой кеширования для всех API:
- Автоматическая сериализация/десериализация JSON
- TTL (время жизни) для каждого ключа
- Graceful degradation (работает без Redis, но без кеша)

**Использование:**
```typescript
import { withCache, getCacheKey } from "@/lib/cache";

const cacheKey = getCacheKey("users:list", { search, page, limit });
const result = await withCache(cacheKey, async () => {
  // Ваш код получения данных
  return data;
}, 120); // TTL в секундах (2 минуты)
```

### 2. Оптимизация API чата
**Файл:** `app/api/chat/route.ts`

**Проблема:** N+1 запросы - для каждого чата отдельный запрос на подсчет непрочитанных сообщений.

**Решение:**
- Параллельные запросы для всех чатов одновременно
- Использование `Promise.all()` для параллельного выполнения
- Убрано последовательное выполнение запросов

**Результат:** Вместо N запросов → 1 параллельный запрос для всех чатов.

### 3. Кеширование API пользователей
**Файл:** `app/api/users/route.ts`

**Кеширование:**
- Список пользователей: 2 минуты
- Список организаций: 10 минут (меняется редко)

**Ключи кеша:**
- `users:list:{search}:{organizationId}:{page}:{limit}`
- `organizations:list:{}`

### 4. Кеширование API постов
**Файл:** `app/api/posts/route.ts`

**Кеширование:**
- Список постов: 1 минута
- Лайки пользователя: не кешируются (персональные данные)

**Оптимизация:**
- Отдельный запрос для лайков пользователя (не кешируется)
- Основные данные постов кешируются

### 5. Кеширование API новостей
**Файл:** `app/api/news/route.ts`

**Кеширование:**
- Список новостей: 2 минуты
- Лайки и голоса: не кешируются (персональные данные)

## 📊 Индексы базы данных

Все необходимые индексы уже созданы в `prisma/schema.prisma`:

### Chat
- `@@index([participant1Id])`
- `@@index([participant2Id])`
- `@@index([lastMessageAt])`

### ChatMessage
- `@@index([chatId])`
- `@@index([senderId])`
- `@@index([createdAt])`
- `@@index([chatId, deletedAt, createdAt])` - составной индекс для пагинации

### UserPost
- `@@index([authorId])`
- `@@index([createdAt])`
- `@@index([postType])`

### NewsPost
- `@@index([isPublished])`
- `@@index([publishedAt])`
- `@@index([authorId])`

## 🚀 Дополнительные рекомендации для масштабирования

### 1. Database Connection Pooling
Убедитесь, что Prisma использует пул соединений:
```env
DATABASE_URL="postgresql://user:pass@host:5432/db?connection_limit=20&pool_timeout=20"
```

### 2. Read Replicas (для 20 млн пользователей)
Настройте read replicas для PostgreSQL:
- Master: для записи
- Replicas: для чтения (API запросы)

### 3. CDN для статики
- Изображения аватаров
- Файлы вложений
- Статические ресурсы

### 4. Rate Limiting
Добавьте rate limiting для API:
```typescript
import { rateLimit } from "@/lib/rate-limit";

// Ограничение: 100 запросов в минуту
await rateLimit(userId, "api:users", 100, 60);
```

### 5. Пагинация везде
Все API должны использовать пагинацию:
- По умолчанию: 20 элементов
- Максимум: 100 элементов

### 6. Мониторинг производительности
- Логирование медленных запросов (>500ms)
- Метрики использования Redis
- Метрики использования БД

## 🔧 Настройка Redis

### Локальная разработка
```bash
# macOS
brew install redis
brew services start redis

# Linux
sudo apt-get install redis-server
sudo systemctl start redis
```

### Production
Используйте managed Redis (AWS ElastiCache, Upstash, Redis Cloud):
```env
REDIS_URL=redis://:password@redis-host.com:6379
# или с TLS
REDIS_URL=rediss://:password@redis-host.com:6380
```

## 📈 Ожидаемые результаты

### До оптимизации:
- Загрузка чатов: 2-5 секунд (N+1 запросы)
- Загрузка пользователей: 1-3 секунды
- Загрузка постов: 1-2 секунды
- Загрузка новостей: 1-2 секунды

### После оптимизации:
- Загрузка чатов: 0.5-1 секунда (параллельные запросы)
- Загрузка пользователей: 0.1-0.3 секунды (кеш)
- Загрузка постов: 0.1-0.3 секунды (кеш)
- Загрузка новостей: 0.1-0.3 секунды (кеш)

## 🔄 Инвалидация кеша

**Файл:** `lib/cache-invalidation.ts`

При создании/обновлении данных автоматически инвалидируется кеш:

```typescript
import { invalidatePostsCache, invalidateNewsCache, invalidateUsersCache } from "@/lib/cache-invalidation";

// При создании поста
await invalidatePostsCache(userId);

// При создании/обновлении новости
await invalidateNewsCache();

// При обновлении пользователя
await invalidateUsersCache();
```

**Где используется:**
- ✅ `app/api/posts/route.ts` - при создании поста
- ✅ `app/api/admin/news/route.ts` - при создании новости
- ✅ `app/api/admin/news/[id]/route.ts` - при обновлении/удалении новости
- ✅ `app/api/profile/route.ts` - при обновлении профиля
- ✅ `app/api/admin/users/[id]/route.ts` - при обновлении пользователя админом

## 📊 Мониторинг производительности

**Файл:** `lib/performance-monitor.ts`

Автоматический мониторинг производительности API:
- Логирование медленных запросов (>500ms)
- Статистика по эндпоинтам
- Cache hit rate
- Среднее время ответа

**API для просмотра статистики:**
```bash
GET /api/admin/performance
```

**Пример ответа:**
```json
{
  "stats": {
    "total": 1000,
    "average": 120,
    "slow": 50,
    "slowPercentage": 5,
    "cacheHitRate": 85.5,
    "byEndpoint": {
      "GET /api/users": {
        "count": 200,
        "average": 50,
        "slow": 2,
        "cacheHitRate": 95
      }
    }
  }
}
```

## 📝 TODO для дальнейшего масштабирования

- [x] Добавить инвалидацию кеша при создании/обновлении данных
- [x] Настроить мониторинг производительности
- [ ] Настроить read replicas для PostgreSQL
- [ ] Добавить rate limiting
- [ ] Настроить CDN для статики
- [ ] Оптимизировать загрузку сообщений чата (cursor-based pagination)
- [ ] Добавить кеширование для BestBenefits API
- [ ] Оптимизировать запросы с JOIN'ами

## 🐛 Troubleshooting

### Redis не подключается
```bash
# Проверка подключения
redis-cli ping

# Проверка переменных окружения
echo $REDIS_URL
```

### Кеш не работает
- Проверьте, что Redis запущен
- Проверьте `REDIS_URL` в `.env.local`
- Проверьте логи: `[Redis] Connection error`

### Медленные запросы
- Проверьте индексы в БД: `npx prisma studio`
- Проверьте использование кеша: логи `[Cache]`
- Проверьте количество запросов к БД

