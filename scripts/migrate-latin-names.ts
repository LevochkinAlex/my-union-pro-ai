/**
 * Скрипт миграции латинских имён → кириллица.
 * Использует translitLatinToCyrillic из lib/translit-latin-to-cyrillic.ts.
 *
 * Usage:
 *   pnpm tsx scripts/migrate-latin-names.ts [--dry-run] [--org-id=ID]
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function looksLikeLatin(text: string): boolean {
  if (!text || typeof text !== "string") return false;
  const trimmed = text.trim();
  if (trimmed.length === 0) return false;
  return /[a-zA-Z]/.test(trimmed) && !/[а-яёА-ЯЁ]/.test(trimmed);
}

const MULTI: [RegExp, string][] = [
  [/shch/gi, "щ"],
  [/zh/gi, "ж"],
  [/ch/gi, "ч"],
  [/sh/gi, "ш"],
  [/yo/gi, "ё"],
  [/yu/gi, "ю"],
  [/ya/gi, "я"],
  [/ye/gi, "е"],
  [/ey\b/gi, "ей"],
  [/iy\b/gi, "ий"],
  [/ij\b/gi, "ий"],
  [/oy\b/gi, "ой"],
  [/ay\b/gi, "ай"],
  [/ia\b/gi, "ия"],
  [/ia(?=[a-z])/gi, "иа"],
  [/\bje/gi, "е"],
  [/je/gi, "ье"],
  [/ks/gi, "кс"],
  [/ts/gi, "ц"],
  [/x/gi, "кс"],
];

const SINGLE_LOWER: Record<string, string> = {
  a: "а", b: "б", v: "в", g: "г", d: "д", e: "е", z: "з", i: "и", j: "й",
  k: "к", l: "л", m: "м", n: "н", o: "о", p: "п", r: "р", s: "с", t: "т",
  u: "у", f: "ф", h: "х", c: "ц", w: "в", y: "ы",
  "'": "ь", "`": "ь",
};

const SKIP_ROLES = ["SUPER_ADMIN"];
const SKIP_NAME_PATTERNS = [/^AI$/i, /^bot$/i, /^test$/i, /^demo$/i, /^LLC$/i, /^admin$/i];

function shouldSkip(user: { firstName: string | null; lastName: string | null; role?: string }): boolean {
  if (user.role && SKIP_ROLES.includes(user.role)) return true;
  for (const pat of SKIP_NAME_PATTERNS) {
    if ((user.firstName && pat.test(user.firstName)) || (user.lastName && pat.test(user.lastName))) return true;
  }
  return false;
}

function translitLatinToCyrillic(text: string): string {
  if (!text || typeof text !== "string") return text;
  const trimmed = text.trim();
  if (trimmed.length === 0) return text;
  if (!looksLikeLatin(trimmed)) return text;

  let result = trimmed;
  for (const [re, repl] of MULTI) {
    result = result.replace(re, (match) => {
      if (match[0] === match[0].toUpperCase()) {
        return repl[0].toUpperCase() + repl.slice(1);
      }
      return repl;
    });
  }
  const out: string[] = [];
  for (const c of result) {
    const lower = c.toLowerCase();
    const cyr = SINGLE_LOWER[lower];
    if (cyr) {
      out.push(c === c.toUpperCase() ? cyr[0].toUpperCase() + cyr.slice(1) : cyr);
    } else {
      out.push(c);
    }
  }
  return out.join("");
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const orgIdArg = args.find((a) => a.startsWith("--org-id="));
  const orgId = orgIdArg?.split("=")[1];

  console.log(`\n🔤 Миграция латинских имён → кириллица`);
  console.log(`   Режим: ${dryRun ? "DRY RUN (без записи)" : "РЕАЛЬНАЯ ЗАПИСЬ"}`);
  if (orgId) console.log(`   Организация: ${orgId}`);

  const where: any = {};
  if (orgId) where.organizationId = orgId;

  const users = await prisma.user.findMany({
    where,
    select: {
      id: true,
      firstName: true,
      lastName: true,
      middleName: true,
      role: true,
      organization: { select: { name: true } },
    },
  });

  console.log(`   Всего пользователей: ${users.length}\n`);

  let updated = 0;
  const changes: { id: string; field: string; from: string; to: string }[] = [];

  let skipped = 0;
  for (const user of users) {
    if (shouldSkip(user)) { skipped++; continue; }
    const update: Record<string, string> = {};

    for (const field of ["firstName", "lastName", "middleName"] as const) {
      const val = user[field];
      if (val && looksLikeLatin(val)) {
        const converted = translitLatinToCyrillic(val);
        if (converted !== val) {
          update[field] = converted;
          changes.push({ id: user.id, field, from: val, to: converted });
        }
      }
    }

    if (Object.keys(update).length > 0) {
      if (!dryRun) {
        await prisma.user.update({
          where: { id: user.id },
          data: update,
        });
      }
      updated++;
      const org = user.organization?.name || "—";
      console.log(
        `  ${dryRun ? "[DRY]" : "✅"} ${user.lastName || "?"} ${user.firstName || "?"} (${org}):`
      );
      for (const ch of changes.filter((c) => c.id === user.id)) {
        console.log(`     ${ch.field}: "${ch.from}" → "${ch.to}"`);
      }
    }
  }

  console.log(`\n📊 Итого: ${updated} пользователей ${dryRun ? "будет обновлено" : "обновлено"} из ${users.length} (пропущено системных: ${skipped})`);
  if (dryRun && updated > 0) {
    console.log(`   Запустите без --dry-run для применения изменений`);
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error("Ошибка:", e);
  process.exit(1);
});
