# Темы и UI компоненты MyUnion Pro

## 🎨 Поддержка светлой и темной темы

Система полностью поддерживает светлую и темную темы с автоматическим переключением.

### Настройка темы

Тема настроена в `components/Providers.tsx`:
- По умолчанию использует системную тему (`defaultTheme="system"`)
- Автоматически адаптируется к настройкам ОС
- Сохраняет выбор пользователя в localStorage

### Компоненты для работы с темами

#### 1. ThemeToggle
Кнопка переключения темы:

```tsx
import ThemeToggle from "@/components/ThemeToggle";

<ThemeToggle />
```

#### 2. Logo
Логотип с автоматическим переключением по теме:

```tsx
import Logo from "@/components/Logo";

<Logo size="md" />
// size: "sm" | "md" | "lg"
```

#### 3. LogoIcon
Иконка приложения с автоматическим переключением:

```tsx
import { LogoIcon } from "@/components/Logo";

<LogoIcon size="md" />
```

## 📦 Ресурсы

### Логотипы
- `public/Logo_dark_theme.svg` - для темной темы или темного фона
- `public/Logo_light_theme.svg` - для светлой темы или светлого фона

### Иконки
- `public/icon_dark.svg` - иконка приложения для темной темы
- `public/icon_light.svg` - иконка приложения для светлой темы

## 🎯 Стилизация компонентов

### Правила для поддержки обеих тем

Всегда добавляйте `dark:` классы для элементов:

```tsx
// Текст
className="text-gray-900 dark:text-white"

// Фон
className="bg-white dark:bg-gray-800"

// Границы
className="border-gray-300 dark:border-gray-600"

// Инпуты
className="bg-white dark:bg-gray-700 text-gray-900 dark:text-white"

// Кнопки
className="bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600"
```

### Примеры готовых компонентов

#### Форма входа
`app/(auth)/login/page.tsx` - полностью поддерживает обе темы

#### Layout авторизации
`app/(auth)/layout.tsx` - адаптивный layout с поддержкой тем

## 🔧 Как добавить поддержку темы в новый компонент

1. Добавьте `dark:` классы для всех цветовых элементов
2. Используйте `Logo` или `LogoIcon` вместо статичных логотипов
3. Тестируйте в обеих темах

```tsx
"use client";

export default function MyComponent() {
  return (
    <div className="bg-white dark:bg-gray-800 p-4 rounded-lg">
      <h1 className="text-gray-900 dark:text-white">
        Заголовок
      </h1>
      <p className="text-gray-600 dark:text-gray-400">
        Описание
      </p>
    </div>
  );
}
```

## 📱 Тестирование

Для тестирования обеих тем:
1. Откройте приложение
2. Используйте `ThemeToggle` для переключения
3. Проверьте все элементы на читаемость
4. Убедитесь, что логотипы меняются автоматически

---

**Важно:** Все новые компоненты должны поддерживать обе темы с момента создания!

