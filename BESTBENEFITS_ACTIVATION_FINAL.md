# BestBenefits API - Активация скидок

## 🔍 Результаты тестирования

### Протестированы все возможные endpoints:

1. **POST /api/user/products** → `405 Method Not Allowed`
   - Response: `"The POST method is not supported for route api/user/products. Supported methods: GET, HEAD."`

2. **POST /api/user/activate_product** → `405 Method Not Allowed`
   - Response: `"The POST method is not supported for route api/user/activate_product. Supported methods: GET, HEAD."`

3. **POST /api/products/activate** → `405 Method Not Allowed`
   - Response: `"The POST method is not supported for route api/products/activate. Supported methods: GET, HEAD."`

4. **POST /api/products/{id}/activate** → `405 Method Not Allowed`
   - Response: `"The POST method is not supported for route api/products/{id}/activate. Supported methods: GET, HEAD."`

5. **PUT /api/user/products** → `405 Method Not Allowed`
   - Response: `"The PUT method is not supported for route api/user/products. Supported methods: GET, HEAD."`

6. **POST /api/user/claim_product** → `405 Method Not Allowed`
   - Response: `"The POST method is not supported for route api/user/claim_product. Supported methods: GET, HEAD."`

7. **POST /api/activate** → `405 Method Not Allowed`
   - Response: `"The POST method is not supported for route api/activate. Supported methods: GET, HEAD."`

8. **GET /api/products/{id}/activate?user_id={email}** → `200 OK` (HTML 404 страница)
   - Response: HTML страница BestBenefits с ошибкой 404

## ❌ Вывод

**BestBenefits API НЕ ПОДДЕРЖИВАЕТ активацию скидок через API.**

Все endpoints, которые могут быть использованы для активации, либо:
- Поддерживают только GET/HEAD методы (не POST/PUT/PATCH)
- Возвращают HTML страницы, а не JSON

## ✅ Решение

### Текущая реализация:

1. **Локальное сохранение активации**
   - Активация сохраняется в нашей БД через `DiscountPreference`
   - Формат: `claimed: [{ id: number, promoCode: string | null }]`

2. **Ручная активация на BestBenefits**
   - Пользователь должен активировать скидку вручную на `bestbenefits.ru`
   - Открываем ссылку на BestBenefits в кнопке "Открыть"

3. **Синхронизация активированных скидок**
   - Синхронизация подтягивает уже активированные скидки через `GET /api/user/products?user_id={id}`
   - Автоматически вызывается при загрузке страницы "Мои скидки"

## 📋 Поток работы

```
1. Пользователь нажимает "Использовать"
   ↓
2. Активация сохраняется локально в нашей БД ✅
   ↓
3. Показывается модалка "Скидка активирована!"
   ↓
4. Пользователь может открыть сайт BestBenefits для ручной активации
   ↓
5. После активации на BestBenefits, синхронизация подтянет промокод ✅
```

## 💡 Если BestBenefits добавит API активации в будущем

Если BestBenefits API добавит поддержку активации через API, нужно будет:

1. Найти правильный endpoint (скорее всего POST с телом запроса)
2. Обновить функцию `activateBestBenefitsDiscount` в `lib/best-benefits-activation.ts`
3. Обновить `safeActivateDiscount` для использования нового endpoint
4. Проверить формат ответа и извлечение промокода

## 🔍 Проверка активации

Текущая проверка активации:
- После попытки активации проверяем список активированных скидок через `getUserActivatedDiscounts`
- Если скидка найдена в списке → активация успешна
- Если не найдена → активация не прошла (пользователь должен активировать вручную)

## 📌 Важные файлы

- `lib/best-benefits-activation.ts` - функции активации и синхронизации
- `app/api/discounts/activate/route.ts` - API endpoint активации
- `app/api/discounts/sync/route.ts` - API endpoint синхронизации
- `app/dashboard/discounts/my/page.tsx` - страница "Мои скидки" (автосинхронизация)

