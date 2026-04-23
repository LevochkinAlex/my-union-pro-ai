import type { PartnerModerationStatus } from "@prisma/client";
import { lookupEgrulByInnOrOgrn } from "@/lib/egrul-nalog/client";
import { shouldBlockPartnerForLiquidation } from "@/lib/egrul-nalog/liquidation";
import { notifyPartnerLiquidationBlocked } from "@/lib/partner-liquidation-block-email";
import { prisma, withPrismaRetry } from "@/lib/prisma";

const BATCH = 75;

function onlyDigits(s: string | null | undefined): string {
  return String(s ?? "").replace(/\D/g, "");
}

/** Достаточно цифр для осмысленного запроса на egrul.nalog.ru */
export function partnerHasEgrulLookupKey(inn: string | null | undefined, ogrn: string | null | undefined): boolean {
  const innD = onlyDigits(inn);
  const ogrD = onlyDigits(ogrn);
  if (ogrD.length === 13 || ogrD.length === 15) return true;
  if (innD.length === 10 || innD.length === 12) return true;
  return false;
}

export type PartnerLiquidationScanParams = {
  partnerIds?: string[];
  triggeredBy: "CRON" | "ADMIN";
  /** Свежий запрос к egrul.nalog.ru без кэша (кнопка в карточке партнёра). */
  skipEgrulCache?: boolean;
};

export type PartnerLiquidationScanResult = {
  processed: number;
  updatedStatusOnly: number;
  blocked: number;
  errors: string[];
  captchaHits: number;
};

/**
 * Обходит активных партнёров с ИНН/ОГРН, опрашивает ФНС, при ликвидации ставит BLOCKED.
 */
export async function runPartnerLiquidationScan(
  params: PartnerLiquidationScanParams
): Promise<PartnerLiquidationScanResult> {
  const errors: string[] = [];
  let processed = 0;
  let updatedStatusOnly = 0;
  let blocked = 0;
  let captchaHits = 0;

  const idFilter =
    params.partnerIds && params.partnerIds.length > 0 ? { id: { in: params.partnerIds } } : {};

  const baseWhere = {
    isActive: true,
    ...idFilter,
    OR: [
      { inn: { not: null, notIn: [""] } },
      { ogrn: { not: null, notIn: [""] } },
    ],
  };

  const partners = await withPrismaRetry(() =>
    prisma.partner.findMany({
      where: baseWhere,
      select: { id: true, inn: true, ogrn: true },
      orderBy: { id: "asc" },
    })
  );

  const eligible = partners.filter((p) => partnerHasEgrulLookupKey(p.inn, p.ogrn));

  const bypassEgrulCache = Boolean(params.skipEgrulCache);

  for (let i = 0; i < eligible.length; i += BATCH) {
    const chunk = eligible.slice(i, i + BATCH);
    for (const p of chunk) {
      processed += 1;
      const lookup = await lookupEgrulByInnOrOgrn(p.inn, p.ogrn, { bypassCache: bypassEgrulCache });
      if (lookup.ok === false) {
        if (lookup.captchaRequired) captchaHits += 1;
        const msg = `[partner-liquidation] partner=${p.id} inn=${onlyDigits(p.inn)} ogrn=${onlyDigits(p.ogrn)}: ${lookup.error}`;
        console.error(msg);
        errors.push(msg);
        try {
          await withPrismaRetry(() =>
            prisma.partner.update({
              where: { id: p.id },
              data: { egrulCheckedAt: new Date() },
            })
          );
        } catch (e) {
          console.error(`[partner-liquidation] failed to set egrulCheckedAt for ${p.id}`, e);
        }
        continue;
      }

      const summary = lookup.summary;
      const mustBlock = shouldBlockPartnerForLiquidation(lookup.row, summary);

      const outcome = await withPrismaRetry(() =>
        prisma.$transaction(async (tx) => {
          const cur = await tx.partner.findUnique({
            where: { id: p.id },
            select: {
              moderationStatus: true,
              egrulStatusText: true,
              email: true,
              contactEmail: true,
              name: true,
            },
          });
          if (!cur) return { kind: "skip" as const };

          const prevText = cur.egrulStatusText ?? "";
          const textChanged = prevText !== summary;
          const checkedAt = new Date();
          const becameBlocked = mustBlock && cur.moderationStatus !== "BLOCKED";

          if (textChanged) {
            console.log(
              `[partner-liquidation] egrulStatusText changed partner=${p.id} triggeredBy=${params.triggeredBy}:`,
              JSON.stringify({ from: prevText.slice(0, 200), to: summary.slice(0, 200) })
            );
          }

          if (becameBlocked) {
            await tx.partner.update({
              where: { id: p.id },
              data: {
                egrulCheckedAt: checkedAt,
                egrulStatusText: summary,
                moderationStatus: "BLOCKED" as PartnerModerationStatus,
                liquidationAutoBlockedAt: checkedAt,
              },
            });
            console.log(
              `[partner-liquidation] moderation→BLOCKED partner=${p.id} triggeredBy=${params.triggeredBy}`,
              { summary: summary.slice(0, 300) }
            );
            return {
              kind: "blocked" as const,
              notifyEmail: cur.email,
              notifyContactEmail: cur.contactEmail,
              partnerName: cur.name,
              egrulSummary: summary,
            };
          }

          await tx.partner.update({
            where: { id: p.id },
            data: {
              egrulCheckedAt: checkedAt,
              egrulStatusText: summary,
            },
          });
          return { kind: "updated" as const, textChanged };
        })
      );

      if (outcome?.kind === "blocked") {
        blocked += 1;
        try {
          await notifyPartnerLiquidationBlocked({
            partnerId: p.id,
            to: outcome.notifyEmail,
            contactEmail: outcome.notifyContactEmail,
            partnerName: outcome.partnerName,
            egrulSummary: outcome.egrulSummary,
          });
        } catch (e) {
          console.error(`[partner-liquidation] не удалось отправить письмо о блокировке partner=${p.id}`, e);
        }
      } else if (outcome?.kind === "updated" && outcome.textChanged) {
        updatedStatusOnly += 1;
      }
    }
  }

  console.log(
    `[partner-liquidation] done triggeredBy=${params.triggeredBy} processed=${processed} blocked=${blocked} statusUpdates=${updatedStatusOnly} errors=${errors.length} captcha=${captchaHits}`
  );

  return { processed, updatedStatusOnly, blocked, errors, captchaHits };
}
