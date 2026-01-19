# HeroUI Integration Guide

## Установка

HeroUI успешно интегрирован в проект с поддержкой светлой и темной тем.

### Пакеты
- `@heroui/react` - Основные компоненты
- `@heroui/theme` - Система тем
- `framer-motion` - Анимации (требуется HeroUI)

## Использование

### Импорт компонентов
```tsx
import { Button, Card, Input } from "@heroui/react";
```

### Пример использования Button
```tsx
import { Button } from "@heroui/react";

export default function MyComponent() {
  return (
    <div>
      <Button color="primary">Основная кнопка</Button>
      <Button color="secondary">Вторичная</Button>
      <Button color="success">Успех</Button>
      <Button color="danger">Опасность</Button>
      <Button variant="bordered">С рамкой</Button>
      <Button variant="light">Легкая</Button>
      <Button variant="flat">Плоская</Button>
    </div>
  );
}
```

### Пример использования Card
```tsx
import { Card, CardHeader, CardBody, CardFooter } from "@heroui/react";

export default function MyCard() {
  return (
    <Card>
      <CardHeader>
        <h3>Заголовок</h3>
      </CardHeader>
      <CardBody>
        <p>Содержимое карточки</p>
      </CardBody>
      <CardFooter>
        <Button>Действие</Button>
      </CardFooter>
    </Card>
  );
}
```

### Пример использования Input
```tsx
import { Input } from "@heroui/react";

export default function MyForm() {
  return (
    <Input
      type="email"
      label="Email"
      placeholder="Введите email"
      variant="bordered"
    />
  );
}
```

## Темы

Система тем автоматически синхронизируется с `next-themes`:
- Светлая тема (`light`) - используется по умолчанию
- Темная тема (`dark`) - активируется при переключении

Кастомные цвета определены в `lib/heroui-theme.ts`:
- Primary (синий) - основной цвет
- Secondary (серый) - вторичный цвет
- Success (зеленый) - успех
- Warning (оранжевый) - предупреждение
- Danger (красный) - ошибка

## Миграция существующих компонентов

Постепенно заменяйте существующие UI компоненты на HeroUI:

1. Замените `<button>` на `<Button>` из `@heroui/react`
2. Используйте `<Card>` вместо кастомных карточек
3. Замените `<input>` на `<Input>` из HeroUI
4. Используйте компоненты HeroUI для форм, модалок, и т.д.

## Документация

Полная документация: https://heroui.com/docs
