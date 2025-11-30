import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { normalizePhone, getPhoneDigits } from "@/lib/utils/phone";

/**
 * POST /api/user/merge-accounts
 * Объединяет два аккаунта в один
 * 
 * primaryAccountId - аккаунт, данные которого останутся (главный)
 * secondaryAccountId - аккаунт, который будет удалён после переноса данных
 * newPhone - новый номер телефона для объединённого аккаунта
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const { primaryAccountId, secondaryAccountId, newPhone, smsVerified } = await request.json();

    if (!primaryAccountId || !secondaryAccountId || !newPhone) {
      return NextResponse.json(
        { error: "Не все параметры указаны" },
        { status: 400 }
      );
    }

    if (!smsVerified) {
      return NextResponse.json(
        { error: "Требуется подтверждение по SMS" },
        { status: 400 }
      );
    }

    const normalizedPhone = normalizePhone(newPhone);

    // Проверяем что текущий пользователь - один из двух аккаунтов
    if (session.user.id !== primaryAccountId && session.user.id !== secondaryAccountId) {
      return NextResponse.json(
        { error: "Вы не можете объединить чужие аккаунты" },
        { status: 403 }
      );
    }

    // Получаем оба аккаунта
    const [primaryAccount, secondaryAccount] = await Promise.all([
      prisma.user.findUnique({
        where: { id: primaryAccountId },
        include: {
          documents: true,
          chatSessions: true,
          membershipHistory: true,
          appeals: true,
        },
      }),
      prisma.user.findUnique({
        where: { id: secondaryAccountId },
        include: {
          documents: true,
          chatSessions: true,
          membershipHistory: true,
          appeals: true,
        },
      }),
    ]);

    if (!primaryAccount || !secondaryAccount) {
      return NextResponse.json(
        { error: "Один из аккаунтов не найден" },
        { status: 404 }
      );
    }

    // Начинаем транзакцию для слияния
    const result = await prisma.$transaction(async (tx) => {
      // 1. Переносим документы
      if (secondaryAccount.documents.length > 0) {
        await tx.document.updateMany({
          where: { userId: secondaryAccountId },
          data: { userId: primaryAccountId },
        });
      }

      // 2. Переносим чат-сессии
      if (secondaryAccount.chatSessions.length > 0) {
        await tx.chatSession.updateMany({
          where: { userId: secondaryAccountId },
          data: { userId: primaryAccountId },
        });
      }

      // 3. Переносим историю членства
      if (secondaryAccount.membershipHistory.length > 0) {
        await tx.membershipHistory.updateMany({
          where: { userId: secondaryAccountId },
          data: { userId: primaryAccountId },
        });
      }

      // 4. Переносим обращения
      if (secondaryAccount.appeals.length > 0) {
        await tx.userAppeal.updateMany({
          where: { userId: secondaryAccountId },
          data: { userId: primaryAccountId },
        });
      }

      // 5. Записываем историю телефонов
      await tx.phoneHistory.create({
        data: {
          userId: primaryAccountId,
          phone: normalizedPhone!,
          phoneNormalized: getPhoneDigits(normalizedPhone),
          changeType: "MERGE",
          previousPhone: primaryAccount.phone,
          source: "merge",
          notes: `Слияние с аккаунтом ${secondaryAccountId} (${secondaryAccount.firstName} ${secondaryAccount.lastName})`,
        },
      });

      // 6. Обновляем главный аккаунт с новым телефоном
      // Email НЕ меняется (остаётся от primary аккаунта)
      const updatedPrimary = await tx.user.update({
        where: { id: primaryAccountId },
        data: {
          phone: normalizedPhone,
          // Сохраняем authPhone если его не было
          authPhone: primaryAccount.authPhone || secondaryAccount.authPhone || normalizedPhone,
          // Если у primary нет unionCardNumber, берём от secondary
          unionCardNumber: primaryAccount.unionCardNumber || secondaryAccount.unionCardNumber,
          // Объединяем дополнительную информацию
          additionalInfo: primaryAccount.additionalInfo 
            ? primaryAccount.additionalInfo 
            : secondaryAccount.additionalInfo,
          hobbies: primaryAccount.hobbies || secondaryAccount.hobbies,
          aboutMe: primaryAccount.aboutMe || secondaryAccount.aboutMe,
        },
      });

      // 7. Удаляем вторичный аккаунт
      // Сначала удаляем связанные записи которые не перенесли
      await tx.sMSPinCode.deleteMany({ where: { userId: secondaryAccountId } });
      await tx.loginToken.deleteMany({ where: { userId: secondaryAccountId } });
      await tx.emailPinCode.deleteMany({ where: { userId: secondaryAccountId } });
      await tx.pushSubscription.deleteMany({ where: { userId: secondaryAccountId } });
      await tx.phoneHistory.deleteMany({ where: { userId: secondaryAccountId } });
      
      // Удаляем аккаунт
      await tx.user.delete({ where: { id: secondaryAccountId } });

      return {
        primaryAccount: updatedPrimary,
        deletedAccountId: secondaryAccountId,
        transferredDocuments: secondaryAccount.documents.length,
        transferredSessions: secondaryAccount.chatSessions.length,
      };
    });

    console.log("[merge-accounts] Success:", {
      primaryId: primaryAccountId,
      secondaryId: secondaryAccountId,
      newPhone: normalizedPhone,
    });

    return NextResponse.json({
      success: true,
      message: "Аккаунты успешно объединены",
      ...result,
    });
  } catch (error) {
    console.error("[merge-accounts] Error:", error);
    return NextResponse.json(
      { error: "Не удалось объединить аккаунты" },
      { status: 500 }
    );
  }
}

