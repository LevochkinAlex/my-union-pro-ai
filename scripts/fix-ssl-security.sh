#!/bin/bash
# Скрипт для исправления проблем с SSL и безопасностью сайта

echo "🔒 Проверка и исправление SSL конфигурации..."

# Путь к конфигурации nginx
NGINX_CONFIG="/etc/nginx/sites-enabled/myunion.pro"

# Проверяем существование конфигурации
if [ ! -f "$NGINX_CONFIG" ]; then
    echo "❌ Конфигурация nginx не найдена: $NGINX_CONFIG"
    exit 1
fi

# Создаем резервную копию
cp "$NGINX_CONFIG" "${NGINX_CONFIG}.backup.$(date +%Y%m%d_%H%M%S)"
echo "✅ Создана резервная копия конфигурации"

# Проверяем и добавляем необходимые заголовки безопасности
if ! grep -q "add_header Strict-Transport-Security" "$NGINX_CONFIG"; then
    echo "➕ Добавляем HSTS заголовок..."
    sed -i '/server_name myunion.pro;/a\
    # Security headers\
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains; preload" always;\
    add_header X-Frame-Options "SAMEORIGIN" always;\
    add_header X-Content-Type-Options "nosniff" always;\
    add_header X-XSS-Protection "1; mode=block" always;\
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
' "$NGINX_CONFIG"
fi

# Проверяем редирект HTTP -> HTTPS
if ! grep -q "return 301 https://" "$NGINX_CONFIG"; then
    echo "➕ Добавляем редирект HTTP -> HTTPS..."
    # Ищем блок server для порта 80
    if grep -q "listen 80" "$NGINX_CONFIG"; then
        sed -i '/listen 80;/a\
    return 301 https://$server_name$request_uri;
' "$NGINX_CONFIG"
    fi
fi

# Проверяем настройки SSL
if ! grep -q "ssl_protocols" "$NGINX_CONFIG"; then
    echo "➕ Добавляем настройки SSL..."
    sed -i '/ssl_certificate/a\
    ssl_protocols TLSv1.2 TLSv1.3;\
    ssl_ciphers "ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384";\
    ssl_prefer_server_ciphers off;\
    ssl_session_cache shared:SSL:10m;\
    ssl_session_timeout 10m;
' "$NGINX_CONFIG"
fi

# Проверяем цепочку сертификатов
if grep -q "ssl_certificate " "$NGINX_CONFIG" && ! grep -q "ssl_trusted_certificate" "$NGINX_CONFIG"; then
    echo "⚠️  Проверьте цепочку сертификатов. Возможно, нужно добавить ssl_trusted_certificate"
fi

# Проверяем синтаксис
echo "🔍 Проверка синтаксиса nginx..."
if nginx -t; then
    echo "✅ Синтаксис nginx корректен"
    echo "🔄 Перезагрузка nginx..."
    systemctl reload nginx
    echo "✅ Nginx перезагружен"
else
    echo "❌ Ошибка в конфигурации nginx!"
    echo "Восстанавливаем резервную копию..."
    cp "${NGINX_CONFIG}.backup.$(date +%Y%m%d_%H%M%S)" "$NGINX_CONFIG"
    exit 1
fi

echo ""
echo "✅ Конфигурация SSL обновлена!"
echo ""
echo "📋 Проверьте следующее:"
echo "1. Убедитесь, что SSL сертификат действителен: openssl s_client -connect myunion.pro:443 -servername myunion.pro"
echo "2. Проверьте цепочку сертификатов на https://www.ssllabs.com/ssltest/analyze.html?d=myunion.pro"
echo "3. Убедитесь, что все ссылки в письмах ведут на HTTPS"
echo "4. Проверьте, что нет смешанного контента (HTTP ресурсы на HTTPS странице)"

