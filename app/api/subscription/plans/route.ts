import { NextResponse } from "next/server";
import { getTariffPlans } from "@/lib/subscription";
import { formatPrice } from "@/lib/constants/tariffs";

/**
 * GET /api/subscription/plans
 * Список тарифных планов для выбора (публичный, для председателей)
 */
export async function GET() {
  const plans = getTariffPlans().map((p) => ({
    key: p.key,
    memberLimit: p.memberLimit,
    label: p.label,
    pricePerMonth: p.pricePerMonth,
    pricePerQuarter: p.pricePerQuarter,
    pricePerHalfYear: p.pricePerHalfYear,
    pricePerYear: p.pricePerYear,
    pricePerHalfYearFormatted: formatPrice(p.pricePerHalfYear),
    pricePerYearFormatted: formatPrice(p.pricePerYear),
    rateForHalfYear: p.pricePerUserPerMonth,
    rateForYear: p.pricePerUserPerYear,
    isUnlimited: p.isUnlimited ?? false,
  }));
  return NextResponse.json({ plans });
}
