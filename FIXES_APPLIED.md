# Исправления для PROD (04.12.2024)

## ✅ Что исправлено

### 1. HEIC файлы теперь работают
- ✅ Автоматическая конвертация HEIC → JPEG на клиенте
- ✅ Превью HEIC изображений
- ✅ Работает на всех устройствах (iPhone, Android, Desktop)

**Как работает:**
- При выборе HEIC файла он автоматически конвертируется в JPEG
- Сервер получает уже сконвертированный файл
- Не нужны дополнительные библиотеки

### 2. Изображения отображаются на проде
- ✅ API endpoint для файлов: `/api/uploads/chat/[filename]`
- ✅ Правильные пути к изображениям
- ✅ Кэширование для быстрой загрузки

### 3. React Hydration Error исправлена
- ✅ Добавлена защита от hydration mismatch
- ✅ Показ загрузчика до полной инициализации
- ✅ Нет ошибок в консоли

### 4. Поддержка удаления/редактирования сообщений
- ⚠️ **Требует применения миграции на PROD**

---

## ⚠️ ВАЖНО: Нужно применить миграцию на PROD

Для работы удаления/редактирования сообщений нужно применить миграцию.

### Быстрый способ (SQL)

1. Откройте SQL редактор вашей PROD базы данных
2. Выполните:

```sql
-- Добавляем поля в ChatMessage
ALTER TABLE "ChatMessage" ADD COLUMN IF NOT EXISTS "editedAt" TIMESTAMP(3);
ALTER TABLE "ChatMessage" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);
ALTER TABLE "ChatMessage" ADD COLUMN IF NOT EXISTS "replyToId" TEXT;
ALTER TABLE "ChatMessage" ADD COLUMN IF NOT EXISTS "forwardedFromId" TEXT;

-- Создаем индексы
CREATE INDEX IF NOT EXISTS "ChatMessage_replyToId_idx" ON "ChatMessage"("replyToId");
CREATE INDEX IF NOT EXISTS "ChatMessage_forwardedFromId_idx" ON "ChatMessage"("forwardedFromId");
CREATE INDEX IF NOT EXISTS "ChatMessage_deletedAt_idx" ON "ChatMessage"("deletedAt");

-- Добавляем внешние ключи
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'ChatMessage_replyToId_fkey'
    ) THEN
        ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_replyToId_fkey" 
        FOREIGN KEY ("replyToId") REFERENCES "ChatMessage"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'ChatMessage_forwardedFromId_fkey'
    ) THEN
        ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_forwardedFromId_fkey" 
        FOREIGN KEY ("forwardedFromId") REFERENCES "ChatMessage"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;
```

3. После выполнения **перезапустите приложение** на Vercel (Settings → Deployments → Redeploy)

### Проверка

```sql
-- Проверьте, что поля добавлены
SELECT column_name 
FROM information_schema.columns 
WHERE table_name = 'ChatMessage' 
AND column_name IN ('deletedAt', 'editedAt', 'replyToId', 'forwardedFromId');
```

Должно вернуть 4 строки.

---

## 📝 Что теперь работает

### В чате:
- ✅ Загрузка HEIC фото с iPhone
- ✅ Превью всех изображений
- ✅ Отображение изображений на проде
- ✅ Редактирование сообщений (после миграции)
- ✅ Удаление сообщений (после миграции)
- ✅ Пересылка сообщений (после миграции)
- ✅ Ответы на сообщения (после миграции)

### В постах:
- ✅ Загрузка HEIC фото
- ✅ Редактирование с HEIC
- ✅ Все форматы изображений

---

## 🔧 Технические детали

### Файлы изменены:
1. `app/dashboard/chat/page.tsx` - добавлена конвертация HEIC, hydration fix
2. `lib/heic-to-jpeg.ts` - утилита для конвертации HEIC
3. `app/api/uploads/chat/[filename]/route.ts` - API для файлов
4. `components/posts/CreatePost.tsx` - поддержка HEIC
5. `components/posts/PostCard.tsx` - поддержка HEIC
6. `prisma/migrations/20251204000000_add_chat_message_fields/` - миграция БД

### Производительность:
- Конвертация HEIC происходит на клиенте (не нагружает сервер)
- Изображения кэшируются на 1 год
- Используется Canvas API (нативно, быстро)

---

## 🐛 Если что-то не работает

### HEIC не загружается
1. Проверьте консоль браузера (F12)
2. Убедитесь, что файл действительно HEIC
3. Попробуйте другой HEIC файл

### Изображения не отображаются
1. Проверьте, что файлы существуют в `public/uploads/chat/`
2. Проверьте права на папку `public/uploads/chat/`
3. Проверьте логи Vercel (если на проде)

### Удаление не работает
1. **Применили миграцию?** (см. выше)
2. Перезапустили приложение на Vercel?
3. Проверьте, что поля добавлены в БД

### React ошибки
1. Очистите кэш браузера (Cmd+Shift+R / Ctrl+F5)
2. Перезапустите dev сервер
3. Проверьте, что нет конфликтующих расширений браузера

---

## 📞 Техподдержка

Если проблемы остались:
1. Проверьте консоль браузера (F12 → Console)
2. Проверьте Network tab (F12 → Network)
3. Скопируйте текст ошибки
4. Отправьте скриншот

**Все должно работать после применения миграции!** 🚀

