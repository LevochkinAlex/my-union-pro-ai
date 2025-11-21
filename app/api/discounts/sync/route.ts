import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getUserActivatedDiscounts } from "@/lib/best-benefits-activation";
import { decryptPassword } from "@/lib/best-benefits-password";

/**
 * Синхронизация активированных скидок с BestBenefits
 * Проверяет, какие скидки пользователь активировал напрямую на сайте BestBenefits
 * и обновляет локальные preferences
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    // Get user with BestBenefits ID and password
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        id: true,
        email: true,
        bestBenefitsUserId: true,
        bestBenefitsPassword: true, // Need password for personal token
      },
    });

    if (!user) {
      return NextResponse.json({ error: "Пользователь не найден" }, { status: 404 });
    }

    if (!user.bestBenefitsUserId) {
      console.log("[sync-discounts] User not synced to BestBenefits yet");
      return NextResponse.json({
        success: true,
        message: "Пользователь ещё не синхронизирован с BestBenefits",
        synced: [],
      });
    }

    // Decrypt user's BestBenefits password for personal token
    let userPassword: string | undefined;
    if (user.bestBenefitsPassword) {
      try {
        userPassword = decryptPassword(user.bestBenefitsPassword);
        console.log(`[sync-discounts] ✅ Using PERSONAL token for user ${user.email}`);
      } catch (error) {
        console.error(`[sync-discounts] Failed to decrypt password:`, error);
      }
    } else {
      console.warn(`[sync-discounts] ⚠️ No password - using organization token (legacy)`);
    }

    // Fetch activated discounts from BestBenefits using personal token
    const bbActivated = await getUserActivatedDiscounts(user.bestBenefitsUserId, userPassword);

    if (bbActivated.length === 0) {
      console.log("[sync-discounts] No activated discounts found on BestBenefits");
      return NextResponse.json({
        success: true,
        message: "Нет активированных скидок на BestBenefits",
        synced: [],
      });
    }

    // Get existing preferences
    const existingPrefs = await prisma.discountPreference.findUnique({
      where: { userId: user.id },
    });

    const existingFilters = (existingPrefs?.filters as any) || {};
    const existingClaimed = Array.isArray(existingFilters.claimed) 
      ? existingFilters.claimed 
      : [];
    const existingFavorites = Array.isArray(existingFilters.favorites)
      ? existingFilters.favorites
      : [];

    // Merge BestBenefits activated discounts with local claimed
    const claimedMap = new Map<number, { id: number; promoCode?: string }>();
    
    // Add existing claimed
    for (const item of existingClaimed) {
      if (typeof item === 'object' && item.id) {
        claimedMap.set(item.id, item);
      } else if (typeof item === 'number') {
        claimedMap.set(item, { id: item });
      }
    }
    
    // Add BestBenefits activated (overwrite promo codes if available)
    for (const bbItem of bbActivated) {
      const existing = claimedMap.get(bbItem.id);
      claimedMap.set(bbItem.id, {
        id: bbItem.id,
        promoCode: bbItem.promoCode || existing?.promoCode,
      });
    }

    const updatedClaimed = Array.from(claimedMap.values());

    // Save merged preferences
    await prisma.discountPreference.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        pushEnabled: false,
        filters: {
          claimed: updatedClaimed,
          favorites: existingFavorites,
        },
      },
      update: {
        filters: {
          claimed: updatedClaimed,
          favorites: existingFavorites,
        },
      },
    });

    console.log("[sync-discounts] Synced discounts:", {
      userId: user.id,
      bbActivated: bbActivated.length,
      totalClaimed: updatedClaimed.length,
    });

    return NextResponse.json({
      success: true,
      message: `Синхронизировано ${bbActivated.length} скидок с BestBenefits`,
      synced: bbActivated.map(d => d.id),
      totalClaimed: updatedClaimed.length,
    });
  } catch (error) {
    console.error("[sync-discounts] ❌ Error:", error);
    if (error instanceof Error) {
      console.error("[sync-discounts] Error message:", error.message);
      console.error("[sync-discounts] Error stack:", error.stack);
    }
    return NextResponse.json(
      { 
        error: "Не удалось синхронизировать скидки",
        details: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    );
  }
}

