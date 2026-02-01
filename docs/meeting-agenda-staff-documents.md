# Связка сотрудников и документов заседаний

## Повестка дня после создания

1. **Создание повестки** (POST `/api/ppo-head/meetings/[id]/generate-document`, `documentType: "AGENDA"`):
   - Генерируется PDF и создаётся документ в БД.
   - Документ привязывается к заседанию (`meeting.agendaDocumentId`).
   - Вызывается **assignAgendaToParticipantsAndNotify** (lib/meeting-agenda-notify.ts).

2. **assignAgendaToParticipantsAndNotify(meetingId, createdByUserId)**:
   - Берёт заседание с участниками (с `userId`) и документом повестки.
   - Для каждого участника, у которого ещё нет назначенной повестки (оригинал или копия с `metadata.originalDocumentId`), создаётся **копия документа** с `assignedToId = userId`.
   - Копии попадают во **входящие** участников (GET `/api/documents` возвращает документы с `assignedToId = session.user.id`).
   - Отправляются **push и email** всем участникам через **sendMassNotification** (тема: «Повестка дня: Заседание №X», ссылка на `/dashboard/documents`).

3. **Ручная рассылка** (POST `/api/ppo-head/meetings/[id]/notify-participants`, `type: "agenda_review"`):
   - Использует ту же функцию **assignAgendaToParticipantsAndNotify** (создание копий + уведомления), без повторной отправки sendMassNotification.

## Итог

- **Сотрудники = участники заседания** (из раздела «Управление сотрудниками» / выборный орган).
- После создания повестки документ приходит **во входящие всем указанным сотрудникам** (копия на каждого с `assignedToId`).
- Уведомления: **push** и **email** (с учётом настроек пользователя в sendMassNotification).
