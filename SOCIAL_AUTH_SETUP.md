# Интеграция Social Auth для МойСоюз

## Обзор

Многоканальная система авторизации:
- **Поле для телефона** → WhatsApp / SMS (2FA коды)
- **Кнопки соцсетей** → Telegram / MAX / VK / Google (OAuth)

---

## 1. Telegram Login Widget

### Как работает
1. Пользователь нажимает "Войти через Telegram"
2. Telegram открывается и просит подтвердить вход
3. После подтверждения - редирект в ЛК с токеном

### Настройка в BotFather

```
1. Откройте @BotFather в Telegram
2. Отправьте /setdomain
3. Выберите бота @myunionpro_bot
4. Введите домен: myunion.pro
```

### Реализация

**1. Установка виджета на странице логина:**

```typescript
// app/(auth)/login/page.tsx
import Script from 'next/script';

<Script 
  src="https://telegram.org/js/telegram-widget.js?22"
  strategy="lazyOnload"
  data-telegram-login="myunionpro_bot"
  data-size="large"
  data-radius="8"
  data-auth-url="https://myunion.pro/api/auth/telegram/callback"
  data-request-access="write"
/>
```

**2. API endpoint для обработки:**

```typescript
// app/api/auth/telegram/callback/route.ts
import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  
  // Получаем данные от Telegram
  const id = searchParams.get("id");
  const first_name = searchParams.get("first_name");
  const last_name = searchParams.get("last_name");
  const username = searchParams.get("username");
  const photo_url = searchParams.get("photo_url");
  const auth_date = searchParams.get("auth_date");
  const hash = searchParams.get("hash");

  // Проверяем подпись
  const token = process.env.TELEGRAM_BOT_TOKEN!;
  const dataCheckString = Object.keys(Object.fromEntries(searchParams))
    .filter(key => key !== "hash")
    .sort()
    .map(key => `${key}=${searchParams.get(key)}`)
    .join("\n");
  
  const secretKey = crypto.createHash("sha256").update(token).digest();
  const hmac = crypto.createHmac("sha256", secretKey).update(dataCheckString).digest("hex");
  
  if (hmac !== hash) {
    return NextResponse.json({ error: "Invalid hash" }, { status: 403 });
  }

  // Проверяем свежесть данных (не старше 1 дня)
  const authTimestamp = parseInt(auth_date!);
  if (Date.now() / 1000 - authTimestamp > 86400) {
    return NextResponse.json({ error: "Data is outdated" }, { status: 403 });
  }

  // Ищем или создаем пользователя
  let user = await prisma.user.findUnique({
    where: { telegramChatId: id! },
  });

  if (!user) {
    // Создаем нового пользователя
    user = await prisma.user.create({
      data: {
        telegramChatId: id!,
        telegramUsername: username || null,
        name: `${first_name} ${last_name || ""}`.trim(),
        role: "PENDING_MEMBER",
        membershipStatus: "PROFILE_INCOMPLETE",
      },
    });
  }

  // Создаем сессию через NextAuth
  // TODO: Создать JWT токен и установить cookie

  // Редирект в личный кабинет
  return NextResponse.redirect(new URL("/dashboard", request.url));
}
```

---

## 2. MAX Messenger OAuth

### Регистрация приложения

```
1. Откройте https://max.im/developers
2. Создайте новое приложение
3. Получите Client ID и Client Secret
4. Добавьте Redirect URI: https://myunion.pro/api/auth/max/callback
```

### Переменные окружения

```bash
MAX_OAUTH_CLIENT_ID=your_client_id
MAX_OAUTH_CLIENT_SECRET=your_client_secret
MAX_OAUTH_REDIRECT_URI=https://myunion.pro/api/auth/max/callback
```

### Реализация

**1. Кнопка авторизации:**

```typescript
// app/(auth)/login/page.tsx
<a
  href={`https://auth.max.im/oauth/authorize?client_id=${process.env.NEXT_PUBLIC_MAX_CLIENT_ID}&redirect_uri=${encodeURIComponent('https://myunion.pro/api/auth/max/callback')}&response_type=code&scope=user.info`}
  className="flex items-center justify-center gap-2 px-4 py-3 border border-gray-300 rounded-lg hover:bg-gray-50"
>
  <Image src="/icons/max.svg" alt="MAX" width={24} height={24} />
  <span>MAX</span>
</a>
```

**2. Callback endpoint:**

```typescript
// app/api/auth/max/callback/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");

  if (!code) {
    return NextResponse.redirect(new URL("/login?error=no_code", request.url));
  }

  // Обмениваем code на access_token
  const tokenResponse = await fetch("https://auth.max.im/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: process.env.MAX_OAUTH_CLIENT_ID,
      client_secret: process.env.MAX_OAUTH_CLIENT_SECRET,
      code,
      grant_type: "authorization_code",
      redirect_uri: process.env.MAX_OAUTH_REDIRECT_URI,
    }),
  });

  const { access_token } = await tokenResponse.json();

  // Получаем информацию о пользователе
  const userResponse = await fetch("https://api.max.im/v1/user/me", {
    headers: { Authorization: `Bearer ${access_token}` },
  });

  const maxUser = await userResponse.json();

  // Ищем или создаем пользователя
  let user = await prisma.user.findUnique({
    where: { maxChatId: maxUser.id.toString() },
  });

  if (!user) {
    user = await prisma.user.create({
      data: {
        maxChatId: maxUser.id.toString(),
        name: maxUser.name || maxUser.username,
        role: "PENDING_MEMBER",
        membershipStatus: "PROFILE_INCOMPLETE",
      },
    });
  }

  // Создаем сессию и редиректим
  return NextResponse.redirect(new URL("/dashboard", request.url));
}
```

---

## 3. VK OAuth

### Регистрация приложения

```
1. Откройте https://vk.com/apps?act=manage
2. Создайте новое приложение (Веб-сайт)
3. Получите Client ID и Client Secret
4. Добавьте Authorized redirect URI: https://myunion.pro/api/auth/vk/callback
```

### Переменные окружения

```bash
VK_OAUTH_CLIENT_ID=your_client_id
VK_OAUTH_CLIENT_SECRET=your_client_secret
VK_OAUTH_REDIRECT_URI=https://myunion.pro/api/auth/vk/callback
```

### Реализация с NextAuth.js

```typescript
// app/api/auth/[...nextauth]/route.ts
import VkProvider from "next-auth/providers/vk";

providers: [
  VkProvider({
    clientId: process.env.VK_OAUTH_CLIENT_ID!,
    clientSecret: process.env.VK_OAUTH_CLIENT_SECRET!,
  }),
]
```

---

## 4. Google OAuth

### Регистрация приложения

```
1. Откройте https://console.cloud.google.com/
2. Создайте новый проект
3. APIs & Services → Credentials → Create Credentials → OAuth Client ID
4. Application type: Web application
5. Authorized redirect URIs: https://myunion.pro/api/auth/callback/google
```

### Переменные окружения

```bash
GOOGLE_CLIENT_ID=your_client_id
GOOGLE_CLIENT_SECRET=your_client_secret
```

### Реализация с NextAuth.js

```typescript
// app/api/auth/[...nextauth]/route.ts
import GoogleProvider from "next-auth/providers/google";

providers: [
  GoogleProvider({
    clientId: process.env.GOOGLE_CLIENT_ID!,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
  }),
]
```

---

## 5. Telegram Mini App (авторизация в боте)

### Концепция

1. Пользователь открывает бота @myunionpro_bot
2. Отправляет /start или /login
3. Бот отправляет кнопку с Mini App
4. Mini App открывается внутри Telegram
5. После авторизации - Web App редиректит в ЛК

### Реализация

**1. Создание Mini App:**

```typescript
// app/telegram-mini-app/page.tsx
'use client';

import { useEffect } from 'react';

export default function TelegramMiniApp() {
  useEffect(() => {
    // Получаем данные от Telegram WebApp
    const initData = (window as any).Telegram?.WebApp?.initData;
    
    if (initData) {
      // Отправляем данные на бэкенд для авторизации
      fetch('/api/auth/telegram/webapp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ initData }),
      })
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          // Закрываем Mini App и открываем ЛК в браузере
          (window as any).Telegram.WebApp.openLink('https://myunion.pro/dashboard');
        }
      });
    }
  }, []);

  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="text-center">
        <div className="animate-spin h-12 w-12 border-4 border-blue-500 border-t-transparent rounded-full mx-auto mb-4"></div>
        <p>Авторизация...</p>
      </div>
    </div>
  );
}
```

**2. Команда в боте:**

```typescript
// app/api/telegram/webhook/route.ts
if (text === '/login' || text === '/start login') {
  const keyboard = {
    inline_keyboard: [[
      {
        text: "🔐 Войти в ЛК",
        web_app: { url: "https://myunion.pro/telegram-mini-app" }
      }
    ]]
  };

  await sendTelegramMessage(
    chatId,
    "👋 Нажмите кнопку ниже для входа в личный кабинет:",
    keyboard
  );
}
```

---

## 6. Обновление UI страницы логина

### Структура

```
┌─────────────────────────────────────┐
│  Вход в систему                      │
├─────────────────────────────────────┤
│                                      │
│  ┌────────────────────────────────┐ │
│  │ +7 (___) ___-__-__             │ │
│  └────────────────────────────────┘ │
│                                      │
│  ┌────────────────────────────────┐ │
│  │  Получить код (WhatsApp/SMS)   │ │
│  └────────────────────────────────┘ │
│                                      │
│  ────────── или ──────────          │
│                                      │
│  ┌───┐ ┌───┐ ┌───┐ ┌───┐           │
│  │ T │ │ M │ │ V │ │ G │           │
│  └───┘ └───┘ └───┘ └───┘           │
│   TG   MAX   VK   Google            │
└─────────────────────────────────────┘
```

### Макет кнопок

```typescript
<div className="mt-6">
  <div className="relative">
    <div className="absolute inset-0 flex items-center">
      <div className="w-full border-t border-gray-300"></div>
    </div>
    <div className="relative flex justify-center text-sm">
      <span className="px-2 bg-white text-gray-500">или войти через</span>
    </div>
  </div>

  <div className="mt-6 grid grid-cols-4 gap-3">
    {/* Telegram */}
    <button className="flex flex-col items-center justify-center p-4 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">
      <TelegramIcon className="w-8 h-8 mb-2" />
      <span className="text-xs">Telegram</span>
    </button>

    {/* MAX */}
    <button className="flex flex-col items-center justify-center p-4 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">
      <MaxIcon className="w-8 h-8 mb-2" />
      <span className="text-xs">MAX</span>
    </button>

    {/* VK */}
    <button className="flex flex-col items-center justify-center p-4 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">
      <VKIcon className="w-8 h-8 mb-2" />
      <span className="text-xs">VK</span>
    </button>

    {/* Google */}
    <button className="flex flex-col items-center justify-center p-4 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">
      <GoogleIcon className="w-8 h-8 mb-2" />
      <span className="text-xs">Google</span>
    </button>
  </div>
</div>
```

---

## Приоритет реализации

1. ✅ **Telegram Login Widget** - самый простой, без OAuth
2. ✅ **Google OAuth** - уже есть в NextAuth.js
3. ⚠️ **VK OAuth** - средняя сложность
4. ⚠️ **MAX OAuth** - нужна документация API
5. 🔄 **Telegram Mini App** - для продвинутых пользователей

---

## Безопасность

### Проверка данных

```typescript
// Всегда проверяйте подпись от Telegram
function verifyTelegramAuth(data: any, botToken: string): boolean {
  const { hash, ...restData } = data;
  const dataCheckString = Object.keys(restData)
    .sort()
    .map(key => `${key}=${restData[key]}`)
    .join('\n');
  
  const secretKey = crypto.createHash('sha256').update(botToken).digest();
  const hmac = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
  
  return hmac === hash;
}
```

### CSRF Protection

```typescript
// Используйте state parameter для OAuth
const state = crypto.randomBytes(16).toString('hex');
// Сохраните в session
// Проверьте при callback
```

---

## Тестирование

### Локальное тестирование OAuth

Используйте ngrok для тестирования:

```bash
ngrok http 3004
# Получите публичный URL: https://xxxx.ngrok.io
# Используйте его в настройках OAuth приложений
```

---

## Следующие шаги

1. Начинаем с Telegram Login Widget (самый простой)
2. Добавляем Google OAuth (уже есть провайдер)
3. Тестируем оба варианта
4. Добавляем VK и MAX по мере необходимости
5. Telegram Mini App - последним (опционально)

**Начинаем реализацию?**

