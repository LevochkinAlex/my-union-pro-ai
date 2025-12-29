# 🔐 Настройка ролей для Google Pay Passes API

## Текущая ситуация

У Service Account `firebase-adminsdk-fbsvc@myunion-c3187.iam.gserviceaccount.com` есть:
- ✅ Firebase Admin SDK Administrator Service Agent
- ✅ Service Account Token Creator

## Варианты решения

### Вариант 1: Использовать существующую роль (САМЫЙ ПРОСТОЙ)

Роль **"Service Account Token Creator"** может быть достаточной для работы с Google Pay Passes API. Давайте сначала попробуем включить API и протестировать.

### Вариант 2: Добавить роль через Grant Access

1. На странице IAM нажмите кнопку **"Grant access"** (слева над таблицей)
2. В поле **"New principals"** введите: `firebase-adminsdk-fbsvc@myunion-c3187.iam.gserviceaccount.com`
3. В поле **"Select a role"** начните вводить **"Wallet"** или **"Pay"**
4. Ищите роли связанные с Google Wallet/Pay:
   - **"Google Pay Passes API Admin"** (если доступна)
   - **"Google Wallet API Admin"** (альтернатива)
   - Или любую роль с "Wallet" или "Pay" в названии

### Вариант 3: Добавить роль через Service Account напрямую

1. В Google Cloud Console перейдите: **IAM & Admin** → **Service Accounts**
2. Найдите и кликните на: `firebase-adminsdk-fbsvc@myunion-c3187.iam.gserviceaccount.com`
3. Перейдите на вкладку **"PERMISSIONS"** (или **"IAM"**)
4. Нажмите **"Grant Access"** или **"ADD PRINCIPAL"**
5. В поле роли ищите роли с "Wallet" или "Pay"

### Вариант 4: Включить API сначала

Возможно роль появится только после включения API:

1. Перейдите: **APIs & Services** → **Library**
2. Найдите и включите **"Google Wallet API"** или **"Google Pay Passes API"**
3. После включения вернитесь в IAM и проверьте список ролей снова

## Рекомендация

**Начните с Варианта 1 + 4:**
1. Сначала включите Google Wallet API
2. Попробуйте использовать существующую роль "Service Account Token Creator"
3. Если возникнут ошибки 403/401, тогда добавите дополнительную роль через Grant Access

## Проверка работы

После настройки попробуйте использовать API. Если получите ошибку:
- **401/403** - нужна дополнительная роль
- **404** - API не включен
- **409** - объект уже существует (это нормально)

