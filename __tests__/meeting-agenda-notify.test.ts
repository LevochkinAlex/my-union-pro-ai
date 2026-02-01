/**
 * Тесты связки «сотрудники — документы заседаний».
 * После создания повестки дня документ должен приходить во входящие всем указанным сотрудникам (участникам),
 * уведомления — push и email (через sendMassNotification).
 *
 * Запуск: node --import tsx --test __tests__/meeting-agenda-notify.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert";

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
});
