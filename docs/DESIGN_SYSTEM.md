# Единая дизайн-система MyUnion Pro

## Обзор

Единая дизайн-система обеспечивает консистентность UI/UX во всем приложении. Все компоненты должны использовать единые стили, цвета, отступы и радиусы скругления.

## Основные принципы

1. **Единый цвет**: Используется `blue` вместо `indigo` везде
2. **Единые отступы**: `px-4 py-2.5` для всех полей ввода
3. **Единый border-radius**: `rounded-lg` (8px) для полей, `rounded-xl` (12px) для модалок
4. **Единые focus стили**: `focus:ring-2 focus:ring-blue-500 focus:border-blue-500`
5. **Плавные переходы**: `transition-colors` для всех интерактивных элементов

## Цветовая палитра

### Primary (Blue)
- `blue-50` - Светлый фон
- `blue-100` - Вторичные кнопки
- `blue-500` - Основной цвет, focus
- `blue-600` - Primary кнопки
- `blue-700` - Hover состояния

### Gray
- `gray-50` - Светлый фон
- `gray-100` - Hover состояния
- `gray-300` - Границы
- `gray-600` - Темный режим границы
- `gray-800` - Темный фон
- `gray-900` - Темный фон модалок

## Компоненты

### Поля ввода (Input, TextArea)

**Базовые стили:**
```tsx
className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-700 rounded-lg 
  focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 
  dark:bg-gray-800 dark:text-white text-sm shadow-sm transition-colors"
```

**Пример использования:**
```tsx
<input
  type="text"
  className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-700 rounded-lg 
    focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 
    dark:bg-gray-800 dark:text-white text-sm shadow-sm transition-colors"
/>
```

### Кнопки

**Primary:**
```tsx
className="px-4 py-2.5 bg-blue-600 text-white rounded-lg 
  hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 
  transition-colors text-sm font-semibold"
```

**Secondary:**
```tsx
className="px-4 py-2.5 bg-blue-100 text-blue-700 rounded-lg 
  hover:bg-blue-200 focus:ring-2 focus:ring-blue-500 
  dark:bg-blue-900/20 dark:text-blue-400 
  transition-colors text-sm font-semibold"
```

### Модалки

**Backdrop:**
```tsx
className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50"
```

**Контент:**
```tsx
className="bg-white dark:bg-gray-900 rounded-xl shadow-xl 
  w-full max-w-md max-h-[90vh] flex flex-col"
```

## Использование дизайн-системы

### Импорт констант

```tsx
import { colors, borderRadius, spacing, inputStyles, buttonStyles, cn } from '@/lib/design-system';
```

### Примеры

**Поле ввода:**
```tsx
<input
  className={cn(
    inputStyles.base,
    inputStyles.default,
    "placeholder-gray-400"
  )}
/>
```

**Кнопка:**
```tsx
<button
  className={cn(
    buttonStyles.base,
    buttonStyles.primary,
    buttonStyles.sizes.md
  )}
>
  Отправить
</button>
```

## Правила

1. **НЕ используйте** прямые `<input>` или `<textarea>` без единых стилей
2. **НЕ используйте** `indigo` цвета - только `blue`
3. **НЕ используйте** разные отступы - только `px-4 py-2.5` для полей
4. **ВСЕГДА используйте** `transition-colors` для интерактивных элементов
5. **ВСЕГДА используйте** `shadow-sm` для полей ввода
6. **ВСЕГДА используйте** `rounded-lg` для полей, `rounded-xl` для модалок

## Компоненты из дизайн-системы

- `InputField` - `/components/ui/InputField.tsx`
- `TextArea` - `/components/ui/TextArea.tsx`
- `Button` - `/components/ui/button/Button.tsx`
- `Modal` - `/components/ui/modal/index.tsx`

## Миграция

При обновлении существующих компонентов:

1. Замените все `indigo` на `blue`
2. Унифицируйте отступы: `px-4 py-2.5`
3. Добавьте `focus:border-blue-500` к focus стилям
4. Добавьте `shadow-sm` и `transition-colors`
5. Используйте `rounded-lg` для полей, `rounded-xl` для модалок
