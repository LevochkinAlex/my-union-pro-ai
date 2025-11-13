import { generateAppealPublicId, formatAppealId, unformatAppealId } from "@/lib/appeal-id";

describe("Appeal ID System", () => {
  describe("generateAppealPublicId", () => {
    it("should generate an 8-digit string", () => {
      const id = generateAppealPublicId();
      expect(id).toMatch(/^\d{8}$/);
    });

    it("should generate IDs within valid range", () => {
      for (let i = 0; i < 100; i++) {
        const id = generateAppealPublicId();
        const num = parseInt(id, 10);
        expect(num).toBeGreaterThanOrEqual(10000000);
        expect(num).toBeLessThanOrEqual(99999999);
      }
    });

    it("should generate different IDs on each call", () => {
      const ids = new Set<string>();
      for (let i = 0; i < 100; i++) {
        ids.add(generateAppealPublicId());
      }
      // Very unlikely to have duplicates in 100 calls
      expect(ids.size).toBeGreaterThan(99);
    });

    it("should always have 8 digits (no leading zero trimming)", () => {
      // Min value 10000000 should work
      const ids = [
        generateAppealPublicId(),
        generateAppealPublicId(),
        generateAppealPublicId(),
      ];
      ids.forEach((id) => {
        expect(id.length).toBe(8);
      });
    });
  });

  describe("formatAppealId", () => {
    it("should format 8-digit ID to XXXX-XXXX", () => {
      expect(formatAppealId("12345678")).toBe("1234-5678");
    });

    it("should format all zeros correctly", () => {
      expect(formatAppealId("00000000")).toBe("0000-0000");
    });

    it("should format max value correctly", () => {
      expect(formatAppealId("99999999")).toBe("9999-9999");
    });

    it("should return original if not 8 digits", () => {
      expect(formatAppealId("1234567")).toBe("1234567");
      expect(formatAppealId("123456789")).toBe("123456789");
    });

    it("should handle already formatted IDs gracefully", () => {
      // Should return as-is since it's not 8 digits
      expect(formatAppealId("1234-5678")).toBe("1234-5678");
    });
  });

  describe("unformatAppealId", () => {
    it("should remove hyphen from formatted ID", () => {
      expect(unformatAppealId("1234-5678")).toBe("12345678");
    });

    it("should handle multiple hyphens", () => {
      expect(unformatAppealId("1234-5678-1234")).toBe("123456781234");
    });

    it("should work with already unformatted IDs", () => {
      expect(unformatAppealId("12345678")).toBe("12345678");
    });

    it("should handle empty string", () => {
      expect(unformatAppealId("")).toBe("");
    });
  });

  describe("Round-trip formatting", () => {
    it("should survive format -> unformat cycle", () => {
      const original = "12345678";
      const formatted = formatAppealId(original);
      const unformatted = unformatAppealId(formatted);
      expect(unformatted).toBe(original);
    });

    it("should survive multiple cycles", () => {
      let id = "87654321";
      for (let i = 0; i < 5; i++) {
        id = unformatAppealId(formatAppealId(id));
      }
      expect(id).toBe("87654321");
    });
  });

  describe("Edge cases", () => {
    it("should handle numeric boundaries", () => {
      expect(formatAppealId("10000000")).toBe("1000-0000");
      expect(formatAppealId("99999999")).toBe("9999-9999");
    });

    it("should preserve leading zeros in formatting", () => {
      expect(formatAppealId("00123456")).toBe("0012-3456");
      expect(formatAppealId("10000001")).toBe("1000-0001");
    });

    it("should not alter non-ID strings", () => {
      const input = "abcdefgh";
      expect(formatAppealId(input)).toBe(input);
      expect(unformatAppealId(input)).toBe("abcdefgh");
    });
  });
});

