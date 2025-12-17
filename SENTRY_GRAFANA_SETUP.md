# Настройка Sentry и Grafana

## 🎯 Цель
Интеграция Sentry для мониторинга ошибок и Grafana для визуализации метрик в админ-панели.

## ✅ Что уже реализовано

### 1. Sentry интеграция
- ✅ Установлен `@sentry/nextjs`
- ✅ Созданы конфигурационные файлы:
  - `sentry.client.config.ts` - для клиентской части
  - `sentry.server.config.ts` - для серверной части
  - `sentry.edge.config.ts` - для edge runtime
- ✅ Интеграция с `lib/logger.ts` - автоматическая отправка ошибок в Sentry
- ✅ Страница мониторинга в админке: `/admin/monitoring`

### 2. Grafana интеграция
- ✅ Страница мониторинга с ссылкой на Grafana
- ✅ Отображение системных метрик
- ✅ Отображение метрик производительности

## 📋 Настройка Sentry

### Шаг 1: Регистрация в Sentry
1. Перейдите на https://sentry.io/signup/
2. Создайте аккаунт (можно через GitHub)
3. Создайте новый проект:
   - Platform: **Next.js**
   - Project Name: `my-union-pro`

### Шаг 2: Получение DSN
После создания проекта вы получите DSN (Data Source Name):
```
https://xxxxx@xxxxx.ingest.sentry.io/xxxxx
```

### Шаг 3: Добавление в переменные окружения
```bash
# На сервере в /opt/my-union-pro/.env.local
NEXT_PUBLIC_SENTRY_DSN=https://xxxxx@xxxxx.ingest.sentry.io/xxxxx
```

### Шаг 4: Перезапуск приложения
```bash
pm2 restart my-union-pro
```

### Шаг 5: Проверка
1. Зайдите в админку: `/admin/monitoring`
2. Должна появиться кнопка "Открыть Sentry"
3. В Sentry должны появиться ошибки (если есть)

## 📊 Настройка Grafana

### Вариант 1: Установка на своем сервере (рекомендуется)

#### Шаг 1: Установка Grafana
```bash
# На сервере
ssh root@194.87.49.210

# Установка Grafana
wget -q -O - https://packages.grafana.com/gpg.key | apt-key add -
echo "deb https://packages.grafana.com/oss/deb stable main" | tee -a /etc/apt/sources.list.d/grafana.list
apt-get update
apt-get install -y grafana

# Запуск Grafana
systemctl start grafana-server
systemctl enable grafana-server
```

#### Шаг 2: Настройка доступа
```bash
# Настройка порта (по умолчанию 3000)
# Если порт занят, измените в /etc/grafana/grafana.ini:
# http_port = 3001

# Настройка домена (опционально)
# Добавьте в nginx конфиг для проксирования на Grafana
```

#### Шаг 3: Первый вход
1. Откройте `http://194.87.49.210:3000` (или ваш домен)
2. Логин: `admin`
3. Пароль: `admin` (измените при первом входе!)

#### Шаг 4: Добавление URL в переменные окружения
```bash
# На сервере в /opt/my-union-pro/.env.local
GRAFANA_URL=http://194.87.49.210:3000
# или с доменом:
GRAFANA_URL=https://grafana.myunion.pro
```

### Вариант 2: Grafana Cloud (бесплатный план)
1. Зарегистрируйтесь на https://grafana.com/auth/sign-up/create-account
2. Создайте бесплатный аккаунт
3. Получите URL вашего инстанса: `https://xxxxx.grafana.net`
4. Добавьте в `.env.local`:
```env
GRAFANA_URL=https://xxxxx.grafana.net
```

## 🔧 Настройка Prometheus (для Grafana)

### Установка Prometheus
```bash
# На сервере
cd /opt
wget https://github.com/prometheus/prometheus/releases/download/v2.45.0/prometheus-2.45.0.linux-amd64.tar.gz
tar xvfz prometheus-2.45.0.linux-amd64.tar.gz
cd prometheus-2.45.0.linux-amd64

# Создание конфига
cat > prometheus.yml << EOF
global:
  scrape_interval: 15s

scrape_configs:
  - job_name: 'nodejs'
    static_configs:
      - targets: ['localhost:9090']
EOF

# Запуск через systemd
cat > /etc/systemd/system/prometheus.service << EOF
[Unit]
Description=Prometheus
After=network.target

[Service]
Type=simple
User=root
ExecStart=/opt/prometheus-2.45.0.linux-amd64/prometheus --config.file=/opt/prometheus-2.45.0.linux-amd64/prometheus.yml
Restart=always

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl start prometheus
systemctl enable prometheus
```

### Добавление Prometheus в Grafana
1. Зайдите в Grafana
2. Configuration → Data Sources → Add data source
3. Выберите Prometheus
4. URL: `http://localhost:9090`
5. Save & Test

## 📈 Создание дашбордов в Grafana

### Дашборд для системных метрик
1. Create → Dashboard → Add visualization
2. Выберите Prometheus как источник данных
3. Добавьте панели:
   - CPU usage
   - Memory usage
   - Disk usage
   - Database connections

### Дашборд для производительности API
Используйте метрики из `/api/admin/system-metrics` и `/api/admin/performance`

## 🔍 Использование

### Просмотр мониторинга
1. Зайдите в админку: `/admin/monitoring`
2. Увидите:
   - Системные метрики (CPU, память, диск, БД)
   - Метрики Redis
   - Производительность API
   - Ссылки на Sentry и Grafana

### Просмотр ошибок в Sentry
1. Нажмите "Открыть Sentry" в админке
2. Или перейдите напрямую на https://sentry.io
3. Увидите все ошибки с:
   - Stack trace
   - Контекстом запроса
   - Информацией о пользователе
   - Историей ошибок

### Просмотр метрик в Grafana
1. Нажмите "Открыть Grafana" в админке
2. Или перейдите напрямую на ваш Grafana URL
3. Просматривайте дашборды с метриками

## 🎯 Что мониторится

### Sentry (автоматически):
- ✅ Все ошибки через `Logger.error()`
- ✅ Критические ошибки через `Logger.critical()`
- ✅ Stack traces
- ✅ Контекст запроса
- ✅ Информация о пользователе

### Grafana (через Prometheus):
- ✅ Системные метрики (CPU, память, диск)
- ✅ Метрики БД
- ✅ Метрики Redis
- ✅ Метрики API (можно добавить экспортер)

### Свой мониторинг (в админке):
- ✅ Системные метрики в реальном времени
- ✅ Производительность API
- ✅ Cache hit rate
- ✅ Медленные запросы

## 💰 Стоимость

### Sentry:
- **Free:** 5,000 событий/месяц - $0
- **Team:** 50,000 событий/месяц - $26/месяц
- **Business:** 200,000 событий/месяц - $80/месяц

### Grafana:
- **Self-hosted:** Бесплатно (open source)
- **Grafana Cloud:** Бесплатный план доступен

## ✅ Чеклист

- [ ] Зарегистрироваться в Sentry
- [ ] Получить DSN и добавить в `.env.local`
- [ ] Установить Grafana (или использовать Cloud)
- [ ] Добавить `GRAFANA_URL` в `.env.local`
- [ ] Перезапустить приложение
- [ ] Проверить `/admin/monitoring`
- [ ] Настроить дашборды в Grafana (опционально)

## 🐛 Troubleshooting

### Sentry не работает
1. Проверьте `NEXT_PUBLIC_SENTRY_DSN` в `.env.local`
2. Проверьте логи: `pm2 logs my-union-pro | grep Sentry`
3. Убедитесь, что DSN правильный

### Grafana не открывается
1. Проверьте, что Grafana запущен: `systemctl status grafana-server`
2. Проверьте порт: `netstat -tlnp | grep 3000`
3. Проверьте `GRAFANA_URL` в `.env.local`

### Метрики не обновляются
1. Проверьте API: `curl http://localhost:3004/api/admin/system-metrics`
2. Проверьте Redis подключение
3. Проверьте логи приложения

