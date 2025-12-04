# Настройка работы с PROD базой

## Быстрая настройка (30 секунд)

### 1. Откройте файл `.env`
```bash
nano .env
```

### 2. Замените `DATABASE_URL`

Найдите строку:
```env
DATABASE_URL="postgresql://..."
```

Замените на URL вашей PROD базы данных.

### 3. Перезапустите сервер
```bash
# Остановите (Ctrl+C)
# Запустите снова
pnpm dev
```

## ✅ Готово!

Теперь все изменения сохраняются сразу на проде.

---

## Где взять DATABASE_URL для прода?

### Vercel:
1. Откройте vercel.com → ваш проект
2. Settings → Environment Variables
3. Скопируйте `DATABASE_URL`

### Supabase:
1. Откройте supabase.com → ваш проект
2. Settings → Database → Connection string
3. Выберите "URI" и скопируйте

### Railway/Render:
Найдите DATABASE_URL в настройках проекта.

---

## ⚠️ Важно

После изменения `.env` **обязательно перезапустите сервер** (Ctrl+C, затем `pnpm dev`)

