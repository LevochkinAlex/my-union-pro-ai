# Настройка Redis на продакшене

## 🎯 Цель
Настроить Redis для кеширования данных и улучшения производительности платформы.

## 📋 Варианты установки

### Вариант 1: Локальная установка на VDS

#### Шаг 1: Установка Redis
```bash
# Подключитесь к серверу
ssh root@194.87.49.210

# Установка Redis
apt-get update
apt-get install -y redis-server

# Проверка установки
redis-cli ping
# Должно вернуть: PONG
```

#### Шаг 2: Настройка Redis
```bash
# Редактируем конфиг
nano /etc/redis/redis.conf

# Изменяем следующие параметры:
# 1. Биндинг (оставляем только localhost для безопасности)
bind 127.0.0.1

# 2. Защищенный режим
protected-mode yes

# 3. Пароль (опционально, но рекомендуется)
requirepass ваш_надежный_пароль

# 4. Память (для продакшена с 20 млн пользователей)
maxmemory 512mb
maxmemory-policy allkeys-lru

# 5. Персистентность (сохранение данных на диск)
save 900 1
save 300 10
save 60 10000
```

#### Шаг 3: Запуск Redis
```bash
# Перезапуск Redis
systemctl restart redis-server

# Автозапуск при перезагрузке
systemctl enable redis-server

# Проверка статуса
systemctl status redis-server
```

#### Шаг 4: Настройка переменных окружения
```bash
# На сервере в /opt/my-union-pro/.env.local
REDIS_URL=redis://localhost:6379
# или с паролем:
REDIS_URL=redis://:ваш_пароль@localhost:6379
```

### Вариант 2: Использование скрипта автоматической установки

```bash
# На локальной машине
export VDS_HOST=194.87.49.210
./scripts/setup-redis-production.sh
```

### Вариант 3: Managed Redis (рекомендуется для продакшена)

#### Upstash Redis (бесплатный тариф до 10K команд/день)
1. Зарегистрируйтесь на https://upstash.com
2. Создайте Redis database
3. Скопируйте URL подключения
4. Добавьте в `.env.local`:
```env
REDIS_URL=redis://default:password@your-redis.upstash.io:6379
```

#### AWS ElastiCache
1. Создайте ElastiCache cluster в AWS
2. Получите endpoint
3. Добавьте в `.env.local`:
```env
REDIS_URL=redis://your-cluster.cache.amazonaws.com:6379
```

#### Redis Cloud
1. Зарегистрируйтесь на https://redis.com/cloud
2. Создайте database
3. Скопируйте URL подключения
4. Добавьте в `.env.local`

## 🔍 Проверка подключения

### На сервере
```bash
# Проверка работы Redis
redis-cli ping

# Проверка с паролем
redis-cli -a ваш_пароль ping

# Проверка статистики
redis-cli INFO stats
```

### В приложении
```bash
# Проверка логов при запуске
pm2 logs my-union-pro | grep Redis

# Должно быть:
# [Redis] Connected successfully
```

## 🔒 Безопасность

1. **Пароль**: Обязательно установите пароль для Redis
2. **Firewall**: Redis должен быть доступен только с localhost
3. **TLS**: Для production рекомендуется использовать TLS (rediss://)

## 📊 Мониторинг

### Проверка использования памяти
```bash
redis-cli INFO memory
```

### Проверка количества ключей
```bash
redis-cli DBSIZE
```

### Мониторинг через API
```bash
# Получить статистику производительности
curl https://myunion.pro/api/admin/performance \
  -H "Authorization: Bearer YOUR_TOKEN"
```

## 🐛 Troubleshooting

### Redis не подключается
1. Проверьте, что Redis запущен: `systemctl status redis-server`
2. Проверьте переменную `REDIS_URL` в `.env.local`
3. Проверьте логи: `pm2 logs my-union-pro | grep Redis`

### Ошибка "Connection refused"
```bash
# Проверьте, что Redis слушает на правильном порту
netstat -tlnp | grep 6379

# Должно быть:
# tcp  0  0  127.0.0.1:6379  0.0.0.0:*  LISTEN  redis-server
```

### Ошибка "NOAUTH Authentication required"
- Проверьте, что пароль в `REDIS_URL` правильный
- Или уберите пароль из конфига Redis

### Медленная работа
- Увеличьте `maxmemory` в конфиге
- Проверьте использование памяти: `redis-cli INFO memory`
- Очистите кеш: `redis-cli FLUSHALL` (осторожно!)

## 📈 Оптимизация для 20 млн пользователей

### Рекомендуемые настройки
```conf
# Память (зависит от размера VDS)
maxmemory 2gb
maxmemory-policy allkeys-lru

# Персистентность (для надежности)
save 900 1
save 300 10
save 60 10000

# Логирование (для отладки)
loglevel notice
```

### Мониторинг производительности
- Используйте `/api/admin/performance` для отслеживания метрик
- Настройте алерты при медленных запросах (>500ms)
- Отслеживайте cache hit rate (должен быть >80%)

## ✅ Чеклист

- [ ] Redis установлен и запущен
- [ ] Redis настроен (пароль, память, персистентность)
- [ ] `REDIS_URL` добавлен в `.env.local`
- [ ] Приложение подключается к Redis (проверка логов)
- [ ] Кеш работает (проверка через `/api/admin/performance`)
- [ ] Мониторинг настроен
- [ ] Бэкапы Redis настроены (если используется персистентность)

