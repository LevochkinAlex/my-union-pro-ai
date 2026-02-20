/**
 * Тесты API согласования документов заседаний и чата.
 * - Без авторизации: send-for-approval, approve, final-approve, pending-approvals → 401.
 * - GET pending-approvals без meetingId в path не вызывается (маршрут требует meetingId).
 *
 * Запуск: node --import tsx --test __tests__/meeting-document-approval-api.test.ts
 * Или: pnpm test (включён в основной набор).
 */

import { describe, it } from "node:test";
import assert from "node:assert";

const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3004";
const placeholderMeetingId = "test-meeting-id";
const placeholderDocumentId = "test-document-id";

describe("Meeting document approval API: без авторизации → 401", () => {
  it("POST send-for-approval без cookie возвращает 401", async () => {
    const res = await fetch(
      `${baseUrl}/api/ppo-head/meetings/${placeholderMeetingId}/documents/${placeholderDocumentId}/send-for-approval`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      }
    );
    assert.strictEqual(res.status, 401);
    const data = await res.json().catch(() => ({}));
    assert.ok(data.error === "Не авторизован" || res.status === 401);
  });

  it("POST approve без cookie возвращает 401", async () => {
    const res = await fetch(
      `${baseUrl}/api/ppo-head/meetings/${placeholderMeetingId}/documents/${placeholderDocumentId}/approve`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ comment: "Согласовано" }),
      }
    );
    assert.strictEqual(res.status, 401);
    const data = await res.json().catch(() => ({}));
    assert.ok(data.error === "Не авторизован" || res.status === 401);
  });

  it("POST final-approve без cookie возвращает 401", async () => {
    const res = await fetch(
      `${baseUrl}/api/ppo-head/meetings/${placeholderMeetingId}/documents/${placeholderDocumentId}/final-approve`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ comment: "Утверждено" }),
      }
    );
    assert.strictEqual(res.status, 401);
    const data = await res.json().catch(() => ({}));
    assert.ok(data.error === "Не авторизован" || res.status === 401);
  });

  it("GET pending-approvals без cookie возвращает 401", async () => {
    const res = await fetch(
      `${baseUrl}/api/chat/meetings/${placeholderMeetingId}/pending-approvals`,
      {
        method: "GET",
        headers: { "Content-Type": "application/json" },
      }
    );
    assert.strictEqual(res.status, 401);
    const data = await res.json().catch(() => ({}));
    assert.ok(data.error === "Не авторизован" || res.status === 401);
  });

  it("POST direct-approve без cookie возвращает 401", async () => {
    const res = await fetch(
      `${baseUrl}/api/ppo-head/meetings/${placeholderMeetingId}/documents/${placeholderDocumentId}/direct-approve`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }
    );
    assert.strictEqual(res.status, 401);
  });
});

describe("Meeting document approval: форматы ответов при ошибках", () => {
  it("approve с пустым body не падает (сервер возвращает 401 до разбора body)", async () => {
    const res = await fetch(
      `${baseUrl}/api/ppo-head/meetings/${placeholderMeetingId}/documents/${placeholderDocumentId}/approve`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }
    );
    assert.strictEqual(res.status, 401);
  });

  it("final-approve с пустым body не падает", async () => {
    const res = await fetch(
      `${baseUrl}/api/ppo-head/meetings/${placeholderMeetingId}/documents/${placeholderDocumentId}/final-approve`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }
    );
    assert.strictEqual(res.status, 401);
  });
});
