/**
 * Security regression-pack for role-based access (403/200 guards).
 *
 * Uses real API endpoints with test cookies from env:
 * - SEC_TEST_COOKIE_REPORTS_VIEW
 * - SEC_TEST_COOKIE_REPORTS_CREATE
 * - SEC_TEST_COOKIE_APPEALS_VIEW
 * - SEC_TEST_COOKIE_APPEALS_RESPOND
 * - SEC_TEST_COOKIE_CHATS_VIEW
 * - SEC_TEST_COOKIE_CHATS_CREATE
 * - SEC_TEST_COOKIE_DOCS_REVIEW
 * - SEC_TEST_COOKIE_DOCS_APPROVE
 *
 * If a cookie is missing, related checks are skipped (return early),
 * so the suite is safe for CI/local without secrets.
 */

import { describe, it } from "node:test";
import assert from "node:assert";

const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3004";

function withCookie(cookie?: string) {
  if (!cookie) return null;
  return {
    headers: {
      Cookie: cookie,
      "Content-Type": "application/json",
    },
  };
}

describe("Security regression: reports", () => {
  it("reports list: reports_view gets non-403, no-create role gets 403 on create", async () => {
    const viewer = withCookie(process.env.SEC_TEST_COOKIE_REPORTS_VIEW);
    const creator = withCookie(process.env.SEC_TEST_COOKIE_REPORTS_CREATE);
    if (!viewer || !creator) return;

    const listRes = await fetch(`${baseUrl}/api/ppo-head/reports`, {
      method: "GET",
      ...viewer,
    });
    assert.notStrictEqual(listRes.status, 403);

    const createDeniedRes = await fetch(`${baseUrl}/api/ppo-head/reports`, {
      method: "POST",
      ...viewer,
      body: JSON.stringify({
        templateId: "fake-template-id",
        periodYear: 2026,
      }),
    });
    assert.strictEqual(createDeniedRes.status, 403);

    const createAllowedRes = await fetch(`${baseUrl}/api/ppo-head/reports`, {
      method: "POST",
      ...creator,
      body: JSON.stringify({
        templateId: "fake-template-id",
        periodYear: 2026,
      }),
    });
    // Permission check passed, business validation may still fail.
    assert.notStrictEqual(createAllowedRes.status, 403);
  });
});

describe("Security regression: appeals", () => {
  it("appeals status change: appeals_view denied, appeals_respond allowed", async () => {
    const viewer = withCookie(process.env.SEC_TEST_COOKIE_APPEALS_VIEW);
    const responder = withCookie(process.env.SEC_TEST_COOKIE_APPEALS_RESPOND);
    if (!viewer || !responder) return;

    const fakeTicketId = "000000000000000000000000";

    const deniedRes = await fetch(`${baseUrl}/api/ppo-head/appeals/${fakeTicketId}/status`, {
      method: "PATCH",
      ...viewer,
      body: JSON.stringify({
        status: "IN_PROGRESS",
        message: "Берем в работу",
      }),
    });
    assert.strictEqual(deniedRes.status, 403);

    const allowedRes = await fetch(`${baseUrl}/api/ppo-head/appeals/${fakeTicketId}/status`, {
      method: "PATCH",
      ...responder,
      body: JSON.stringify({
        status: "IN_PROGRESS",
        message: "Берем в работу",
      }),
    });
    assert.notStrictEqual(allowedRes.status, 403);
  });
});

describe("Security regression: chats", () => {
  it("chat icon upload: chats_view denied, chats_create allowed", async () => {
    const viewer = withCookie(process.env.SEC_TEST_COOKIE_CHATS_VIEW);
    const creator = withCookie(process.env.SEC_TEST_COOKIE_CHATS_CREATE);
    if (!viewer || !creator) return;

    const formData = new FormData();
    formData.append("file", new Blob(["fake"], { type: "image/png" }), "x.png");

    const deniedRes = await fetch(`${baseUrl}/api/ppo-head/chats/upload-icon`, {
      method: "POST",
      headers: { Cookie: viewer.headers.Cookie },
      body: formData,
    });
    assert.strictEqual(deniedRes.status, 403);

    const allowedFormData = new FormData();
    allowedFormData.append("file", new Blob(["fake"], { type: "image/png" }), "x.png");
    const allowedRes = await fetch(`${baseUrl}/api/ppo-head/chats/upload-icon`, {
      method: "POST",
      headers: { Cookie: creator.headers.Cookie },
      body: allowedFormData,
    });
    assert.notStrictEqual(allowedRes.status, 403);
  });
});

describe("Security regression: meetings documents", () => {
  it("send-for-approval: reviewer denied, approver allowed", async () => {
    const reviewer = withCookie(process.env.SEC_TEST_COOKIE_DOCS_REVIEW);
    const approver = withCookie(process.env.SEC_TEST_COOKIE_DOCS_APPROVE);
    if (!reviewer || !approver) return;

    const fakeMeetingId = "test-meeting-id";
    const fakeDocumentId = "test-document-id";
    const url = `${baseUrl}/api/ppo-head/meetings/${fakeMeetingId}/documents/${fakeDocumentId}/send-for-approval`;

    const deniedRes = await fetch(url, {
      method: "POST",
      ...reviewer,
      body: JSON.stringify({}),
    });
    assert.strictEqual(deniedRes.status, 403);

    const allowedRes = await fetch(url, {
      method: "POST",
      ...approver,
      body: JSON.stringify({}),
    });
    assert.notStrictEqual(allowedRes.status, 403);
  });
});
