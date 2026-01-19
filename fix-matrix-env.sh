#!/bin/bash

echo "=== Проверка и исправление переменных окружения Matrix ==="

sshpass -p 'wu,iMrZj6goZh?' ssh -o StrictHostKeyChecking=no root@194.87.49.210 << 'ENDSSH'
cd /opt/my-union-pro

echo ""
echo "=== Текущее состояние ==="

# Проверяем .env.local
if [ -f .env.local ]; then
  echo "Файл .env.local существует"
  
  HAS_MATRIX_SERVER_URL=$(grep -c "^MATRIX_SERVER_URL" .env.local || echo "0")
  HAS_MATRIX_ADMIN_TOKEN=$(grep -c "^MATRIX_ADMIN_TOKEN" .env.local || echo "0")
  
  echo "MATRIX_SERVER_URL: $([ "$HAS_MATRIX_SERVER_URL" -gt 0 ] && echo 'найден' || echo 'НЕ найден')"
  echo "MATRIX_ADMIN_TOKEN: $([ "$HAS_MATRIX_ADMIN_TOKEN" -gt 0 ] && echo 'найден' || echo 'НЕ найден')"
  
  # Показываем MATRIX_SERVER_URL (безопасно)
  if [ "$HAS_MATRIX_SERVER_URL" -gt 0 ]; then
    echo "Значение MATRIX_SERVER_URL:"
    grep "^MATRIX_SERVER_URL" .env.local | head -1
  fi
  
  # Показываем наличие токена (без значения)
  if [ "$HAS_MATRIX_ADMIN_TOKEN" -gt 0 ]; then
    TOKEN_LENGTH=$(grep "^MATRIX_ADMIN_TOKEN" .env.local | head -1 | cut -d'=' -f2 | wc -c)
    echo "MATRIX_ADMIN_TOKEN установлен (длина: $TOKEN_LENGTH символов)"
  fi
else
  echo "Файл .env.local НЕ существует - нужно создать"
fi

echo ""
echo "=== Инструкции ==="
echo "Если переменные отсутствуют, добавьте их в .env.local:"
echo "MATRIX_SERVER_URL=https://matrix.myunion.pro"
echo "MATRIX_ADMIN_TOKEN=ваш_токен_администратора_matrix"
echo ""
echo "После добавления выполните:"
echo "pm2 restart my-union-pro"

ENDSSH
