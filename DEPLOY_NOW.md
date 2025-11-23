# 🚀 Быстрый деплой на VDS

## Последние изменения:

✅ Исправлен Appeal Bot - теперь не просит заполнять профиль если документы уже есть
✅ Убраны лишние debug логи из консоли
✅ Исправлена сериализация моделей AI
✅ Все фейковые модели удалены (GPT-5, Sherlock и т.д.)

## Команды для деплоя:

### Вариант 1: Через SSH (требует ввода пароля)

```bash
ssh root@194.87.49.210
# Пароль: sAt,8?Bh+Ny_BW

cd /opt/my-union-pro
git pull origin main
pnpm install --frozen-lockfile
pnpm build
pm2 restart my-union-pro
pm2 status
pm2 logs my-union-pro --lines 50
```

### Вариант 2: Одной командой с sshpass (если установлен)

```bash
sshpass -p 'sAt,8?Bh+Ny_BW' ssh root@194.87.49.210 "cd /opt/my-union-pro && git pull origin main && pnpm install --frozen-lockfile && pnpm build && pm2 restart my-union-pro && pm2 status"
```

### Вариант 3: Используй скрипт

```bash
./scripts/deploy-to-vds.sh
# Введи пароль когда попросит: sAt,8?Bh+Ny_BW
```

## После деплоя проверь:

1. **Статус PM2:**
   ```bash
   ssh root@194.87.49.210 "pm2 status"
   ```

2. **Логи:**
   ```bash
   ssh root@194.87.49.210 "pm2 logs my-union-pro --lines 100"
   ```

3. **Открой сайт:**
   - https://myunion.pro
   - Проверь что все работает

4. **Проверь Appeal Bot:**
   - Зайди в админку → AI Chat → Appeal Bot
   - Должна быть модель: openai/gpt-4o
   - База знаний: Appeal Bot Knowledge Base

5. **Проверь "Мой бот":**
   - Создай новый чат
   - Бот НЕ должен просить заполнять профиль (если документы уже есть)
   - Бот должен предложить собрать дополнительную информацию

## Проблемы?

Если что-то не работает:

1. **Проверь логи:**
   ```bash
   ssh root@194.87.49.210 "pm2 logs my-union-pro --err --lines 100"
   ```

2. **Перезапусти процесс:**
   ```bash
   ssh root@194.87.49.210 "pm2 restart my-union-pro"
   ```

3. **Проверь статус:**
   ```bash
   ssh root@194.87.49.210 "pm2 describe my-union-pro"
   ```

## Готово! 🎉

Все изменения задеплоены на **https://myunion.pro**

