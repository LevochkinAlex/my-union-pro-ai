import assert from "node:assert";
import { describe, it } from "node:test";
import {
  detectLiquidationFromSummary,
  hasEgrulTerminationMarker,
  normalizeEgrulText,
  shouldBlockPartnerForLiquidation,
  summarizeEgrulRow,
} from "../lib/egrul-nalog/liquidation";

describe("normalizeEgrulText", () => {
  it("folds case and whitespace", () => {
    assert.strictEqual(normalizeEgrulText("  ЛИКВИДИРОВАНО  "), "ликвидировано");
  });
});

describe("summarizeEgrulRow", () => {
  it("includes termination marker when present", () => {
    const s = summarizeEgrulRow({
      n: 'ООО "ТЕСТ"',
      c: 'ООО "ТЕСТ"',
      e: "01.01.2020",
      k: "ul",
    });
    assert.ok(s.includes("Сведения о прекращении"));
    assert.ok(s.includes("01.01.2020"));
  });
});

describe("detectLiquidationFromSummary", () => {
  it("detects explicit liquidation phrases", () => {
    assert.strictEqual(detectLiquidationFromSummary("Организация ликвидирована"), true);
    assert.strictEqual(detectLiquidationFromSummary("Находится в процессе ликвидации"), true);
    assert.strictEqual(detectLiquidationFromSummary('ООО "РОГА" (ЛИКВИДАЦИОННАЯ КОМИССИЯ)'), true);
    assert.strictEqual(
      detectLiquidationFromSummary("НАХОДИТСЯ В ПРОЦЕССЕ ПРИНУДИТЕЛЬНОЙ ЛИКВИДАЦИИ"),
      true
    );
  });

  it("detects FNS row field g: liquidator representative (egrul.nalog.ru)", () => {
    const row = {
      c: 'АО "АВТОГРАДБАНК"',
      g: "ПРЕДСТАВИТЕЛЬ ЛИКВИДАТОРА: Леванов Виталий Алексеевич",
      n: 'АКЦИОНЕРНОЕ ОБЩЕСТВО "АВТОГРАДБАНК"',
      i: "1650072068",
      o: "1021600000806",
      k: "ul",
      rn: "Республика Татарстан (Татарстан)",
      r: "11.09.2002",
    };
    const summary = summarizeEgrulRow(row);
    assert.ok(summary.toLowerCase().includes("представитель ликвидатора"));
    assert.strictEqual(shouldBlockPartnerForLiquidation(row, summary), true);
  });

  it("returns false for active company wording", () => {
    assert.strictEqual(detectLiquidationFromSummary('ПАО "ГАЗПРОМ"'), false);
    assert.strictEqual(detectLiquidationFromSummary("Действующая организация"), false);
  });
});

describe("hasEgrulTerminationMarker", () => {
  it("true when e is non-empty", () => {
    assert.strictEqual(hasEgrulTerminationMarker({ e: "29.04.2025" }), true);
    assert.strictEqual(hasEgrulTerminationMarker({ e: "   " }), false);
    assert.strictEqual(hasEgrulTerminationMarker({}), false);
  });
});

describe("shouldBlockPartnerForLiquidation", () => {
  it("blocks when termination date field present", () => {
    assert.strictEqual(
      shouldBlockPartnerForLiquidation({ e: "19.05.2025", n: 'ООО "X"' }, 'ООО "X"'),
      true
    );
  });

  it("blocks on text without e", () => {
    assert.strictEqual(
      shouldBlockPartnerForLiquidation(
        { n: "КОМПАНИЯ НАХОДИТСЯ В ПРОЦЕССЕ ЛИКВИДАЦИИ" },
        "КОМПАНИЯ НАХОДИТСЯ В ПРОЦЕССЕ ЛИКВИДАЦИИ"
      ),
      true
    );
  });

  it("does not block active", () => {
    const row = { n: 'ПАО "СБЕРБАНК"', c: "ПАО СБЕРБАНК", i: "7707083893" };
    assert.strictEqual(shouldBlockPartnerForLiquidation(row, summarizeEgrulRow(row)), false);
  });
});
