import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { cleanupExpiredDiscounts } from "@/lib/discount-activation";

/**
 * Очистка устаревших скидок для всех пользователей
 * POST /api/admin/cleanup-expired-discounts
 * 
 * Удаляет все скидки, у которых validUntil < now
 */
export async function POST(request: NextRequest) {
  try {
    // Разрешаем внутренние запросы с секретным ключом
    const internalSecret = request.headers.get("X-Internal-Secret");
    const expectedSecret = process.env.INTERNAL_API_SECRET || "internal-secret-key-change-in-production";
    const isInternalRequest = internalSecret === expectedSecret;
    
    // Если это не внутренний запрос, проверяем сессию
    if (!isInternalRequest) {
      try {
        const session = await getServerSession(authOptions);
        
        // Проверяем, что это админ
        if (!session?.user || session.user.role !== "SUPER_ADMIN") {
          return NextResponse.json({ error: "Недостаточно прав" }, { status: 403 });
        }
      } catch (authError) {
        return NextResponse.json({ error: "Недостаточно прав" }, { status: 403 });
      }
    }

    const deletedCount = await cleanupExpiredDiscounts();

    return NextResponse.json({
      success: true,
      message: `Удалено ${deletedCount} устаревших скидок`,
      deletedCount,
    });
  } catch (error: any) {
    console.error("[cleanup-expired-discounts] Error:", error);
    return NextResponse.json(
      { error: error.message || "Ошибка при очистке устаревших скидок" },
      { status: 500 }
    );
  }
}

