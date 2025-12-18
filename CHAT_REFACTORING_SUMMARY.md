# Рефакторинг чатов новостей, документов и обращений

## Выполненные работы

### 1. Исправлена проблема с 404 для изображений в обращениях ✅

**Проблема**: Изображения в разделе обращений использовали прямой путь `filePath` вместо функции `getFileUrl`, что приводило к 404 ошибкам при доступе через CDN.

**Решение**:
- Создан унифицированный компонент `FileAttachment` (`components/shared/FileAttachment.tsx`)
- Компонент автоматически использует `getFileUrl` для правильной обработки путей через CDN
- Добавлена поддержка превью изображений с автоматическим fallback на файловую ссылку при ошибках загрузки
- Компонент используется на странице детального просмотра обращения (`app/dashboard/appeals/[id]/page.tsx`)

### 2. Созданы унифицированные утилиты для работы с файлами ✅

**Новый файл**: `lib/file-utils.ts`

**Функции**:
- `isImageFile()` - определение изображений
- `isVideoFile()` - определение видео
- `isAudioFile()` - определение аудио
- `isDocumentFile()` - определение документов
- `getFileIcon()` - получение иконки для типа файла
- `formatFileSize()` - форматирование размера файла
- `getFileExtension()` - получение расширения файла
- `getFileNameWithoutExtension()` - получение имени без расширения
- `isDangerousExtension()` - проверка опасных расширений

### 3. Улучшена обработка ошибок загрузки изображений ✅

**Улучшения**:
- В компоненте `LazyImage` добавлено информативное сообщение об ошибке загрузки
- Добавлена ссылка "Открыть в новой вкладке" при ошибке загрузки изображения
- В компоненте `FileAttachment` улучшена обработка ошибок с автоматическим fallback

### 4. Рефакторинг компонента MessageItem ✅

- Использование новых утилит из `lib/file-utils.ts`
- Улучшенная обработка ошибок при отображении изображений в чатах
- Более информативные сообщения об ошибках

## Созданные компоненты

### FileAttachment (`components/shared/FileAttachment.tsx`)

Универсальный компонент для отображения файлов и изображений, который можно использовать в:
- Обращениях (appeals)
- Чатах (chat messages)
- Новостях (news attachments)
- Документах (document attachments)

**Пропсы**:
```typescript
interface FileAttachmentProps {
  fileName: string;
  filePath: string;
  fileSize: number;
  mimeType?: string | null;
  showPreview?: boolean; // Показывать ли превью для изображений
  className?: string;
}
```

**Особенности**:
- Автоматическое определение типа файла (изображение/видео/документ)
- Превью для изображений с автоматическим fallback
- Корректная обработка путей через CDN
- Обработка ошибок загрузки

## Изменённые файлы

1. `app/dashboard/appeals/[id]/page.tsx` - используется новый компонент FileAttachment
2. `components/chat/MessageItem.tsx` - использование новых утилит, улучшенная обработка ошибок
3. `components/shared/FileAttachment.tsx` - новый унифицированный компонент
4. `lib/file-utils.ts` - новые утилиты для работы с файлами

## Рекомендации для дальнейшего использования

### Использование FileAttachment в других разделах

**Для новостей**:
```tsx
import FileAttachment from "@/components/shared/FileAttachment";

<FileAttachment
  fileName={attachment.fileName}
  filePath={attachment.filePath}
  fileSize={attachment.fileSize}
  mimeType={attachment.mimeType}
  showPreview={true}
/>
```

**Для документов**:
```tsx
import FileAttachment from "@/components/shared/FileAttachment";

<FileAttachment
  fileName={document.fileName}
  filePath={document.filePath}
  fileSize={document.fileSize}
  mimeType={document.mimeType}
  showPreview={false} // Для документов обычно не показываем превью
/>
```

### Использование утилит из file-utils

```tsx
import { isImageFile, formatFileSize, getFileIcon } from "@/lib/file-utils";

// Проверка типа файла
if (isImageFile(fileName, mimeType)) {
  // Обработка изображения
}

// Форматирование размера
const sizeText = formatFileSize(file.size);

// Получение иконки
const icon = getFileIcon(fileName, mimeType);
```

## Следующие шаги

Для полного рефакторинга рекомендуется:

1. **Обновить компоненты новостей** - использовать FileAttachment в NewsCard и других компонентах новостей
2. **Обновить компоненты документов** - использовать FileAttachment в DocumentsPage
3. **Унифицировать обработку загрузки файлов** - создать единый API endpoint для загрузки файлов
4. **Добавить поддержку видео и аудио** - расширить FileAttachment для показа превью видео и аудио плееров

## Заметки

- Все изменения обратно совместимы
- Существующий функционал не нарушен
- Улучшена обработка ошибок во всех компонентах
- Код стал более модульным и переиспользуемым

