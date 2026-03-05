import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { decryptPassword } from "@/lib/best-benefits-password";
import { getUserBestBenefitsToken } from "@/lib/best-benefits-user-auth";

/**
 * Получить СВЕЖИЙ промокод для активированной скидки.
 *
 * Логика:
 * 1. POST /api/promo — перевыпуск промокода в BestBenefits (основной путь).
 * 2. Если /promo не вернул код — GET /api/received для поиска активного кода.
 * 3. Если ничего нет — возвращаем кэш из БД.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const body = await request.json();
    const { discountId } = body;

    if (!discountId) {
      return NextResponse.json({ error: "discountId обязателен" }, { status: 400 });
    }

    const discountIdNum = Number(discountId);

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        id: true,
        email: true,
        bestBenefitsUserId: true,
        bestBenefitsPassword: true,
      },
    });

    if (!user?.bestBenefitsUserId || !user?.bestBenefitsPassword) {
      return NextResponse.json({
        error: "Не синхронизирован с BestBenefits",
        promoCode: null,
      }, { status: 200 });
    }

    let password: string;
    try {
      password = decryptPassword(user.bestBenefitsPassword);
    } catch (error) {
      console.error("[refresh-promo] Failed to decrypt password:", error);
      return NextResponse.json({ error: "Ошибка расшифровки пароля", promoCode: null }, { status: 200 });
    }

    let userToken: string;
    try {
      userToken = await getUserBestBenefitsToken(user.email, password);
    } catch (error) {
      console.error("[refresh-promo] Failed to get user token:", error);
      return NextResponse.json({ error: "Ошибка получения токена", promoCode: null }, { status: 200 });
    }

    console.log(`[refresh-promo] Requesting fresh promo code for discount ${discountId} via POST /api/promo...`);

    // ---- Шаг 1: POST /api/promo — перевыпуск промокода ----
    let freshPromoCode: string | null = null;
    let validUntilDate: Date | null = null;

    try {
      const promoResponse = await fetch("https://bestbenefits.ru/api/promo", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Authorization: `Bearer ${userToken}`,
        },
        body: JSON.stringify({ id: discountIdNum }),
        signal: AbortSignal.timeout(15000),
      });

      const promoText = await promoResponse.text();
      console.log(`[refresh-promo] POST /api/promo status=${promoResponse.status} body=${promoText}`);

      if (promoResponse.ok) {
        try {
          const promoData = JSON.parse(promoText);
          const code = promoData.data?.code;
          const endDate = promoData.data?.end_date;

          if (code && typeof code === "string" && code !== "Промокод деактивирован") {
            freshPromoCode = code.trim();
            if (endDate) {
              const d = new Date(endDate);
              if (!isNaN(d.getTime()) && d.getTime() >= Date.now()) validUntilDate = d;
            }
            console.log(`[refresh-promo] ✅ Got new code from /promo: ${freshPromoCode}`);
          }
        } catch (e) {
          console.warn("[refresh-promo] Failed to parse /promo response:", e);
        }
      }
    } catch (error) {
      console.warn("[refresh-promo] POST /api/promo failed:", error);
    }

    // ---- Шаг 2: Fallback — GET /api/received ----
    if (!freshPromoCode) {
      console.log("[refresh-promo] Falling back to GET /api/received...");
      try {
        const receivedRes = await fetch("https://bestbenefits.ru/api/received?per_page=100", {
          headers: { Accept: "application/json", Authorization: `Bearer ${userToken}` },
          signal: AbortSignal.timeout(15000),
        });

        if (receivedRes.ok) {
          const receivedData = await receivedRes.json();
          const products: any[] = receivedData.data || [];
          const bbDiscount = products.find((d: any) => d.id === discountIdNum);

          if (bbDiscount?.codes && Array.isArray(bbDiscount.codes)) {
            const now = Date.now();
            for (const c of bbDiscount.codes) {
              const code = c?.code;
              if (!code || code === "Промокод деактивирован") continue;
              const endDate = c?.end_date;
              if (endDate) {
                const d = new Date(endDate);
                if (!isNaN(d.getTime()) && d.getTime() < now) continue;
                validUntilDate = d;
              }
              freshPromoCode = code.trim();
              console.log(`[refresh-promo] ✅ Found valid code in /received: ${freshPromoCode}`);
              break;
            }
          }
        }
      } catch (error) {
        console.warn("[refresh-promo] GET /api/received failed:", error);
      }
    }

    console.log(`[refresh-promo] Result: code=${freshPromoCode || "none"}, validUntil=${validUntilDate?.toISOString() || "none"}`);

    // ---- Шаг 3: Сохраняем в БД ----
    if (freshPromoCode) {
      const existing = await prisma.discountActivation.findUnique({
        where: { userId_discountId: { userId: user.id, discountId: discountIdNum } },
        select: { promoCode: true, validUntil: true },
      });

      const changed = existing?.promoCode !== freshPromoCode ||
        (validUntilDate && existing?.validUntil?.getTime() !== validUntilDate.getTime());

      if (changed) {
        console.log(`[refresh-promo] 🔄 Updating DB: "${existing?.promoCode}" → "${freshPromoCode}"`);
        await prisma.discountActivation.upsert({
          where: { userId_discountId: { userId: user.id, discountId: discountIdNum } },
          update: {
            promoCode: freshPromoCode,
            ...(validUntilDate ? { validUntil: validUntilDate } : {}),
            lastSyncedAt: new Date(),
          },
          create: {
            userId: user.id,
            discountId: discountIdNum,
            promoCode: freshPromoCode,
            ...(validUntilDate ? { validUntil: validUntilDate } : {}),
            activatedAt: new Date(),
            lastSyncedAt: new Date(),
          },
        });
      }

      return NextResponse.json({
        promoCode: freshPromoCode,
        source: "api",
        updated: !!changed,
        validUntil: validUntilDate?.toISOString() || null,
      });
    }

    // Ничего не нашли — возвращаем кэш
    const cached = await prisma.discountActivation.findUnique({
      where: { userId_discountId: { userId: user.id, discountId: discountIdNum } },
      select: { promoCode: true },
    });

    return NextResponse.json({
      promoCode: cached?.promoCode || null,
      source: "cache",
      warning: "Не удалось получить новый промокод из BestBenefits",
    });

  } catch (error) {
    console.error("[refresh-promo] Error:", error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : "Ошибка получения промокода",
      promoCode: null,
    }, { status: 500 });
  }
}

