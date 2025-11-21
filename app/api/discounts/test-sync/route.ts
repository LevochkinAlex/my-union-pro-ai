import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getUserActivatedDiscounts } from "@/lib/best-benefits-activation";
import { decryptPassword } from "@/lib/best-benefits-password";

/**
 * Тестовый endpoint для отладки синхронизации
 */
export async function GET(request: NextRequest) {
  try {
    console.log("[test-sync] Starting test...");
    
    const session = await getServerSession(authOptions);
    console.log("[test-sync] Session:", session?.user?.email);
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Не авторизован", step: "auth" }, { status: 401 });
    }

    console.log("[test-sync] Fetching user from DB...");
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        id: true,
        email: true,
        bestBenefitsUserId: true,
        bestBenefitsPassword: true,
      },
    });

    if (!user) {
      return NextResponse.json({ error: "Пользователь не найден", step: "user" }, { status: 404 });
    }

    console.log("[test-sync] User found:", user.email);

    if (!user.bestBenefitsUserId) {
      return NextResponse.json({
        error: "User not synced to BestBenefits",
        step: "bb_user_id",
      });
    }

    console.log("[test-sync] BB User ID:", user.bestBenefitsUserId);

    let userPassword: string | undefined;
    if (user.bestBenefitsPassword) {
      try {
        console.log("[test-sync] Decrypting password...");
        userPassword = decryptPassword(user.bestBenefitsPassword);
        console.log("[test-sync] ✅ Password decrypted");
      } catch (error) {
        console.error("[test-sync] ❌ Failed to decrypt password:", error);
        return NextResponse.json({
          error: "Failed to decrypt password",
          step: "decrypt",
          details: error instanceof Error ? error.message : String(error),
        }, { status: 500 });
      }
    } else {
      console.log("[test-sync] ⚠️ No password saved");
    }

    console.log("[test-sync] Fetching activated discounts...");
    const bbActivated = await getUserActivatedDiscounts(user.bestBenefitsUserId, userPassword);
    console.log("[test-sync] Found discounts:", bbActivated.length);

    return NextResponse.json({
      success: true,
      step: "complete",
      user: {
        email: user.email,
        bbUserId: user.bestBenefitsUserId,
        hasPassword: !!user.bestBenefitsPassword,
      },
      discounts: bbActivated,
    });
  } catch (error) {
    console.error("[test-sync] ❌ Unexpected error:", error);
    if (error instanceof Error) {
      console.error("[test-sync] Error message:", error.message);
      console.error("[test-sync] Error stack:", error.stack);
    }
    return NextResponse.json(
      {
        error: "Unexpected error",
        step: "catch",
        details: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      },
      { status: 500 }
    );
  }
}

