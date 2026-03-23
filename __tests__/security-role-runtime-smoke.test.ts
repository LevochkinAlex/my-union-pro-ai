/**
 * Runtime security smoke for role-based access (nightly/prod).
 *
 * Goal: catch permission regressions on key guarded endpoints.
 *
 * Required envs in strict mode (SEC_SMOKE_STRICT=1):
 * - SEC_SMOKE_BASE_URL
 * - SEC_SMOKE_COOKIE_REPORTS_ALLOW
 * - SEC_SMOKE_COOKIE_REPORTS_DENY
 * - SEC_SMOKE_COOKIE_APPEALS_ALLOW
 * - SEC_SMOKE_COOKIE_APPEALS_DENY
 * - SEC_SMOKE_COOKIE_CHATS_ALLOW
 * - SEC_SMOKE_COOKIE_CHATS_DENY
 * - SEC_SMOKE_COOKIE_MEETINGS_ALLOW_CREATE
 * - SEC_SMOKE_COOKIE_MEETINGS_DENY_CREATE
 *
 * In non-strict mode missing envs will skip corresponding checks.
 *
 * SEC_SMOKE_SKIP_MEETINGS_POST=1 — skip POST /meetings (creates real rows on prod;
 *   use in GitHub Actions to avoid flaky writes).
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

const baseUrl = process.env.SEC_SMOKE_BASE_URL || "https://myunion.pro";
const strictMode = process.env.SEC_SMOKE_STRICT === "1";

function getEnv(name: string): string | null {
  const value = process.env[name]?.trim();
  if (value) return value;
  if (strictMode) {
    throw new Error(`Missing required env in strict mode: ${name}`);
  }
  return null;
}

function jsonHeaders(cookie: string) {
  return {
    Cookie: cookie,
    "Content-Type": "application/json",
  };
}

function assertApiStatus(
  actual: number,
  expected: number,
  label: string,
): void {
  if (actual === expected) return;
  const hint =
    actual === 401 || actual === 403
      ? " (401/403 often = expired smoke cookies — refresh repo secrets)"
      : "";
  assert.fail(`${label}: expected ${expected}, got ${actual}${hint}`);
}

describe("Runtime security smoke: role guards", () => {
  it("reports access matrix: allow -> 200, deny -> 403", async () => {
    const allow = getEnv("SEC_SMOKE_COOKIE_REPORTS_ALLOW");
    const deny = getEnv("SEC_SMOKE_COOKIE_REPORTS_DENY");
    if (!allow || !deny) return;

    const okRes = await fetch(`${baseUrl}/api/ppo-head/reports`, {
      method: "GET",
      headers: jsonHeaders(allow),
    });
    assertApiStatus(okRes.status, 200, "reports allow-cookie");

    const denyRes = await fetch(`${baseUrl}/api/ppo-head/reports`, {
      method: "GET",
      headers: jsonHeaders(deny),
    });
    assertApiStatus(denyRes.status, 403, "reports deny-cookie");
  });

  it("appeals access matrix: allow -> 200, deny -> 403", async () => {
    const allow = getEnv("SEC_SMOKE_COOKIE_APPEALS_ALLOW");
    const deny = getEnv("SEC_SMOKE_COOKIE_APPEALS_DENY");
    if (!allow || !deny) return;

    const okRes = await fetch(`${baseUrl}/api/ppo-head/appeals`, {
      method: "GET",
      headers: jsonHeaders(allow),
    });
    assertApiStatus(okRes.status, 200, "appeals allow-cookie");

    const denyRes = await fetch(`${baseUrl}/api/ppo-head/appeals`, {
      method: "GET",
      headers: jsonHeaders(deny),
    });
    assertApiStatus(denyRes.status, 403, "appeals deny-cookie");
  });

  it("chats access matrix: allow -> 200, deny -> 403", async () => {
    const allow = getEnv("SEC_SMOKE_COOKIE_CHATS_ALLOW");
    const deny = getEnv("SEC_SMOKE_COOKIE_CHATS_DENY");
    if (!allow || !deny) return;

    const okRes = await fetch(`${baseUrl}/api/ppo-head/chats`, {
      method: "GET",
      headers: jsonHeaders(allow),
    });
    assertApiStatus(okRes.status, 200, "chats allow-cookie");

    const denyRes = await fetch(`${baseUrl}/api/ppo-head/chats`, {
      method: "GET",
      headers: jsonHeaders(deny),
    });
    assertApiStatus(denyRes.status, 403, "chats deny-cookie");
  });

  it("meetings create guard: allow -> 201, deny -> 403", async () => {
    if (process.env.SEC_SMOKE_SKIP_MEETINGS_POST === "1") return;

    const allow = getEnv("SEC_SMOKE_COOKIE_MEETINGS_ALLOW_CREATE");
    const deny = getEnv("SEC_SMOKE_COOKIE_MEETINGS_DENY_CREATE");
    if (!allow || !deny) return;

    const payload = {
      type: "COMMITTEE",
      format: "ONLINE",
      title: `SEC_SMOKE_${Date.now()}`,
      scheduledDate: new Date(Date.now() + 86400000).toISOString(),
      scheduledTime: "10:00",
      participantIds: [],
      externalParticipants: [],
      agendaItems: [],
    };

    const okRes = await fetch(`${baseUrl}/api/ppo-head/meetings`, {
      method: "POST",
      headers: jsonHeaders(allow),
      body: JSON.stringify(payload),
    });
    assertApiStatus(okRes.status, 201, "meetings allow-cookie POST");

    const denyRes = await fetch(`${baseUrl}/api/ppo-head/meetings`, {
      method: "POST",
      headers: jsonHeaders(deny),
      body: JSON.stringify(payload),
    });
    assertApiStatus(denyRes.status, 403, "meetings deny-cookie POST");
  });
});
