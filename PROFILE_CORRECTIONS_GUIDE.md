# Руководство по исправлению данных профиля через чат

## Обзор

Система позволяет пользователям исправлять данные профиля прямо в чате, не требуя повторного заполнения всех полей заново. Бот распознает исправления и автоматически обновляет соответствующие поля в базе данных.

## Как это работает

### 1. Архитектура

```
Пользователь → Сообщение с исправлением
              ↓
Бот (AI) → Распознает исправление → Добавляет маркер [UPDATE_FIELD: поле=значение]
              ↓
Сервер → Обрабатывает маркер → Обновляет поле в БД → Удаляет маркер
              ↓
Пользователь ← Получает подтверждение
```

### 2. Компоненты

#### A. Промпт бота (`app/api/chat/route.ts`)

Инструкции для AI о распознавании исправлений:

```typescript
### ИСПРАВЛЕНИЕ ДАННЫХ:
Если пользователь замечает ошибку в данных ПОСЛЕ того как они уже собраны:
- Внимательно слушай что именно пользователь хочет исправить
- Примеры фраз для исправления:
  * "Неправильно указал адрес, правильный: [новый адрес]"
  * "Ошибка в дате рождения, должно быть [новая дата]"
  * "Моя должность не [старая], а [новая]"
  * "Исправьте фамилию на [новая фамилия]"
  * "Хочу изменить телефон на [новый телефон]"
- Когда распознаешь исправление:
  1. Определи какое поле нужно исправить
  2. Извлеки новое значение
  3. Добавь маркер: [UPDATE_FIELD: поле=новое_значение]
  4. Подтверди пользователю: "Хорошо, я исправил [поле] на [новое значение]"
```

#### B. Обработчик маркеров (`app/api/chat/route.ts`, строки 1329-1378)

```typescript
// Проверяем есть ли маркер [UPDATE_FIELD: ...] в ответе бота
const updateFieldPattern = /\[UPDATE_FIELD:\s*(\w+)=([^\]]+)\]/g;
let updateFieldMatch;
const fieldsToUpdate: Array<{field: string, value: string}> = [];

while ((updateFieldMatch = updateFieldPattern.exec(aiResponse)) !== null) {
  const field = updateFieldMatch[1];
  const value = updateFieldMatch[2].trim();
  fieldsToUpdate.push({ field, value });
}

// Обновляем поля в БД
for (const { field, value } of fieldsToUpdate) {
  // Валидация и преобразование
  // Обновление в prisma
  await prisma.user.update({ ... });
}

// Удаляем маркеры из ответа
aiResponse = aiResponse.replace(updateFieldPattern, '').trim();
```

#### C. API для обновления полей (`app/api/chat/update-profile-field/route.ts`)

Дополнительный API для программного обновления полей (если нужно).

## Примеры использования

### Пример 1: Исправление адреса

**Пользователь:**
> Я ошибся с адресом, правильный: Москва, ул. Пушкина, д. 15, кв. 42

**Бот распознает:**
- Поле: `address`
- Новое значение: `Москва, ул. Пушкина, д. 15, кв. 42`
- Добавляет маркер: `[UPDATE_FIELD: address=Москва, ул. Пушкина, д. 15, кв. 42]`

**Бот отвечает:**
> Хорошо, я исправил адрес на "Москва, ул. Пушкина, д. 15, кв. 42". Проверьте правильность.

**Сервер:**
- Обновляет `user.address` в БД
- Удаляет маркер перед сохранением сообщения
- Пользователь видит чистый ответ без маркеров

### Пример 2: Исправление даты рождения

**Пользователь:**
> Ошибка в дате рождения, должно быть 15.03.1985, а не 15.03.1995

**Бот:**
> Понял, исправил дату рождения на 15.03.1985. [UPDATE_FIELD: dateOfBirth=15.03.1985]

**Сервер:**
- Парсит дату в формат `Date`
- Обновляет `user.dateOfBirth`
- Удаляет маркер

### Пример 3: Исправление ФИО

**Пользователь:**
> Моя фамилия Иванов-Петров через дефис, а не просто Иванов

**Бот:**
> Отлично, записал вашу фамилию как "Иванов-Петров". [UPDATE_FIELD: lastName=Иванов-Петров]

**Сервер:**
- Обновляет `user.lastName = "Иванов-Петров"`

### Пример 4: Множественные исправления

**Пользователь:**
> Исправьте мою должность на "Старший врач" и телефон на +7 999 888 77 66

**Бот:**
> Хорошо, я исправил:
> 1. Должность на "Старший врач" [UPDATE_FIELD: jobTitle=Старший врач]
> 2. Телефон на "+7 999 888 77 66" [UPDATE_FIELD: phone=+7 999 888 77 66]

**Сервер:**
- Обрабатывает оба маркера
- Обновляет оба поля в БД

## Поддерживаемые поля

| Поле | Описание | Валидация |
|------|----------|-----------|
| `firstName` | Имя | Строка, 2-50 символов |
| `lastName` | Фамилия | Строка, 2-50 символов |
| `middleName` | Отчество | Строка, 2-50 символов |
| `dateOfBirth` | Дата рождения | Парсится в Date, возраст 14-100 лет |
| `phone` | Телефон | 10-12 цифр |
| `address` | Адрес проживания | Строка, 5-500 символов |
| `region` | Регион | Строка, 2-100 символов |
| `jobTitle` | Должность | Строка, 2-200 символов |
| `profession` | Профессия | Строка, 2-200 символов |
| `education` | Образование | Строка, 2-300 символов |

## Формат маркера

```
[UPDATE_FIELD: fieldName=fieldValue]
```

- `fieldName` - название поля (из списка выше)
- `fieldValue` - новое значение (может содержать пробелы и спецсимволы, кроме `]`)

**Примеры корректных маркеров:**
```
[UPDATE_FIELD: firstName=Иван]
[UPDATE_FIELD: address=Москва, ул. Ленина, д. 10]
[UPDATE_FIELD: dateOfBirth=15.03.1985]
[UPDATE_FIELD: phone=+7 999 123 45 67]
```

**Некорректные маркеры:**
```
[UPDATE_FIELD:firstName=Иван]  ❌ Нет пробела после двоеточия
[UPDATE_FIELD: unknown_field=value]  ❌ Поле не в whitelist
[UPDATE_FIELD: address=]  ❌ Пустое значение
```

## Обработка ошибок

### 1. Некорректное поле
```typescript
if (!allowedFields.includes(field)) {
  console.warn(`[chat] Field ${field} is not allowed for update`);
  // Маркер игнорируется
}
```

### 2. Ошибка валидации
```typescript
try {
  // Валидация и обновление
} catch (updateError) {
  console.error(`[chat] Error updating field ${field}:`, updateError);
  // Ошибка логируется, но не прерывает работу чата
}
```

### 3. Ошибка парсинга даты
```typescript
if (field === 'dateOfBirth') {
  const datePattern = /(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{4})/;
  const match = value.match(datePattern);
  if (match) {
    // Успешный парсинг
  } else {
    // Дата не распознана - используется как есть или игнорируется
  }
}
```

## Логирование

### Обнаружение маркера:
```
[chat] 🔄 Detected field update request: address = Москва, ул. Ленина 10
```

### Успешное обновление:
```
[chat] ✅ Field address updated to: Москва, ул. Ленина 10
```

### Ошибка обновления:
```
[chat] ⚠️ Error updating field address: ValidationError: ...
```

## Преимущества подхода

### 1. Естественный язык
Пользователь может писать исправления как угодно:
- "Исправьте адрес на ..."
- "Моя фамилия неправильная, правильная ..."
- "Хочу изменить телефон"

Бот сам понимает намерение и формирует маркер.

### 2. Не требует повторного заполнения
Исправляется только конкретное поле, остальные данные остаются без изменений.

### 3. Прозрачность
Бот явно подтверждает что исправление принято:
> "Хорошо, я исправил адрес на 'новый адрес'. Проверьте правильность."

### 4. Безопасность
- Whitelist разрешенных полей
- Валидация значений перед сохранением
- Маркеры удаляются и не видны пользователю

### 5. Логирование
Все исправления логируются для аудита:
```
[chat] 🔄 User cmXXX updated address from "старый" to "новый"
```

## Расширение функциональности

### Добавление нового поля

1. Добавьте поле в whitelist:
```typescript
const allowedFields = [
  'firstName', 'lastName', ..., 'newField'
];
```

2. Добавьте валидацию (если нужна):
```typescript
if (field === 'newField') {
  // Специальная валидация
  validatedValue = validateNewField(value);
}
```

3. Обновите промпт бота:
```typescript
### ИСПРАВЛЕНИЕ ДАННЫХ:
...
  * "Исправьте [новое поле] на [значение]"
```

### Добавление истории изменений

Можно добавить таблицу `ProfileChangeLog`:
```prisma
model ProfileChangeLog {
  id String @id @default(cuid())
  userId String
  field String
  oldValue String?
  newValue String
  changedAt DateTime @default(now())
  changedBy String // "user" или "bot"
  
  user User @relation(fields: [userId], references: [id])
}
```

И логировать все изменения:
```typescript
await prisma.profileChangeLog.create({
  data: {
    userId: session.user.id,
    field,
    oldValue: currentUser[field],
    newValue: validatedValue,
    changedBy: 'user',
  }
});
```

## Тестирование

### Юнит-тесты

```typescript
describe('UPDATE_FIELD marker processing', () => {
  it('should extract field and value from marker', () => {
    const aiResponse = "Исправил! [UPDATE_FIELD: address=Москва]";
    const pattern = /\[UPDATE_FIELD:\s*(\w+)=([^\]]+)\]/g;
    const match = pattern.exec(aiResponse);
    
    expect(match[1]).toBe('address');
    expect(match[2]).toBe('Москва');
  });
  
  it('should handle multiple markers', () => {
    const aiResponse = "[UPDATE_FIELD: firstName=Иван] [UPDATE_FIELD: lastName=Петров]";
    // Тест множественных маркеров
  });
});
```

### Интеграционные тесты

```typescript
describe('Profile correction via chat', () => {
  it('should update user address when correction is detected', async () => {
    const user = await createTestUser();
    const message = "Исправьте адрес на 'Новый адрес'";
    
    const response = await POST('/api/chat', {
      body: { message },
      session: { user: { id: user.id } }
    });
    
    const updatedUser = await prisma.user.findUnique({ 
      where: { id: user.id } 
    });
    
    expect(updatedUser.address).toBe('Новый адрес');
  });
});
```

## Заключение

Функционал исправления данных через чат:
- ✅ Работает на продакшене
- ✅ Поддерживает все основные поля профиля
- ✅ Безопасен (whitelist + валидация)
- ✅ Прозрачен для пользователя
- ✅ Логируется для аудита
- ✅ Легко расширяется

Пользователи могут свободно исправлять ошибки в данных через естественный язык, не заполняя заново весь профиль.

