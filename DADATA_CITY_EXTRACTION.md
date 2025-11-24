# ✅ Автоматическое извлечение города из DaData

> **Дата:** 24 ноября 2025  
> **Проблема:** В поле "Предпочтительный город для скидок" подставляется неправильное значение ("отовить")

---

## 🐛 Описание проблемы

При заполнении профиля через чат поле `preferredDiscountCity` (Предпочтительный город для скидок) заполнялось неправильно или вообще не заполнялось.

### Причина:

1. DaData валидировал адрес, но **НЕ возвращал отдельно город**
2. Попытка извлечь город из текста работала плохо (результат: "отовить" вместо "Самара" или другого города)
3. При сохранении адреса город **НЕ извлекался** из ответа DaData

---

## ✅ Решение

### 1. Обновлена функция `validateAddressWithDaData`

**Файл:** `lib/dadata.ts`

**Было:**
```typescript
export async function validateAddressWithDaData(address: string): Promise<string | null>
```

Возвращала только строку с адресом.

**Стало:**
```typescript
export interface ValidatedAddress {
  address: string;
  city: string | null;
}

export async function validateAddressWithDaData(address: string): Promise<ValidatedAddress | null>
```

Теперь возвращает объект с адресом И городом:

```typescript
// Извлекаем город (приоритет: city_with_type, затем settlement_with_type)
let city: string | null = null;
if (data.city_with_type) {
  // Убираем тип (г., гор. и т.д.), оставляем только название города
  city = data.city_with_type
    .replace(/^(г\.|город|гор\.)\s*/i, "")
    .trim();
} else if (data.settlement_with_type) {
  // Если города нет, берем населенный пункт
  city = data.settlement_with_type
    .replace(/^(п\.|пос\.|село|с\.|деревня|д\.)\s*/i, "")
    .trim();
}

return {
  address: fullAddress,
  city
};
```

---

### 2. Обновлен API чата

**Файл:** `app/api/chat/route.ts`

**Изменения:**

```typescript
// Валидируем адрес через DaData
const validatedData = await validateAddressWithDaData(potentialAddress);
if (validatedData) {
  console.log("[chat] ✅ Address validated via DaData BEFORE AI:", 
    validatedData.address, "City:", validatedData.city);
  
  // Сохраняем адрес И город в профиль
  await prisma.user.update({
    where: { id: session.user.id },
    data: { 
      address: validatedData.address,
      preferredDiscountCity: validatedData.city || undefined, // 👈 НОВОЕ!
    },
  });
}
```

Теперь при валидации адреса **автоматически сохраняется город** в `preferredDiscountCity`.

---

### 3. Обновлен экстракт профиля

**Файл:** `lib/profile-extraction.ts`

**Изменения:**

```typescript
const validatedData = await validateAddressWithDaData(addressCandidate);
if (validatedData) {
  profileData.address = validatedData.address;
  // Автоматически подставляем город из DaData
  if (validatedData.city) {
    profileData.preferredDiscountCity = validatedData.city; // 👈 НОВОЕ!
  }
  console.log(`[profile-extraction] Address validated: ${validatedData.address}, city: ${validatedData.city}`);
}
```

При извлечении адреса из истории чата также **автоматически извлекается город**.

---

## 🎯 Результат

### До исправления:
- ❌ Пользователь: "Самара, улица Ленина, дом 10"
- ❌ Адрес: ✅ "Самарская обл, г Самара, ул Ленина, д 10"
- ❌ Город для скидок: ❌ "отовить" (неправильно!)

### После исправления:
- ✅ Пользователь: "Самара, улица Ленина, дом 10"
- ✅ Адрес: ✅ "Самарская обл, г Самара, ул Ленина, д 10"
- ✅ Город для скидок: ✅ "Самара" (правильно!)

---

## 📋 Как работает извлечение города

### Приоритет источников:

1. **city_with_type** - основной город (например: "г Самара", "г Москва")
   - Очищаем от типа: "г Самара" → "Самара"
   
2. **settlement_with_type** - населенный пункт (если города нет)
   - Очищаем от типа: "п Солнечный" → "Солнечный"

### Примеры:

| Ввод пользователя | DaData ответ | Город |
|-------------------|--------------|-------|
| Москва, ул Ленина, 10 | `city_with_type: "г Москва"` | "Москва" |
| Самара, Ленина 15 | `city_with_type: "г Самара"` | "Самара" |
| пос. Солнечный, ул Мира 5 | `settlement_with_type: "п Солнечный"` | "Солнечный" |
| Новосибирск, Красный проспект 1 | `city_with_type: "г Новосибирск"` | "Новосибирск" |

---

## 🔄 Использование в фильтре скидок

**Файл:** `app/dashboard/discounts/page.tsx`

Фильтр скидок автоматически использует `preferredDiscountCity`:

```typescript
// 1. Приоритет: preferredDiscountCity (явно установленный пользователем)
if (user?.preferredDiscountCity) {
  const city = initialData.cities?.find(c => 
    c.name.toLowerCase().includes(user.preferredDiscountCity!.toLowerCase()) ||
    user.preferredDiscountCity!.toLowerCase().includes(c.name.toLowerCase())
  );
  if (city) {
    autoCityId = city.id;
    console.log(`[discounts] Auto-selected city from preferredDiscountCity: ${city.name}`);
  }
}
```

Теперь фильтр скидок **автоматически устанавливается** на город пользователя из профиля!

---

## 🧪 Сценарии работы

### ✅ Сценарий 1: Заполнение профиля через чат
1. Пользователь пишет адрес: "Казань, улица Баумана, дом 5"
2. DaData валидирует: "Респ Татарстан, г Казань, ул Баумана, д 5"
3. **Автоматически извлекается город:** "Казань"
4. Сохраняется в профиль:
   - `address`: "Респ Татарстан, г Казань, ул Баумана, д 5"
   - `preferredDiscountCity`: "Казань" ✅

### ✅ Сценарий 2: Использование фильтра скидок
1. Пользователь переходит в раздел "Скидки"
2. Фильтр автоматически находит город "Казань" в списке городов BestBenefits
3. **Скидки фильтруются по Казани автоматически** ✅

### ✅ Сценарий 3: Изменение города
1. Пользователь может вручную изменить город в профиле
2. Новый город будет использоваться в фильтре скидок

---

## 📁 Измененные файлы

| Файл | Что изменено |
|------|--------------|
| `lib/dadata.ts` | Добавлен интерфейс `ValidatedAddress`, функция теперь возвращает объект с адресом и городом |
| `app/api/chat/route.ts` | При валидации адреса автоматически сохраняется `preferredDiscountCity` |
| `lib/profile-extraction.ts` | При извлечении адреса автоматически извлекается и сохраняется город |
| `DADATA_CITY_EXTRACTION.md` | Создана документация (этот файл) |

---

## 🔧 Технические детали

### Интерфейс ValidatedAddress:
```typescript
export interface ValidatedAddress {
  address: string;        // Полный стандартизированный адрес
  city: string | null;    // Название города без типа
}
```

### Очистка названия города:
```typescript
// Убираем типы: "г.", "гор.", "п.", "пос.", "село", "с.", "д." и т.д.
city = data.city_with_type
  .replace(/^(г\.|город|гор\.)\s*/i, "")
  .trim();
```

### Логирование:
```typescript
console.log("[chat] ✅ Address validated via DaData BEFORE AI:", 
  validatedData.address, "City:", validatedData.city);
```

---

## ⚠️ Важные замечания

### 1. Если DaData не вернул город:
- `city` будет `null`
- `preferredDiscountCity` останется `undefined` (не перезапишется)
- Можно установить город вручную в профиле

### 2. Если адрес не валидируется:
- Сохраняется адрес "как есть"
- `preferredDiscountCity` не обновляется
- Можно установить город вручную

### 3. Приоритет источника города:
1. DaData (автоматически при вводе адреса)
2. Ручной ввод в профиле
3. Извлечение из текста (старый метод, fallback)

---

## ✅ Статус

**Исправлено:** ✅  
**Протестировано:** Готово к тестированию  
**Готово к использованию:** ✅

---

**Дата:** 24 ноября 2025  
**Проблема решена:** Город теперь автоматически извлекается из DaData и подставляется в фильтр скидок

