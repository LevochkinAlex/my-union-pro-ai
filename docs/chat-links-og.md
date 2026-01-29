# Ссылки и Open Graph в чате

## Как вставляются ссылки

- Пользователь пишет сообщение с URL в тексте (например: `Смотри https://example.com/page`).
- Текст рендерится через **ReactMarkdown** (`SlackStyleMessages.tsx`): ссылки становятся кликабельными `<a href="...">`.
- Дополнительно из текста сообщения **извлекаются все URL** по регулярному выражению `https?:\/\/[^\s]+` и для каждого запрашивается превью.

## OG (Open Graph) — да, выводится

- Компонент **LinkPreviews** в `SlackStyleMessages.tsx` для каждого найденного URL вызывает клиентский метод `fetchLinkPreview(url)` из `lib/link-preview.ts`.
- Тот в свою очередь запрашивает **GET /api/link-preview?url=...**.
- API **app/api/link-preview/route.ts**:
  - делает `fetch(url)` с таймаутом 5 сек;
  - парсит HTML и извлекает метатеги: **og:title**, **og:description**, **og:image**, **og:site_name**, **og:type**, для видео — **og:video** / **og:video:type**;
  - для YouTube/Vimeo выставляет `type: 'video'` и сохраняет URL видео.
- В чате под сообщением показываются карточки **LinkPreviewCard**: изображение (если есть), siteName, title, description, ссылка на исходный URL.

Итого: ссылки в сообщениях и превью по OG реализованы и выводятся под сообщением.

---

## Тесты переписок

Файл: `__tests__/chat-flows.test.ts`.

**Запуск:**
```bash
pnpm test:chat
# или
pnpm test
```

**Что проверяется:**
- **Unit:** извлечение URL из текста (`extractUrls`), определение видео-ссылок (`isVideoUrl`).
- **API без авторизации:** GET `/api/chat`, `/api/chat/rooms`, `/api/chat/[chatId]/messages`, POST reactions без cookie → ожидается 401.
- **API с авторизацией (пропускаются, если нет cookie):** список чатов, rooms, отправка сообщения (PATCH), реакция (POST), загрузка вложения (POST FormData). Для полной проверки нужны переменные окружения и запущенный сервер:
  - `TEST_CHAT_AUTH_COOKIE` — значение cookie сессии next-auth (например `next-auth.session-token=...`);
  - `TEST_CHAT_ID` — реальный id чата;
  - `TEST_MESSAGE_ID` — реальный id сообщения (для теста реакций).
  - `NEXT_PUBLIC_APP_URL` — базовый URL приложения (по умолчанию `http://localhost:3004`).
