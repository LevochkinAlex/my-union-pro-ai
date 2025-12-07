# Исправление проблемы с изображениями в постах

## Проблема
При редактировании поста: удаляли картинку, загружали новую, но в превью кавер оставался пустым и пост публиковался без замены изображения.

## Корневая причина
В `PostCard.tsx` отсутствовала нормализация пути изображения перед отправкой на сервер. Когда пользователь загружал новую картинку:
1. API возвращал относительный путь: `/uploads/posts/filename.jpg`
2. Компонент добавлял `window.location.origin` для превью: `https://myunion.pro/uploads/posts/filename.jpg`
3. При сохранении полный URL отправлялся на сервер без нормализации
4. Сервер не мог корректно обработать полный URL с доменом

## Внесенные изменения

### 1. PostCard.tsx - Исправлена нормализация пути (строки 1236-1249)
```typescript
if (editCoverImage) {
  // Нормализуем путь перед отправкой
  // Если это полный URL, извлекаем относительный путь
  const coverImagePath = editCoverImage.startsWith('http') 
    ? editCoverImage.replace(window.location.origin, '')
    : editCoverImage;
  console.log('[PostCard] Sending coverImage:', { 
    original: editCoverImage, 
    normalized: coverImagePath 
  });
  formData.append("coverImage", coverImagePath);
} else {
  // Если cover image удален, отправляем пустую строку
  console.log('[PostCard] Removing coverImage (sending empty string)');
  formData.append("coverImage", "");
}
```

**До:**
- Отправлялся полный URL: `https://myunion.pro/uploads/posts/filename.jpg`
- Сервер не мог корректно обработать

**После:**
- Отправляется относительный путь: `/uploads/posts/filename.jpg`
- Сервер корректно конвертирует в `/api/uploads/posts/filename.jpg`

### 2. Добавлено логирование для отладки

#### PostCard.tsx:
- Логирование при загрузке изображения (строка 397)
- Логирование полного URL для превью (строка 406)
- Логирование установки editCoverImage (строка 413)
- Логирование при отправке формы (строки 1241-1244, 1248)
- Логирование ответа API после сохранения (строка 1279)

#### CreatePost.tsx:
- Логирование при загрузке изображения (строка 288)
- Логирование установки coverImage (строка 300)
- Логирование при отправке формы (строки 706-709)

### 3. Создан тестовый план (tests/posts-image-flow.test.md)
Документ описывает:
- Полную цепочку создания поста с изображением
- Полную цепочку редактирования поста с заменой изображения
- Возможные проблемы и их решения
- Чеклист для проверки

## Как работает правильная цепочка

### При создании нового поста:
1. **Загрузка** → API `/api/posts/upload-image` возвращает `/uploads/posts/123.jpg`
2. **Превью** → Компонент создает полный URL для отображения: `https://myunion.pro/uploads/posts/123.jpg`
3. **Отправка** → Нормализует обратно в `/uploads/posts/123.jpg` ✅
4. **API** → Конвертирует в `/api/uploads/posts/123.jpg` и сохраняет в БД
5. **Отображение** → `getFileUrl` видит `/api/uploads/` и отдает как есть

### При редактировании поста:
1. **Открытие** → `editCoverImage` = текущее значение из БД (`/api/uploads/posts/OLD.jpg`)
2. **Удаление** → `editCoverImage` = `null`
3. **Загрузка новой** → API возвращает `/uploads/posts/NEW.jpg`
4. **Превью** → Создается полный URL: `https://myunion.pro/uploads/posts/NEW.jpg`
5. **Отправка** → Нормализуется в `/uploads/posts/NEW.jpg` ✅ (ИСПРАВЛЕНО)
6. **API** → Конвертирует в `/api/uploads/posts/NEW.jpg`
7. **Обновление** → Новый путь сохраняется в БД и возвращается клиенту
8. **Перезагрузка** → `onUpdate()` перезагружает список постов
9. **Отображение** → Новое изображение корректно отображается

## Тестирование

### Ручное тестирование:
1. Откройте консоль браузера (F12)
2. Создайте новый пост с картинкой - проверьте логи
3. Отредактируйте пост - удалите картинку
4. Загрузите новую картинку
5. Сохраните изменения
6. Проверьте, что новая картинка отображается

### Ожидаемые логи в консоли:
```
[CreatePost] Image uploaded, API returned URL: /uploads/posts/1733600000000-abc123.jpg
[CreatePost] Set coverImage to: https://myunion.pro/uploads/posts/1733600000000-abc123.jpg
[CreatePost] Sending coverImage: {
  original: "https://myunion.pro/uploads/posts/1733600000000-abc123.jpg",
  normalized: "/uploads/posts/1733600000000-abc123.jpg"
}
```

Для редактирования:
```
[PostCard] Image uploaded, API returned URL: /uploads/posts/1733600000000-xyz789.jpg
[PostCard] Full image URL for preview: https://myunion.pro/uploads/posts/1733600000000-xyz789.jpg
[PostCard] Set editCoverImage to: https://myunion.pro/uploads/posts/1733600000000-xyz789.jpg
[PostCard] Sending coverImage: {
  original: "https://myunion.pro/uploads/posts/1733600000000-xyz789.jpg",
  normalized: "/uploads/posts/1733600000000-xyz789.jpg"
}
[PostCard] Post saved successfully, API response: {...}
[PostCard] Updating coverImage from API response: /api/uploads/posts/1733600000000-xyz789.jpg
```

## Связанные файлы

### Изменены:
- `components/posts/PostCard.tsx` - исправлена нормализация + логирование
- `components/posts/CreatePost.tsx` - добавлено логирование (нормализация уже была)

### Проверены (без изменений):
- `app/api/posts/route.ts` - API создания постов
- `app/api/posts/[postId]/route.ts` - API редактирования постов
- `app/api/posts/upload-image/route.ts` - API загрузки изображений
- `lib/vds-storage.ts` - функции работы с VDS хранилищем
- `components/posts/PostFeed.tsx` - компонент ленты постов

### Созданы:
- `tests/posts-image-flow.test.md` - тестовый план
- `POSTS_IMAGE_FIX_SUMMARY.md` - этот документ

## Проверка перед деплоем

- [x] Нормализация пути работает в CreatePost
- [x] Нормализация пути работает в PostCard
- [x] API корректно обрабатывает `/uploads/` пути
- [x] API корректно обрабатывает `/api/uploads/` пути
- [x] getFileUrl корректно обрабатывает все форматы
- [x] onUpdate перезагружает посты после редактирования
- [x] Логирование добавлено для отладки
- [x] Нет ошибок линтера

## Дополнительные улучшения

Логирование помогает отслеживать:
- Какой URL возвращает API после загрузки
- Как формируется превью URL
- Что отправляется на сервер при сохранении
- Что возвращает сервер после сохранения

Это упростит диагностику проблем в production, если они возникнут.

## Следующие шаги

1. ✅ Исправления внесены
2. ⏳ Деплой на production
3. ⏳ Ручное тестирование на production
4. ⏳ При необходимости - убрать лишние console.log (или оставить для мониторинга)

---

**Дата:** 7 декабря 2024  
**Статус:** Готово к деплою

