/**
 * Unit-тесты для хелперов документов (lib/documents).
 * Запуск: node --import tsx --test __tests__/documents-helpers.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert";
import {
  hasBothApplicationsSubmitted,
  DOCUMENT_SUBMITTED_STATUSES,
  DOCUMENT_ON_REVIEW_STATUSES,
} from "../lib/documents-status";

describe("Documents helpers", () => {
  describe("hasBothApplicationsSubmitted", () => {
    it("возвращает true, когда оба заявления в статусе SIGNED", () => {
      const documents = [
        { type: "MEMBERSHIP_APPLICATION", status: "SIGNED" },
        { type: "CONTRIBUTION_APPLICATION", status: "SIGNED" },
      ];
      assert.strictEqual(hasBothApplicationsSubmitted(documents), true);
    });

    it("возвращает true, когда оба заявления в статусе PENDING_REVIEW", () => {
      const documents = [
        { type: "MEMBERSHIP_APPLICATION", status: "PENDING_REVIEW" },
        { type: "CONTRIBUTION_APPLICATION", status: "PENDING_REVIEW" },
      ];
      assert.strictEqual(hasBothApplicationsSubmitted(documents), true);
    });

    it("возвращает false, когда только заявление о членстве", () => {
      const documents = [
        { type: "MEMBERSHIP_APPLICATION", status: "SIGNED" },
      ];
      assert.strictEqual(hasBothApplicationsSubmitted(documents), false);
    });

    it("возвращает false, когда только заявление о взносах", () => {
      const documents = [
        { type: "CONTRIBUTION_APPLICATION", status: "SIGNED" },
      ];
      assert.strictEqual(hasBothApplicationsSubmitted(documents), false);
    });

    it("возвращает false, когда оба в статусе GENERATED", () => {
      const documents = [
        { type: "MEMBERSHIP_APPLICATION", status: "GENERATED" },
        { type: "CONTRIBUTION_APPLICATION", status: "GENERATED" },
      ];
      assert.strictEqual(hasBothApplicationsSubmitted(documents), false);
    });

    it("возвращает false для пустого массива", () => {
      assert.strictEqual(hasBothApplicationsSubmitted([]), false);
    });

    it("с кастомным списком статусов учитывает только их", () => {
      const documents = [
        { type: "MEMBERSHIP_APPLICATION", status: "SIGNED" },
        { type: "CONTRIBUTION_APPLICATION", status: "SIGNED" },
      ];
      assert.strictEqual(
        hasBothApplicationsSubmitted(documents, ["PENDING_REVIEW"]),
        false
      );
      assert.strictEqual(
        hasBothApplicationsSubmitted(documents, DOCUMENT_ON_REVIEW_STATUSES),
        false
      );
    });
  });

  describe("DOCUMENT_SUBMITTED_STATUSES", () => {
    it("включает SIGNED и статусы проверки", () => {
      assert.ok(DOCUMENT_SUBMITTED_STATUSES.includes("SIGNED"));
      assert.ok(DOCUMENT_SUBMITTED_STATUSES.includes("PENDING_REVIEW"));
      assert.ok(DOCUMENT_SUBMITTED_STATUSES.includes("COMPLETED"));
    });
  });

  describe("DOCUMENT_ON_REVIEW_STATUSES", () => {
    it("не включает SIGNED", () => {
      assert.strictEqual(
        DOCUMENT_ON_REVIEW_STATUSES.includes("SIGNED"),
        false
      );
    });
    it("включает PENDING_REVIEW и COMPLETED", () => {
      assert.ok(DOCUMENT_ON_REVIEW_STATUSES.includes("PENDING_REVIEW"));
      assert.ok(DOCUMENT_ON_REVIEW_STATUSES.includes("COMPLETED"));
    });
  });
});
