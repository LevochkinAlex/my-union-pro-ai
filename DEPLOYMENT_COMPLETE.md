# ✅ Развёртывание завершено успешно

**Дата:** 7 декабря 2025  
**Сервер:** VDS Ubuntu 24.04 (Timeweb Cloud)  
**Домен:** https://myunion.pro  
**IP:** 194.87.49.210

---

## Что было сделано

### 1. Обнаружение взлома
- ❌ Обнаружен криптомайнер "Titan"
- ❌ Заражены системные утилиты: `/usr/bin/cat`, `/usr/bin/grep`, `/usr/bin/ls`, `/usr/bin/head`, `/usr/bin/tail`
- ✅ Создан бэкап данных (база: 20 МБ, uploads: 37 МБ)

### 2. Переустановка системы
- ✅ Переустановлена Ubuntu 24.04 LTS
- ✅ Настроен SSH доступ по ключам (пароль отключён)
- ✅ Установлено ПО:
  - Node.js 20.19.6
  - pnpm 10.24.0
  - PM2 6.0.14
  - PostgreSQL 16.11
  - nginx 1.24.0
  - certbot (Let's Encrypt)

### 3. Восстановление данных
- ✅ База данных восстановлена (7 пользователей, 13 постов)
- ✅ Файлы и картинки восстановлены (36 МБ)
- ✅ Конфигурация .env.local восстановлена

### 4. Настройка приложения
- ✅ Репозиторий клонирован с GitHub
- ✅ Зависимости установлены
- ✅ Приложение собрано
- ✅ PM2 настроен на автозапуск при перезагрузке

### 5. Безопасность
- ✅ SSL сертификат получен (Let's Encrypt)
- ✅ SSH доступ только по ключам
- ✅ Security headers в nginx
- ✅ Пароль root изменён

---

## Текущее состояние

### Подключение к серверу:
```bash
ssh -i ~/.ssh/myunion_vds root@194.87.49.210
# или используй alias:
ssh-myunion
```

### Управление приложением:
```bash
pm2 status              # Статус
pm2 logs my-union-pro   # Логи
pm2 restart my-union-pro # Перезапуск
```

### Обновление после изменений:
```bash
# Локально
git add -A && git commit -m "Описание" && git push

# На сервере
ssh-myunion
cd /opt/my-union-pro
git pull
pnpm install
pnpm build
pm2 restart my-union-pro
```

---

## Защита от повторных взломов

### ✅ Реализовано:
1. **SSH только по ключам** — brute-force невозможен
2. **Сильный пароль PostgreSQL** — `MyUnion2024SecurePass!`
3. **SSL сертификат** — защита трафика
4. **Security headers** — защита от XSS, clickjacking

### ⚠️ Рекомендации:
1. **Регулярные обновления системы:**
   ```bash
   apt-get update && apt-get upgrade -y
   ```

2. **Мониторинг подозрительной активности:**
   ```bash
   # Последние входы
   last | head -20
   
   # Подозрительные процессы
   ps aux | sort -k3 -r | head -10
   
   # Проверка системных файлов
   find /usr/bin -type f -size +5M -ls
   ```

3. **Автоматические бэкапы** (настроить в Timeweb панели)

---

## Файлы конфигурации

### .env.local (на сервере)
```env
DATABASE_URL="postgresql://myunion_user:MyUnion2024SecurePass!@localhost:5432/myunion_db"
NEXTAUTH_URL="https://myunion.pro"
VDS_IS_LOCAL=true  # Прямая запись файлов без SSH
```

### SSH ключи
- Локальный: `~/.ssh/myunion_vds` (для подключения к VDS)
- Серверный: `/root/.ssh/github_deploy` (для GitHub)

---

## Полезные ссылки

- **Сайт:** https://myunion.pro
- **GitHub:** https://github.com/usmanoffcom/my-union-pro-ai
- **Документация:** [DEPLOYMENT.md](./DEPLOYMENT.md)

---

## Контакты техподдержки

**Email:** ceo@yappix.ru  
**Timeweb:** https://timeweb.cloud/my/servers

---

_Развёртывание выполнено 7 декабря 2025 года_

