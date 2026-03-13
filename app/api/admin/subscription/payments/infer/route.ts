import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { inferMemberLimitFromAmount, type TariffPeriod } from "@/lib/constants/tariffs";

function ensureSuperAdmin(session: { user?: { id?: string; role?: string } } | null) {
  if (!session?.user?.id) {
    return { error: NextResponse.json({ error: "Не авторизован" }, { status: 401 }) };
  }
  if (session.user?.role !== "SUPER_ADMIN") {
    return { error: NextResponse.json({ error: "Доступ запрещен" }, { status: 403 }) };
  }
  return { error: null };
}

/**
 * GET /api/admin/subscription/payments/infer?amountRub=23700&period=half_year
 * По сумме и периоду (half_year | year) подобрать возможное кол-во участников.
 * Если оплата 23700 за 6 мес — вернёт точное совпадение по тарифам (например 50 участников).
 */
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  const err = ensureSuperAdmin(session);
  if (err.error) return err.error;

  const { searchParams } = new URL(request.url);
  const amountRubParam = searchParams.get("amountRub");
  const period = (searchParams.get("period") || "half_year") as TariffPeriod;
  if (period !== "half_year" && period !== "year") {
    return NextResponse.json({ error: "period должен быть half_year или year" }, { status: 400 });
  }

  const amountRub = amountRubParam != null ? parseFloat(String(amountRubParam).replace(/\s/g, "").replace(",", ".")) : NaN;
  if (!Number.isFinite(amountRub) || amountRub <= 0) {
    return NextResponse.json({ error: "Укажите amountRub (например 23700)" }, { status: 400 });
  }

  const options = inferMemberLimitFromAmount(amountRub, period);

  return NextResponse.json({
    amountRub,
    period,
    options: options.length > 0 ? options : [],
    message:
      options.length > 0
        ? `По сумме ${amountRub} ₽ за ${period === "half_year" ? "6 месяцев" : "12 месяцев"} подходит: ${options.map((o) => `${o.memberLimit} участников`).join(", ")}`
        : `Точного совпадения по тарифам нет. Проверьте сумму или период.`,
  });
}
