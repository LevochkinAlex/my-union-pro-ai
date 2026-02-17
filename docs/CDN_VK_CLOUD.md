# CDN cdn.myunion.pro (VK Cloud)

Ресурс CDN в VK Cloud настроен на персональный домен **cdn.myunion.pro**. Через него отдаются загруженные файлы (аватарки, посты, вложения чата, скидки и т.д.).

## 1. Проверка подключения

### DNS

В панели VK Cloud в разделе CDN → ресурс `cdn.myunion.pro` указано:

- Создайте **CNAME**-запись для поддомена **cdn** домена **myunion.pro**:
  - Имя: `cdn` (или `cdn.myunion.pro` в зависимости от регистратора)
  - Значение: `cl-541e19d9.service.cdn.msk.vkcs.cloud.`

Проверка с машины:

```bash
dig cdn.myunion.pro CNAME +short
# Ожидается: cl-541e19d9.service.cdn.msk.vkcs.cloud.
```

Или в браузере открыть `https://cdn.myunion.pro` (после настройки SSL) — не должно быть ошибки «сайт недоступен» по DNS.

### Переменные окружения

- **Локально и на сервере** в `.env.local` должна быть строка:
  ```bash
  NEXT_PUBLIC_CDN_URL=https://cdn.myunion.pro
  ```
- В коде используется `lib/cdn.ts` и `NEXT_PUBLIC_CDN_URL`; в `next.config.ts` в `images.remotePatterns` уже добавлен хост `cdn.myunion.pro`.

## 2. SSL-сертификат

1. В панели VK Cloud откройте ресурс CDN **cdn.myunion.pro**.
2. Перейдите на вкладку **«Безопасность»** (Security).
3. Включите HTTPS и при необходимости:
   - **Сертификат от VK Cloud** — выдать сертификат через панель (Let's Encrypt или внутренний), либо
   - **Свой сертификат** — загрузить сертификат и приватный ключ, если используете свой CA.

После сохранения CDN начнёт отдавать контент по `https://cdn.myunion.pro`. Проверка:

```bash
curl -sI https://cdn.myunion.pro/
# Ожидается HTTP/2 200 или 403/404 (главное — нет ошибки SSL)
```

В приложении все ссылки на CDN уже идут через `https://cdn.myunion.pro` при заданном `NEXT_PUBLIC_CDN_URL`.

## 3. Источник контента (origin)

Убедитесь, что в настройках CDN-ресурса в VK Cloud указан корректный **origin** (источник): адрес вашего приложения, откуда CDN забирает файлы, например `https://myunion.pro` или IP сервера. Пути к файлам в приложении имеют вид `/uploads/...` — на origin должен быть доступен тот же путь (например `https://myunion.pro/uploads/...`).
