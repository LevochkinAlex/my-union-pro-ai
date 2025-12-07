# Тест цепочки загрузки изображений в постах

## Сценарий 1: Создание нового поста с изображением

### Шаг 1: Загрузка изображения
**API:** `POST /api/posts/upload-image`
- Входные данные: `File` объект
- `uploadFileToVDS()` сохраняет файл и возвращает: `/uploads/posts/1234567890-abc123.jpg`
- API возвращает: 
```json
{
  "success": true,
  "url": "/uploads/posts/1234567890-abc123.jpg",
  "fileName": "image.jpg"
}
```

### Шаг 2: CreatePost обрабатывает URL
```typescript
// CreatePost.tsx:285-298
const fullUrl = imageUrl.startsWith('http') 
  ? imageUrl 
  : imageUrl.startsWith('/') 
    ? `${window.location.origin}${imageUrl}`
    : `${window.location.origin}/${imageUrl}`;
setCoverImage(fullUrl);
// Результат: "https://myunion.pro/uploads/posts/1234567890-abc123.jpg"
```

### Шаг 3: Отправка поста
```typescript
// CreatePost.tsx:702-709
const coverImagePath = coverImage.startsWith('http') 
  ? coverImage.replace(window.location.origin, '')
  : coverImage;
formData.append("coverImage", coverImagePath);
// Отправляется: "/uploads/posts/1234567890-abc123.jpg"
```

### Шаг 4: API POST обрабатывает coverImage
```typescript
// route.ts:250-252
else if (coverImageStr.startsWith("/uploads/")) {
  coverImage = coverImageStr.replace("/uploads/", "/api/uploads/");
  console.log(`[posts] Normalized cover image path: ${coverImage}`);
}
// Результат: "/api/uploads/posts/1234567890-abc123.jpg"
```

### Шаг 5: Сохранение в БД
```typescript
// route.ts:390-398
const post = await prisma.userPost.create({
  data: {
    ...
    ...(coverImage !== null && coverImage !== "" ? { coverImage } : {}),
  }
});
// В БД сохраняется: "/api/uploads/posts/1234567890-abc123.jpg"
```

### Шаг 6: Отображение на фронтенде
```typescript
// PostCard.tsx:718-733
const coverImagePath = coverImage || (post as any).coverImage;
// coverImagePath = "/api/uploads/posts/1234567890-abc123.jpg"
const coverImageUrl = getFileUrl(coverImagePath, "posts");
// getFileUrl видит "/api/uploads/" и возвращает как есть (строка 173-174)
// coverImageUrl = "/api/uploads/posts/1234567890-abc123.jpg"
```

✅ **Ожидаемый результат:** Изображение отображается корректно

---

## Сценарий 2: Редактирование поста - удаление старой картинки и загрузка новой

### Шаг 1: Открытие поста для редактирования
```typescript
// PostCard.tsx:638-641
const existingImage = (post as any).coverImage || 
  post.attachments?.find((a: any) => a.type === "image")?.filePath || null;
setEditCoverImage(existingImage);
// editCoverImage = "/api/uploads/posts/OLD-FILE.jpg"
```

### Шаг 2: Удаление картинки
```typescript
// PostCard.tsx:1350-1353
onClick={() => {
  setEditCoverImage(null);
  setEditVideoMetadata(null);
}}
// editCoverImage = null
```

### Шаг 3: Загрузка новой картинки
**API:** `POST /api/posts/upload-image`
- Возвращает: `/uploads/posts/NEW-FILE.jpg`

```typescript
// PostCard.tsx:405-412
if (imageInsertMode === "cover") {
  setEditVideoMetadata(null);
  setEditVideoUrl("");
  const fullImageUrl = imageUrl.startsWith('http') 
    ? imageUrl 
    : imageUrl.startsWith('/') 
      ? `${window.location.origin}${imageUrl}`
      : `${window.location.origin}/${imageUrl}`;
  setEditCoverImage(fullImageUrl);
  // editCoverImage = "https://myunion.pro/uploads/posts/NEW-FILE.jpg"
}
```

### Шаг 4: Сохранение изменений
```typescript
// PostCard.tsx:1236-1244 (ИСПРАВЛЕНО)
if (editCoverImage) {
  const coverImagePath = editCoverImage.startsWith('http') 
    ? editCoverImage.replace(window.location.origin, '')
    : editCoverImage;
  formData.append("coverImage", coverImagePath);
}
// Отправляется: "/uploads/posts/NEW-FILE.jpg" ✅
```

### Шаг 5: API PATCH обрабатывает coverImage
```typescript
// [postId]/route.ts:164-167
else if (coverImageStr.startsWith("/uploads/")) {
  coverImage = coverImageStr.replace("/uploads/", "/api/uploads/");
  console.log(`[posts] Normalized cover image path: ${coverImage}`);
}
// coverImage = "/api/uploads/posts/NEW-FILE.jpg"
```

### Шаг 6: Сохранение в БД и возврат
```typescript
// [postId]/route.ts:506-507
const updateData: any = {
  ...
  coverImage: coverImage,
};
const post = await prisma.userPost.update({ ... });
// Возвращается:
{
  post: {
    ...
    coverImage: "/api/uploads/posts/NEW-FILE.jpg"
  }
}
```

### Шаг 7: Обновление состояния на фронтенде
```typescript
// PostCard.tsx:1271-1274
if (data.post?.coverImage !== undefined) {
  setCoverImage(data.post.coverImage);
  setEditCoverImage(data.post.coverImage);
}
// coverImage = "/api/uploads/posts/NEW-FILE.jpg"
// editCoverImage = "/api/uploads/posts/NEW-FILE.jpg"
```

### Шаг 8: Отображение обновленного изображения
```typescript
// PostCard.tsx:718-733 (после onUpdate)
const coverImagePath = coverImage || (post as any).coverImage;
// coverImagePath = "/api/uploads/posts/NEW-FILE.jpg"
const coverImageUrl = getFileUrl(coverImagePath, "posts");
// coverImageUrl = "/api/uploads/posts/NEW-FILE.jpg"
```

✅ **Ожидаемый результат:** Новое изображение отображается корректно

---

## Возможные проблемы и решения

### Проблема 1: Изображение не отображается после редактирования
**Причина:** `onUpdate()` не перезагружает посты
**Решение:** Проверить, что `onUpdate()` вызывает обновление списка постов

### Проблема 2: Пустой кавер в превью
**Причина 1:** `editCoverImage` содержит некорректный путь после загрузки
**Решение:** ✅ Исправлено - добавлена нормализация в строке 1239-1241

**Причина 2:** API возвращает некорректный путь
**Решение:** Добавить логирование в API для отладки

### Проблема 3: 502 Bad Gateway при загрузке
**Причина:** VDS storage не настроен или недоступен
**Решение:** Проверить переменные окружения VDS_STORAGE_*

---

## Чеклист для проверки

- [ ] VDS storage настроен (env переменные)
- [ ] uploadFileToVDS возвращает `/uploads/posts/...`
- [ ] CreatePost нормализует полный URL перед отправкой
- [ ] PostCard нормализует полный URL перед отправкой (✅ исправлено)
- [ ] API POST конвертирует `/uploads/` в `/api/uploads/`
- [ ] API PATCH конвертирует `/uploads/` в `/api/uploads/`
- [ ] getFileUrl корректно обрабатывает `/api/uploads/` пути
- [ ] onUpdate() перезагружает посты после редактирования

