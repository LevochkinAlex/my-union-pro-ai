#!/bin/bash
# Скрипт для установки INTERNAL_API_TOKEN на сервере

TOKEN=$(openssl rand -hex 32)
echo "Generated INTERNAL_API_TOKEN: $TOKEN"
echo ""
echo "Add this to .env.local on server:"
echo "INTERNAL_API_TOKEN=$TOKEN"
