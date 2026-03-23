import assert from "node:assert";
import { describe, it } from "node:test";
import {
  workplaceInnDigits,
  workplaceInnSearchVariants,
  workplaceNameSearchTokens,
  workplaceNamesMatchForMapping,
} from "../lib/workplace-inn";

describe("workplace-inn", () => {
  it("workplaceInnDigits strips non-digits", () => {
    assert.strictEqual(workplaceInnDigits("50 27 0123456"), "50270123456");
    assert.strictEqual(workplaceInnDigits("7707083893"), "7707083893");
  });

  it("workplaceInnSearchVariants includes raw trimmed and digits-only", () => {
    const v = workplaceInnSearchVariants(" 7707083893 ");
    assert.ok(v.includes("7707083893"));
    assert.strictEqual(v.length >= 1, true);
  });

  it("workplaceNameSearchTokens picks substantive words", () => {
    const t = workplaceNameSearchTokens(
      'ГБУЗ «Воскресенская районная больница имени Ф.И. Овсянникова»'
    );
    assert.ok(t.some((w) => w.includes("воскресенск")));
    assert.ok(!t.includes("гбуз"));
  });

  it("workplaceNamesMatchForMapping: short user label vs full legal mapping name", () => {
    const user = "Воскресенская больница";
    const mapped =
      'ГБУЗ "Воскресенская районная больница имени Ф.И. Овсянникова" Московской области';
    assert.strictEqual(workplaceNamesMatchForMapping(user, mapped), true);
  });

  it("workplaceNamesMatchForMapping: rejects unrelated names on same generic token", () => {
    const user = "Тестовая поликлиника";
    const mapped = "ГБУЗ Иная городская больница №1";
    assert.strictEqual(workplaceNamesMatchForMapping(user, mapped), false);
  });
});
