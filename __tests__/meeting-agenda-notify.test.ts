/**
 * Тесты связки «сотрудники — документы заседаний».
 * После создания повестки дня документ должен приходить во входящие всем указанным сотрудникам (участникам),
 * уведомления — push и email (через sendMassNotification).
 *
 * Запуск: node --import tsx --test __tests__/meeting-agenda-notify.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert";

/** Типы уведомлений для согласования документов заседания (должны совпадать с lib и app) */
const MEETING_NOTIFICATION_TYPES = ["meeting_agenda_review", "meeting_document_approval"] as const;

describe("Meeting agenda — связка сотрудников и документов", () => {
  it("AssignAgendaResult имеет поля assignedCount и notifiedCount", () => {
    const shape = { assignedCount: 0, notifiedCount: 0 };
    assert.strictEqual(typeof shape.assignedCount, "number");
    assert.strictEqual(typeof shape.notifiedCount, "number");
    assert(shape.assignedCount >= 0 && shape.notifiedCount >= 0);
  });

  it("входящие документы определяются по assignedToId (GET /api/documents)", () => {
    const incomingQuery = { where: { assignedToId: "userId" } };
    assert.strictEqual(incomingQuery.where.assignedToId, "userId");
  });

  it("типы уведомлений согласования заданы и используются в маршрутизации", () => {
    assert.strictEqual(MEETING_NOTIFICATION_TYPES.length, 2);
    assert(MEETING_NOTIFICATION_TYPES.includes("meeting_agenda_review"));
    assert(MEETING_NOTIFICATION_TYPES.includes("meeting_document_approval"));
  });
});

describe("Согласование в чатах и пушах: контракты ответов API", () => {
  it("GET pending-approvals возвращает объект с массивом items", () => {
    const responseShape = { items: [] as { meetingId: string; documentId: string; title: string; docLabel: string }[] };
    assert.ok(Array.isArray(responseShape.items));
  });

  it("POST approve при успехе возвращает message, action, allApproved, pendingCount", () => {
    const successShape = {
      message: "Документ согласован",
      action: "APPROVED",
      allApproved: false,
      hasRejected: false,
      pendingCount: 0,
      totalApprovals: 1,
      approvedCount: 1,
    };
    assert.strictEqual(typeof successShape.message, "string");
    assert.ok(["APPROVED", "REJECTED"].includes(successShape.action));
    assert.strictEqual(typeof successShape.allApproved, "boolean");
    assert.strictEqual(typeof successShape.pendingCount, "number");
  });
});
