import test from "node:test";
import assert from "node:assert/strict";
import { isRestrictedJobTitleForSelfService } from "@/lib/dictionaries";

test("blocks restricted chairman job titles in self-service", () => {
  assert.equal(isRestrictedJobTitleForSelfService("Председатель"), true);
  assert.equal(isRestrictedJobTitleForSelfService("Председатель ППО"), true);
  assert.equal(isRestrictedJobTitleForSelfService(" председатель   ппо "), true);
});

test("allows other job titles", () => {
  assert.equal(isRestrictedJobTitleForSelfService("Заместитель председателя ППО"), false);
  assert.equal(isRestrictedJobTitleForSelfService("Бухгалтер"), false);
  assert.equal(isRestrictedJobTitleForSelfService(null), false);
});
