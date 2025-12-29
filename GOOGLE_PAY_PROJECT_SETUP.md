# 🔧 Настройка Google Cloud проекта для Google Pay

## Ситуация

Проект `myunion-c3187` не отображается в вашем списке Google Cloud проектов, но он используется в коде Firebase.

## Решения

### Вариант 1: Найти проект через Firebase Console (Рекомендуется)

1. Откройте [Firebase Console](https://console.firebase.google.com/)
2. Войдите с тем же аккаунтом Google
3. Проверьте список проектов - должен быть `myunion-c3187`
4. Если проект есть в Firebase, но нет в Google Cloud Console:
   - В Firebase Console откройте проект `myunion-c3187`
   - Перейдите в **Project Settings** (⚙️)
   - Найдите **Project ID**: `myunion-c3187`
   - Нажмите на ссылку "Go to Cloud Console" - это откроет проект в Google Cloud Console

### Вариант 2: Использовать существующий проект

Если у вас есть другой проект, который вы хотите использовать (например, "XyZnya"):

1. В Google Cloud Console выберите нужный проект
2. Включите Google Pay Passes API в этом проекте
3. Создайте Service Account в этом проекте
4. Обновите конфигурацию в коде (или используйте переменные окружения)

### Вариант 3: Создать новый проект

1. В Google Cloud Console нажмите "New project"
2. Название: `myunion` или `myunion-pro`
3. После создания:
   - Включите Google Pay Passes API
   - Создайте Service Account
   - Настройте Firebase (если нужно)
   - Обновите конфигурацию

### Вариант 4: Запросить доступ к проекту

Если проект `myunion-c3187` существует, но у вас нет доступа:

1. Попросите владельца проекта добавить ваш Google аккаунт
2. Нужна роль: **Owner** или **Editor** (минимум)
3. После получения доступа проект появится в списке

## Что делать дальше?

После того как вы определитесь с проектом:

1. **Включите Google Pay Passes API** в выбранном проекте
2. **Создайте Issuer ID** в [Google Pay Business Console](https://pay.google.com/business/console)
3. **Добавьте переменные окружения** в `.env.local`:
   ```bash
   GOOGLE_PAY_ISSUER_ID=ваш_issuer_id
   GOOGLE_PAY_PROJECT_ID=имя_выбранного_проекта
   ```

## Проверка Service Account

Если используете другой проект, убедитесь что:

1. Service Account существует в выбранном проекте
2. Service Account имеет ключ (JSON файл)
3. Переменная `FIREBASE_PRIVATE_KEY` содержит правильный private key

