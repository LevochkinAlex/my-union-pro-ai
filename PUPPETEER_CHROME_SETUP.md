# Проблема с генерацией PDF документов

## Дата: 24 ноября 2025

### Проблема

Пользователь заполнил все данные профиля в чате, система показала "Профиль заполнен!" и маркер `[PROFILE_COMPLETE]`, но документы **не генерируются**.

**Симптомы:**
- ✅ Профиль полностью заполнен
- ✅ Маркер `[PROFILE_COMPLETE]` присутствует в чате
- ❌ Документы не появляются в разделе "Мои документы"
- ❌ В базе данных нет записей о документах

### Диагностика

При попытке ручной генерации документов появляется ошибка:

```
Error: Could not find Chrome (ver. 142.0.7444.61). This can occur if either
 1. you did not perform an installation before running the script (e.g. `npx puppeteer browsers install chrome`) or
 2. your cache path is incorrectly configured (which is: /Users/renatusmanov/.cache/puppeteer).
```

### Корневая причина

Система использует **Puppeteer** для генерации PDF документов из HTML. Puppeteer требует установленного **Chromium** для работы, но при стандартной установке проекта через `npm install` или `pnpm install` **Chromium не устанавливается автоматически**.

Это приводит к тому, что:
1. API эндпоинт `/api/chat/route.ts` пытается сгенерировать документы после заполнения профиля
2. Функция `generatePDFFromHTML` в `lib/documents.ts` запускает Puppeteer
3. Puppeteer не может найти Chrome
4. Генерация падает с ошибкой (которая не отображается пользователю)
5. Документы не создаются

### Решение

**Установить Chromium для Puppeteer:**

```bash
npx puppeteer browsers install chrome
```

Эта команда устанавливает Chromium в кеш Puppeteer:
- macOS (ARM): `/Users/<username>/.cache/puppeteer/chrome/mac_arm-142.0.7444.61/`
- macOS (Intel): `/Users/<username>/.cache/puppeteer/chrome/mac-142.0.7444.61/`
- Linux: `/home/<username>/.cache/puppeteer/chrome/linux-142.0.7444.61/`
- Windows: `C:\Users\<username>\.cache\puppeteer\chrome\win64-142.0.7444.61\`

После установки Chrome документы генерируются корректно:

```
✅ Membership application: /uploads/documents/membership_..._1764014907526.pdf
✅ Contributions application: /uploads/documents/contributions_..._1764014911230.pdf
✅ Documents saved to database!
```

### Где используется Puppeteer

**Файл:** `lib/documents.ts`

```typescript:239:275:lib/documents.ts
async function generatePDFFromHTML(html: string, outputPath: string): Promise<void> {
  const browser = await puppeteer.launch({
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-accelerated-2d-canvas",
      "--disable-gpu",
    ],
  });

  try {
    const page = await browser.newPage();
    await page.setContent(html, {
      waitUntil: "networkidle0",
    });

    await page.pdf({
      path: outputPath,
      format: "A4",
      margin: {
        top: "2cm",
        right: "2cm",
        bottom: "2cm",
        left: "2cm",
      },
      printBackground: true,
    });
  } finally {
    await browser.close();
  }
}
```

Эта функция используется для генерации:
- Заявления о вступлении в профсоюз
- Заявления о перечислении членских взносов

### Восстановление для пользователя

После установки Chrome документы были сгенерированы вручную:

```bash
pnpm tsx scripts/generate-documents-for-user.ts 9061109990@mail.ru

✅ Documents saved to database!
📋 Summary:
  - Membership application: /uploads/documents/membership_cmidklhds00001yc0c16bvgzy_1764014907526.pdf
  - Contributions application: /uploads/documents/contributions_cmidklhds00001yc0c16bvgzy_1764014911230.pdf
  - Total size: 86.87 KB
```

### Обновление инструкций по развертыванию

Необходимо добавить шаг установки Chromium во все инструкции по развертыванию:

#### Локальная разработка

```bash
# После установки зависимостей
npm install
# или
pnpm install

# Установите Chromium для Puppeteer
npx puppeteer browsers install chrome
```

#### Production (VDS/VPS)

```bash
# Добавьте в скрипт деплоя после npm install
npx puppeteer browsers install chrome
```

### Файлы для обновления

1. **README.md** - добавить шаг установки Chrome
2. **VDS_DEPLOY_INSTRUCTIONS.md** - добавить в процесс деплоя
3. **TIMEWEB_DEPLOY_INSTRUCTIONS.md** - добавить в инструкции
4. **ENV_QUICKSTART.md** - добавить в секцию setup

### Альтернативные решения

Если не хочется устанавливать Puppeteer локально, можно использовать:

1. **Использовать готовые PDF шаблоны** (pdfkit, pdfmake)
2. **Использовать онлайн сервис** для генерации PDF (Browserless, PDF.co)
3. **Использовать системный Chrome** вместо Chromium от Puppeteer

Пример использования системного Chrome:

```typescript
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', // macOS
  // executablePath: '/usr/bin/google-chrome', // Linux
  // executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', // Windows
  headless: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox'],
});
```

### Проверка установки

Чтобы проверить что Chrome установлен корректно:

```bash
# Проверить существование кеша Puppeteer
ls -la ~/.cache/puppeteer/

# Попробовать сгенерировать документы для тестового пользователя
pnpm tsx scripts/generate-documents-for-user.ts <email>
```

### Логирование

Добавить логирование в `lib/documents.ts` для лучшей диагностики:

```typescript
async function generatePDFFromHTML(html: string, outputPath: string): Promise<void> {
  console.log('[documents] Launching Puppeteer...');
  
  try {
    const browser = await puppeteer.launch({
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
      ],
    });
    
    console.log('[documents] Puppeteer launched successfully');
    
    // ... остальной код
  } catch (error) {
    console.error('[documents] Failed to launch Puppeteer:', error);
    throw error;
  }
}
```

### Мониторинг

Добавить мониторинг генерации документов:
- Логировать все попытки генерации
- Отслеживать ошибки Puppeteer
- Уведомлять администратора при сбоях

### Итог

✅ Chrome установлен  
✅ Документы сгенерированы для пользователя  
✅ Проблема решена  
📝 Необходимо обновить документацию по развертыванию
⚠️ В будущем: добавить проверку наличия Chrome при старте приложения

