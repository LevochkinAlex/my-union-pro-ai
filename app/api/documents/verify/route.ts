import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * POST /api/documents/verify
 * AI-проверка загруженного документа на соответствие типу заявления
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const { documentId } = await request.json();

    if (!documentId) {
      return NextResponse.json(
        { error: "ID документа обязателен" },
        { status: 400 }
      );
    }

    // Получаем документ с данными пользователя
    const document = await prisma.document.findFirst({
      where: {
        id: documentId,
        userId: session.user.id,
      },
      include: {
        user: {
          select: {
            firstName: true,
            lastName: true,
            middleName: true,
          },
        },
      },
    });

    if (!document) {
      return NextResponse.json(
        { error: "Документ не найден" },
        { status: 404 }
      );
    }

    if (!document.signedFilePath) {
      return NextResponse.json(
        { error: "Подписанный документ не загружен" },
        { status: 400 }
      );
    }

    console.log("[document-verify] Starting verification for:", {
      documentId,
      type: document.type,
      userId: session.user.id,
    });

    // Определяем ожидаемый тип документа
    const expectedContent = getExpectedContent(document.type, document.user);

    // Обновляем статус на "проверяется"
    await prisma.document.update({
      where: { id: documentId },
      data: {
        verificationStatus: "VERIFYING",
        verificationMessage: null,
      },
    });

    // Выполняем проверку (симуляция AI анализа)
    // В реальной реализации здесь был бы вызов OCR + AI
    const verificationResult = await performVerification(
      document.signedFilePath,
      document.type,
      expectedContent
    );

    // Обновляем результат проверки
    await prisma.document.update({
      where: { id: documentId },
      data: {
        verificationStatus: verificationResult.status,
        verificationMessage: verificationResult.message,
        verifiedAt: new Date(),
      },
    });

    console.log("[document-verify] Verification complete:", verificationResult);

    return NextResponse.json({
      success: true,
      status: verificationResult.status,
      message: verificationResult.message,
    });
  } catch (error) {
    console.error("[document-verify] Error:", error);
    return NextResponse.json(
      {
        error: "Не удалось проверить документ",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

interface ExpectedContent {
  documentType: string;
  userName: string;
  keywords: string[];
}

function getExpectedContent(
  type: string,
  user: { firstName: string | null; lastName: string | null; middleName: string | null }
): ExpectedContent {
  const userName = [user.lastName, user.firstName, user.middleName]
    .filter(Boolean)
    .join(" ");

  if (type === "MEMBERSHIP_APPLICATION") {
    return {
      documentType: "Заявление о вступлении в профсоюз",
      userName,
      keywords: [
        "заявление",
        "вступлени",
        "профсоюз",
        "член",
        "прошу принять",
      ],
    };
  }

  if (type === "CONTRIBUTION_APPLICATION") {
    return {
      documentType: "Заявление о перечислении членских взносов",
      userName,
      keywords: [
        "заявление",
        "взнос",
        "членск",
        "перечисл",
        "удержив",
        "заработн",
      ],
    };
  }

  return {
    documentType: "Документ",
    userName,
    keywords: [],
  };
}

interface VerificationResult {
  status: "VERIFIED" | "FAILED" | "NEEDS_REVIEW";
  message: string;
}

async function performVerification(
  filePath: string,
  documentType: string,
  expectedContent: ExpectedContent
): Promise<VerificationResult> {
  // Симуляция задержки обработки (1-2 секунды)
  await new Promise((resolve) => setTimeout(resolve, 1500));

  // Проверяем расширение файла
  const extension = filePath.toLowerCase().split(".").pop();
  const isValidFormat = ["pdf", "jpg", "jpeg", "png"].includes(extension || "");

  if (!isValidFormat) {
    return {
      status: "FAILED",
      message: "Неподдерживаемый формат файла. Загрузите PDF или изображение.",
    };
  }

  // В реальной реализации здесь был бы:
  // 1. OCR для извлечения текста из PDF/изображения
  // 2. AI анализ соответствия документа
  // 3. Проверка наличия подписи
  
  // Пока делаем базовую проверку - считаем документ валидным
  // если он загружен в правильном формате
  
  // Случайная проверка для демонстрации разных статусов (в проде убрать)
  // const random = Math.random();
  // if (random < 0.1) {
  //   return {
  //     status: "NEEDS_REVIEW",
  //     message: "Документ требует ручной проверки администратором",
  //   };
  // }

  return {
    status: "VERIFIED",
    message: `${expectedContent.documentType} предварительно проверено. Ожидает одобрения председателем.`,
  };
}

