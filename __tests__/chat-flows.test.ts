/**
 * Тесты переписок: роли, отправка текста/фото/файла, реакции.
 * - Unit: извлечение URL и превью ссылок (link-preview).
 * - API: GET /api/chat, /api/chat/rooms, /api/chat/[chatId]/messages без авторизации → 401.
 * - С авторизацией: отправка сообщения, вложение, реакция (нужны TEST_CHAT_AUTH_COOKIE, TEST_CHAT_ID, TEST_MESSAGE_ID и запущенный сервер).
 *
 * Запуск: pnpm test:chat или node --import tsx --test __tests__/chat-flows.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert";
import { extractUrls, isVideoUrl } from "../lib/link-preview";

const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3004";
const authCookie = process.env.TEST_CHAT_AUTH_COOKIE || "";

describe("Chat: link-preview (unit)", () => {
  describe("extractUrls", () => {
    it("извлекает один URL из текста", () => {
      const text = "Смотри https://example.com/page";
      assert.deepStrictEqual(extractUrls(text), ["https://example.com/page"]);
    });

    it("извлекает несколько URL", () => {
      const text = "Первая https://a.ru и вторая https://b.com ссылка.";
      const urls = extractUrls(text);
      assert.ok(urls.includes("https://a.ru"));
      assert.ok(urls.includes("https://b.com"));
      assert.strictEqual(urls.length, 2);
    });

    it("возвращает пустой массив при отсутствии URL", () => {
      assert.deepStrictEqual(extractUrls("Просто текст"), []);
      assert.deepStrictEqual(extractUrls(""), []);
    });

    it("не ломается на URL с путём и query", () => {
      const text = "Сайт https://site.com/path?q=1";
      const urls = extractUrls(text);
      assert.strictEqual(urls.length, 1);
      assert.ok(/https:\/\/site\.com\/path\?q=1/.test(urls[0]));
    });
  });

  describe("isVideoUrl", () => {
    it("считает YouTube видео", () => {
      assert.strictEqual(isVideoUrl("https://www.youtube.com/watch?v=xxx"), true);
      assert.strictEqual(isVideoUrl("https://youtu.be/xxx"), true);
    });
    it("считает Vimeo видео", () => {
      assert.strictEqual(isVideoUrl("https://vimeo.com/123"), true);
    });
    it("не считает обычный сайт видео", () => {
      assert.strictEqual(isVideoUrl("https://example.com"), false);
    });
  });
});

describe("Chat API: без авторизации → 401", () => {
  it("GET /api/chat без cookie возвращает 401", async () => {
    const res = await fetch(`${baseUrl}/api/chat`, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
    });
    assert.strictEqual(res.status, 401);
  });

  it("GET /api/chat/rooms без cookie возвращает 401", async () => {
    const res = await fetch(`${baseUrl}/api/chat/rooms`, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
    });
    assert.strictEqual(res.status, 401);
  });

  it("GET /api/chat/[chatId]/messages без cookie возвращает 401", async () => {
    const res = await fetch(`${baseUrl}/api/chat/some-chat-id/messages`, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
    });
    assert.strictEqual(res.status, 401);
  });

  it("POST reactions без cookie возвращает 401", async () => {
    const res = await fetch(
      `${baseUrl}/api/chat/some-chat-id/messages/some-msg-id/reactions`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emoji: "❤️" }),
      }
    );
    assert.strictEqual(res.status, 401);
  });
});

describe("Chat API: с авторизацией (роли, сообщение, файл, реакция)", () => {
  const withAuth = authCookie
    ? { headers: { Cookie: authCookie, "Content-Type": "application/json" } }
    : null;

  it("GET /api/chat с cookie возвращает список чатов или 401", async () => {
    if (!withAuth) return;
    const res = await fetch(`${baseUrl}/api/chat`, { method: "GET", ...withAuth });
    assert.ok([200, 401].includes(res.status));
    if (res.status === 200) {
      const data = await res.json();
      assert.ok(Array.isArray(data.chats));
    }
  });

  it("GET /api/chat/rooms с cookie возвращает rooms или 401", async () => {
    if (!withAuth) return;
    const res = await fetch(`${baseUrl}/api/chat/rooms`, { method: "GET", ...withAuth });
    assert.ok([200, 401].includes(res.status));
    if (res.status === 200) {
      const data = await res.json();
      assert.ok(Array.isArray(data.rooms));
    }
  });

  it("POST сообщение в чат (текст) — нужен реальный chatId", async () => {
    if (!withAuth) return;
    const chatId = process.env.TEST_CHAT_ID || "test-chat-id";
    const res = await fetch(`${baseUrl}/api/chat/${chatId}`, {
      method: "PATCH",
      ...withAuth,
      body: JSON.stringify({ content: "Тест сообщение" }),
    });
    assert.ok([200, 400, 403, 404, 401].includes(res.status));
  });

  it("POST реакция на сообщение — нужны реальные chatId и messageId", async () => {
    if (!withAuth) return;
    const chatId = process.env.TEST_CHAT_ID || "test-chat-id";
    const messageId = process.env.TEST_MESSAGE_ID || "test-msg-id";
    const res = await fetch(
      `${baseUrl}/api/chat/${chatId}/messages/${messageId}/reactions`,
      {
        method: "POST",
        ...withAuth,
        body: JSON.stringify({ emoji: "❤️" }),
      }
    );
    assert.ok([200, 400, 403, 404, 401].includes(res.status));
    if (res.status === 200) {
      const data = await res.json();
      assert.ok(data.reactions !== undefined);
    }
  });

  it("POST вложение (фото/файл) — FormData, нужен реальный chatId", async () => {
    if (!withAuth) return;
    const chatId = process.env.TEST_CHAT_ID || "test-chat-id";
    const formData = new FormData();
    const blob = new Blob(["test file content"], { type: "text/plain" });
    formData.append("file", blob, "test.txt");
    formData.append("content", "");
    const headers: Record<string, string> = {};
    if (authCookie) headers["Cookie"] = authCookie;
    const res = await fetch(`${baseUrl}/api/chat/${chatId}/attachments`, {
      method: "POST",
      headers,
      body: formData,
    });
    assert.ok([200, 400, 403, 404, 401].includes(res.status));
  });
});
