# Чеклист проверки доставки сообщений и push-уведомлений

## ✅ Проверено перед деплоем

### 1. WebSocket доставка сообщений
- ✅ `emitNewMessage` вызывается в `/api/chat/[chatId]/route.ts` (POST)
- ✅ `emitNewMessage` вызывается в `/api/chat/[chatId]/attachments/route.ts` (POST)
- ✅ Формат комнаты: используется просто `chatId` (без префикса `chat:`)
- ✅ В `server/socket.ts` клиенты присоединяются к комнате через `socket.join(chatId)`
- ✅ Событие `message:new` отправляется в комнату через `io.to(chatId).emit()`

### 2. Push-уведомления через Firebase
- ✅ Настроены в обоих endpoint'ах (обычные сообщения и вложения)
- ✅ Отправляются всем участникам чата кроме отправителя
- ✅ Используется `sendEachForMulticast` для массовой отправки
- ✅ Включают `chatId` и `messageId` в data для навигации
- ✅ Service worker обрабатывает клики по уведомлениям с правильным URL

### 3. Redis для масштабирования
- ✅ Redis adapter для Socket.io настроен
- ✅ Кэширование списков чатов (TTL: 30 сек)
- ✅ Redis утилиты для typing indicators и online status

## 🚀 Команды для деплоя

```bash
ssh root@194.87.49.210
cd /opt/my-union-pro
git pull origin main
pnpm install
npx prisma db push --accept-data-loss
npx prisma generate
pnpm build
pm2 restart my-union-pro
pm2 logs my-union-pro --lines 50
```

## 🔍 Проверка после деплоя

1. **WebSocket соединение:**
   - Откройте консоль браузера
   - Проверьте логи `[useChat] ✅ Socket connected`
   - Отправьте сообщение и проверьте, что оно приходит в реальном времени

2. **Push-уведомления:**
   - Откройте приложение в двух разных браузерах/устройствах
   - Отправьте сообщение с одного устройства
   - Проверьте, что push-уведомление приходит на другое устройство
   - Проверьте, что клик по уведомлению открывает правильный чат

3. **Логи сервера:**
   ```bash
   pm2 logs my-union-pro --lines 100 | grep -E "(chat|socket|push|notification)"
   ```

4. **Проверка Redis:**
   ```bash
   redis-cli ping
   redis-cli keys "user:chats:*" | head -5
   ```

## ⚠️ Возможные проблемы

1. **WebSocket не работает:**
   - Проверьте, что Socket.io сервер запущен
   - Проверьте переменные окружения `NEXT_PUBLIC_SOCKET_URL`
   - Проверьте логи на наличие ошибок подключения

2. **Push-уведомления не приходят:**
   - Проверьте, что Firebase Admin SDK настроен
   - Проверьте, что FCM токены сохраняются в БД
   - Проверьте логи Firebase в консоли

3. **Redis ошибки:**
   - Проверьте, что Redis запущен: `redis-cli ping`
   - Проверьте переменные окружения `REDIS_URL`
   - Socket.io будет работать без Redis (fallback на in-memory)
