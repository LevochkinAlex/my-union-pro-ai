#!/bin/bash
# Установка Chrome/Chromium на VDS для генерации PDF (Puppeteer).
# Запускать на сервере: bash scripts/server-install-chrome.sh
# Либо через SSH: ssh root@194.87.49.210 'cd /opt/my-union-pro && bash scripts/server-install-chrome.sh'

set -e

echo "=== Установка Chrome для Puppeteer (генерация PDF) ==="

# Определяем установленный браузер и путь
CHROME_PATH=""
if command -v google-chrome-stable &>/dev/null; then
  CHROME_PATH=$(command -v google-chrome-stable)
  echo "Найден Google Chrome: $CHROME_PATH"
elif command -v google-chrome &>/dev/null; then
  CHROME_PATH=$(command -v google-chrome)
  echo "Найден Google Chrome: $CHROME_PATH"
elif command -v chromium &>/dev/null; then
  CHROME_PATH=$(command -v chromium)
  echo "Найден Chromium: $CHROME_PATH"
elif command -v chromium-browser &>/dev/null; then
  CHROME_PATH=$(command -v chromium-browser)
  echo "Найден Chromium: $CHROME_PATH"
fi

if [ -z "$CHROME_PATH" ]; then
  echo "Браузер не найден. Устанавливаем Google Chrome (stable) через .deb..."
  export DEBIAN_FRONTEND=noninteractive
  # Установка без полного apt update (на случай сломанных репозиториев)
  apt-get install -y -qq wget 2>/dev/null || true
  wget -q -O /tmp/google-chrome.deb "https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb"
  dpkg -i /tmp/google-chrome.deb 2>/dev/null || apt-get install -y -f -qq && dpkg -i /tmp/google-chrome.deb
  rm -f /tmp/google-chrome.deb
  CHROME_PATH=$(command -v google-chrome-stable 2>/dev/null || command -v google-chrome 2>/dev/null)
  if [ -z "$CHROME_PATH" ]; then
    echo "Пробуем Chromium (apt без обновления списка)..."
    apt-get install -y -qq chromium-browser 2>/dev/null || apt-get install -y -qq chromium 2>/dev/null || true
    CHROME_PATH=$(command -v chromium-browser 2>/dev/null || command -v chromium 2>/dev/null)
  fi
  if [ -z "$CHROME_PATH" ]; then
    echo "Ошибка: Chrome/Chromium не установился."
    exit 1
  fi
  echo "Установлен: $CHROME_PATH"
fi

# Опционально: добавить PUPPETEER_EXECUTABLE_PATH в .env.local
APP_DIR="${APP_DIR:-/opt/my-union-pro}"
ENV_FILE="$APP_DIR/.env.local"
if [ -f "$ENV_FILE" ]; then
  if grep -q "PUPPETEER_EXECUTABLE_PATH" "$ENV_FILE"; then
    echo "PUPPETEER_EXECUTABLE_PATH уже задан в $ENV_FILE"
  else
    echo "" >> "$ENV_FILE"
    echo "# Puppeteer PDF (добавлено server-install-chrome.sh)" >> "$ENV_FILE"
    echo "PUPPETEER_EXECUTABLE_PATH=$CHROME_PATH" >> "$ENV_FILE"
    echo "Добавлен PUPPETEER_EXECUTABLE_PATH=$CHROME_PATH в $ENV_FILE"
  fi
else
  echo "Файл $ENV_FILE не найден. Задайте переменную вручную:"
  echo "  export PUPPETEER_EXECUTABLE_PATH=$CHROME_PATH"
  echo "или добавьте в .env.local:"
  echo "  PUPPETEER_EXECUTABLE_PATH=$CHROME_PATH"
fi

echo "=== Готово. Перезапустите приложение (pm2 restart my-union-pro) ==="
