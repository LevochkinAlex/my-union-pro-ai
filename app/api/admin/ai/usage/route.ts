import { NextRequest, NextResponse } from "next/server";
import { ensureSuperAdmin } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/admin/ai/usage?days=30
 *
 * Возвращает полный срез расходов ИИ за период (по умолчанию 30 дней):
 * - totals: агрегаты за период
 * - byDay: точки на графике по дням (tokens + cost)
 * - byModel: разрез по модели
 * - byOperation: chat vs embedding
 * - byRoute: разрез по роуту (улучшение текста, лендинг, ассистент, ...)
 * - topUsers: топ-10 пользователей по токенам
 * - topBots: топ-10 ботов по токенам
 * - recent: последние 50 событий
 */
export async function GET(request: NextRequest) {
  const { error } = await ensureSuperAdmin();
  if (error) return error;

  const daysParam = Number(request.nextUrl.searchParams.get("days") ?? 30);
  const days = Math.min(Math.max(daysParam || 30, 1), 180);
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  // Все события в периоде — один запрос, дальше агрегируем в памяти.
  // Для наших объёмов (сотни событий / день) это быстрее и проще, чем
  // 5-6 отдельных groupBy с их синтаксическими ограничениями.
  const events = await prisma.aIUsageEvent.findMany({
    where: { createdAt: { gte: since } },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      createdAt: true,
      provider: true,
      model: true,
      operation: true,
      route: true,
      inputTokens: true,
      outputTokens: true,
      totalTokens: true,
      costKopecks: true,
      userId: true,
      botId: true,
      durationMs: true,
      status: true,
      error: true,
    },
  });

  const totals = {
    requests: events.length,
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    costKopecks: 0,
    errors: 0,
  };

  const byDayMap = new Map<
    string,
    { totalTokens: number; costKopecks: number; requests: number }
  >();
  const byModelMap = new Map<
    string,
    { totalTokens: number; costKopecks: number; requests: number }
  >();
  const byOperationMap = new Map<
    string,
    { totalTokens: number; costKopecks: number; requests: number }
  >();
  const byRouteMap = new Map<
    string,
    { totalTokens: number; costKopecks: number; requests: number }
  >();
  const byUserMap = new Map<
    string,
    { totalTokens: number; costKopecks: number; requests: number }
  >();
  const byBotMap = new Map<
    string,
    { totalTokens: number; costKopecks: number; requests: number }
  >();

  const bump = (
    map: Map<string, { totalTokens: number; costKopecks: number; requests: number }>,
    key: string,
    ev: (typeof events)[number],
  ) => {
    const cur = map.get(key) ?? { totalTokens: 0, costKopecks: 0, requests: 0 };
    cur.totalTokens += ev.totalTokens;
    cur.costKopecks += ev.costKopecks;
    cur.requests += 1;
    map.set(key, cur);
  };

  for (const ev of events) {
    totals.inputTokens += ev.inputTokens;
    totals.outputTokens += ev.outputTokens;
    totals.totalTokens += ev.totalTokens;
    totals.costKopecks += ev.costKopecks;
    if (ev.status === "error") totals.errors += 1;

    const day = ev.createdAt.toISOString().slice(0, 10);
    bump(byDayMap, day, ev);
    bump(byModelMap, ev.model, ev);
    bump(byOperationMap, ev.operation, ev);
    bump(byRouteMap, ev.route, ev);
    if (ev.userId) bump(byUserMap, ev.userId, ev);
    if (ev.botId) bump(byBotMap, ev.botId, ev);
  }

  // Заполняем «дырки» в днях нулями, чтобы график был непрерывным.
  const byDay: Array<{ date: string; totalTokens: number; costKopecks: number; requests: number }> = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
    const key = d.toISOString().slice(0, 10);
    const v = byDayMap.get(key) ?? { totalTokens: 0, costKopecks: 0, requests: 0 };
    byDay.push({ date: key, ...v });
  }

  const mapToArray = (m: typeof byModelMap) =>
    Array.from(m.entries())
      .map(([key, v]) => ({ key, ...v }))
      .sort((a, b) => b.totalTokens - a.totalTokens);

  // Топ-пользователи: достаём имена
  const topUserIds = mapToArray(byUserMap).slice(0, 10).map((x) => x.key);
  const users = topUserIds.length
    ? await prisma.user.findMany({
        where: { id: { in: topUserIds } },
        select: { id: true, firstName: true, lastName: true, email: true, role: true },
      })
    : [];
  const userMap = new Map(users.map((u) => [u.id, u]));
  const topUsers = mapToArray(byUserMap)
    .slice(0, 10)
    .map((x) => {
      const u = userMap.get(x.key);
      const name =
        u && (u.firstName || u.lastName)
          ? [u.firstName, u.lastName].filter(Boolean).join(" ")
          : u?.email || "—";
      return { userId: x.key, name, email: u?.email ?? null, role: u?.role ?? null, ...x };
    });

  // Топ-боты
  const topBotIds = mapToArray(byBotMap).slice(0, 10).map((x) => x.key);
  const bots = topBotIds.length
    ? await prisma.chatBot.findMany({
        where: { id: { in: topBotIds } },
        select: { id: true, name: true, model: true },
      })
    : [];
  const botMap = new Map(bots.map((b) => [b.id, b]));
  const topBots = mapToArray(byBotMap)
    .slice(0, 10)
    .map((x) => {
      const b = botMap.get(x.key);
      return { botId: x.key, name: b?.name ?? "—", model: b?.model ?? null, ...x };
    });

  const recent = events.slice(0, 50).map((ev) => {
    const u = ev.userId ? userMap.get(ev.userId) : null;
    return {
      id: ev.id,
      createdAt: ev.createdAt.toISOString(),
      operation: ev.operation,
      route: ev.route,
      model: ev.model,
      inputTokens: ev.inputTokens,
      outputTokens: ev.outputTokens,
      totalTokens: ev.totalTokens,
      costKopecks: ev.costKopecks,
      durationMs: ev.durationMs,
      status: ev.status,
      userName:
        u && (u.firstName || u.lastName)
          ? [u.firstName, u.lastName].filter(Boolean).join(" ")
          : u?.email ?? null,
    };
  });

  return NextResponse.json({
    days,
    totals,
    byDay,
    byModel: mapToArray(byModelMap),
    byOperation: mapToArray(byOperationMap),
    byRoute: mapToArray(byRouteMap).slice(0, 15),
    topUsers,
    topBots,
    recent,
  });
}
