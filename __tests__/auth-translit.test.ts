/**
 * Тесты транслитерации ФИО для авторизации (VK ID, Яндекс).
 * Запуск: pnpm test (файл добавлен в script test)
 */

import { describe, it } from "node:test";
import assert from "node:assert";
import {
  translitLatinToCyrillic,
  looksLikeLatin,
} from "@/lib/translit-latin-to-cyrillic";

describe("Auth: translit ФИО (VK ID / Yandex)", () => {
  describe("translitLatinToCyrillic", () => {
    it("переводит имя с латиницы в кириллицу", () => {
      assert.strictEqual(translitLatinToCyrillic("Vitalij"), "Виталий");
      assert.strictEqual(translitLatinToCyrillic("Renat"), "Ренат");
    });

    it("оставляет кириллицу без изменений", () => {
      assert.strictEqual(translitLatinToCyrillic("Ренат"), "Ренат");
      assert.strictEqual(translitLatinToCyrillic("Иван Иванов"), "Иван Иванов");
    });

    it("обрабатывает фамилию латиницей", () => {
      assert.ok(translitLatinToCyrillic("Ivanov").includes("Иван"));
    });
  });

  describe("looksLikeLatin", () => {
    it("считает латиницу", () => {
      assert.strictEqual(looksLikeLatin("Vitalij"), true);
      assert.strictEqual(looksLikeLatin("Renat"), true);
    });

    it("считает кириллицу не латиницей", () => {
      assert.strictEqual(looksLikeLatin("Ренат"), false);
      assert.strictEqual(looksLikeLatin("Иван"), false);
    });
  });
});
