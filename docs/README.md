# MyUnion Pro — Документация

> Версия: 1.7.1 | Обновлено: 21.12.2024

## Основная документация

| Файл | Описание |
|------|----------|
| [DOCUMENTATION_STATUS.md](./DOCUMENTATION_STATUS.md) | ⭐ **Финальный статус документации** |
| [SYSTEM_OVERVIEW.md](./SYSTEM_OVERVIEW.md) | Общий обзор системы |
| [meeting-document-workflow.md](./meeting-document-workflow.md) | ⭐ **Документооборот заседаний** |
| [chat-performance-optimization.md](./chat-performance-optimization.md) | ⭐ **Оптимизация производительности чата** |
| [BESTBENEFITS_SYSTEM.md](./BESTBENEFITS_SYSTEM.md) | **Система скидок BestBenefits** |
| [APPEALS_SYSTEM.md](./APPEALS_SYSTEM.md) | ⭐ **Модуль обращений (Tickets/Appeals)** |
| [TICKET_DEADLINE_SYSTEM.md](./TICKET_DEADLINE_SYSTEM.md) | ⭐ **Система отслеживания сроков ответа на обращения** |
| [AI_BOT_ARCHITECTURE.md](./AI_BOT_ARCHITECTURE.md) | Архитектура AI-бота |
| [DOCUMENT_TEMPLATES_GUIDE.md](./DOCUMENT_TEMPLATES_GUIDE.md) | Шаблоны документов |
| [LOGGING_GUIDE.md](./LOGGING_GUIDE.md) | Логирование |
| [CHANGELOG.md](./CHANGELOG.md) | История изменений |

## Быстрые команды

### Деплой [[memory:12394644]]
```bash
ssh -i ~/.ssh/myunion_vds root@194.87.49.210 'cd /opt/my-union-pro && git pull && pnpm build && pm2 restart my-union-pro'
```

### Синхронизация скидок
```bash
ssh -i ~/.ssh/myunion_vds root@194.87.49.210 'cd /opt/my-union-pro && node scripts/sync-discounts.mjs'
```

### Проверка логов
```bash
ssh -i ~/.ssh/myunion_vds root@194.87.49.210 'pm2 logs my-union-pro --lines 50'
```

### Логи синхронизации скидок
```bash
ssh -i ~/.ssh/myunion_vds root@194.87.49.210 'tail -50 /var/log/myunion/sync-discounts.log'
```

## Инфраструктура

| Компонент | URL/Адрес |
|-----------|-----------|
| Продакшн | https://myunion.pro |
| CDN | https://cdn.myunion.pro |
| VDS IP | 194.87.49.210 |
| Проект на сервере | /opt/my-union-pro |
| Grafana | https://myunion.pro/grafana/ |
| Sentry | yappix-llc-vk.sentry.io |

## База данных

- **PostgreSQL** на VDS
- **Prisma ORM**
- Миграции: `prisma db push` (на VDS)

## Устаревшие файлы

Файлы `.md` в корне проекта — устаревшая документация, оставлена для истории.
Актуальная документация находится в папке `docs/`.

