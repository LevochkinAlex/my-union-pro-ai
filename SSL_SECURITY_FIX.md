# 🔒 Исправление проблемы "Подозрительный сайт" при переходе с почты

## Проблема
Браузер показывает предупреждение "Подозрительный сайт" при переходе по ссылкам из писем, хотя SSL сертификат установлен.

## Решение

### 1. Исправление конфигурации nginx на сервере

Выполните на сервере следующие команды:

```bash
# Подключитесь к серверу
ssh root@194.87.49.210

# Откройте конфигурацию nginx
nano /etc/nginx/sites-enabled/myunion.pro
```

Добавьте или обновите следующие настройки в блоке `server` для порта 443:

```nginx
server {
    listen 443 ssl http2;
    server_name myunion.pro;

    # SSL сертификаты
    ssl_certificate /path/to/fullchain.pem;
    ssl_certificate_key /path/to/privkey.pem;
    
    # SSL настройки
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers "ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384";
    ssl_prefer_server_ciphers off;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 10m;

    # Заголовки безопасности
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains; preload" always;
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    # ... остальная конфигурация ...
}

# Редирект HTTP -> HTTPS
server {
    listen 80;
    server_name myunion.pro;
    return 301 https://$server_name$request_uri;
}
```

### 2. Проверка цепочки сертификатов

Убедитесь, что используется полная цепочка сертификатов:

```bash
# Проверьте сертификат
openssl s_client -connect myunion.pro:443 -servername myunion.pro < /dev/null

# Проверьте цепочку на SSL Labs
# https://www.ssllabs.com/ssltest/analyze.html?d=myunion.pro
```

### 3. Проверка переменных окружения

Убедитесь, что в `.env` на сервере установлено:

```env
NEXTAUTH_URL="https://myunion.pro"
NEXT_PUBLIC_APP_URL="https://myunion.pro"
```

**ВАЖНО:** Используйте `https://`, а не `http://`!

### 4. Перезагрузка nginx

После изменения конфигурации:

```bash
# Проверка синтаксиса
nginx -t

# Перезагрузка
systemctl reload nginx
```

### 5. Автоматическое исправление (скрипт)

Или используйте готовый скрипт:

```bash
# Загрузите скрипт на сервер
scp scripts/fix-ssl-security.sh root@194.87.49.210:/root/

# Выполните на сервере
ssh root@194.87.49.210
chmod +x /root/fix-ssl-security.sh
/root/fix-ssl-security.sh
```

## Что было исправлено в коде

1. ✅ Добавлены мета-теги безопасности в `app/layout.tsx`
2. ✅ Исправлены ссылки в письмах - теперь всегда используют HTTPS
3. ✅ Добавлена проверка, что `NEXTAUTH_URL` использует HTTPS

## Проверка после исправления

1. Проверьте сайт на SSL Labs: https://www.ssllabs.com/ssltest/analyze.html?d=myunion.pro
2. Убедитесь, что рейтинг A или A+
3. Проверьте, что все ссылки в письмах ведут на HTTPS
4. Проверьте, что нет смешанного контента (HTTP ресурсы на HTTPS странице)

## Дополнительные рекомендации

1. **HSTS Preload**: После настройки HSTS, добавьте домен в список preload: https://hstspreload.org/
2. **CSP (Content Security Policy)**: Рассмотрите добавление CSP заголовков для дополнительной защиты
3. **Мониторинг**: Настройте мониторинг SSL сертификатов (например, через UptimeRobot)

## Если проблема сохраняется

1. Проверьте логи nginx: `tail -f /var/log/nginx/error.log`
2. Проверьте, что сертификат не истек: `openssl x509 -in /path/to/cert.pem -noout -dates`
3. Убедитесь, что все поддомены используют HTTPS
4. Проверьте, нет ли редиректов через HTTP

