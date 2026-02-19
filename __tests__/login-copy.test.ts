/**
 * Тесты текстов страницы входа (подсказки SMS/Telegram/MAX, email).
 * Запуск: pnpm test (или node --import tsx --test __tests__/login-copy.test.ts)
 */

import { describe, it } from "node:test";
import assert from "node:assert";
import { LOGIN_INPUT_HINT_SMS, LOGIN_INPUT_HINT_EMAIL } from "@/lib/login-copy";

describe("Login copy", () => {
  describe("LOGIN_INPUT_HINT_SMS", () => {
    it("содержит текст про SMS и про Telegram / MAX при привязке", () => {
      const expected =
        "Отправим код в SMS 📱 (или в Telegram / MAX, если привязаны)";
      assert.strictEqual(LOGIN_INPUT_HINT_SMS, expected);
    });

    it("упоминает SMS", () => {
      assert.ok(LOGIN_INPUT_HINT_SMS.includes("SMS"));
    });

    it("упоминает Telegram и MAX", () => {
      assert.ok(LOGIN_INPUT_HINT_SMS.includes("Telegram"));
      assert.ok(LOGIN_INPUT_HINT_SMS.includes("MAX"));
    });

    it("упоминает привязку", () => {
      assert.ok(LOGIN_INPUT_HINT_SMS.includes("привязаны"));
    });
  });

  describe("LOGIN_INPUT_HINT_EMAIL", () => {
    it("содержит текст про ссылку на email", () => {
      const expected = "Отправим ссылку для входа на email ✉️";
      assert.strictEqual(LOGIN_INPUT_HINT_EMAIL, expected);
    });
  });
});
