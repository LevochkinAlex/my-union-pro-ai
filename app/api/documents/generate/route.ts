import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sendUserNotification } from "@/lib/notifications";
import {
  validateUserForMembershipDocuments,
  getDefaultMembershipTemplates,
  generateMembershipAndContributionPDFs,
  saveGeneratedMembershipDocumentsToDb,
  cleanupOldOtherDocuments,
} from "@/lib/document-generation";

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    let isExistingMember = false;
    try {
      const body = await request.json().catch(() => ({}));
      isExistingMember = !!body?.isExistingMember;
    } catch {
      // body может быть пустым
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      include: { organization: true },
    });

    if (!user) {
      return NextResponse.json({ error: "Пользователь не найден" }, { status: 404 });
    }

    const validation = validateUserForMembershipDocuments(user);
    if (!validation.ok) {
      console.error("[documents/generate] ❌ Профиль не полностью заполнен. Отсутствуют поля:", validation.missingFields);
      return NextResponse.json(
        {
          error: "Профиль не полностью заполнен. Пожалуйста, заполните все обязательные поля.",
          missingFields: validation.missingFields,
        },
        { status: 400 }
      );
    }

    const templates = await getDefaultMembershipTemplates(prisma);
    if (!templates) {
      return NextResponse.json(
        { error: "Шаблоны заявлений не настроены. Обратитесь к администратору (Конструктор документов)." },
        { status: 500 }
      );
    }

    console.log("[documents/generate] Генерация PDF из шаблонов...");
    const { membershipPdf, duesPdf } = await generateMembershipAndContributionPDFs(
      user,
      templates.membershipTemplate,
      templates.duesTemplate
    );

    await cleanupOldOtherDocuments(prisma, user.id);

    const { membershipDoc, duesDoc } = await saveGeneratedMembershipDocumentsToDb(
      prisma,
      user,
      membershipPdf,
      duesPdf,
      templates.membershipTemplate,
      templates.duesTemplate
    );

    await prisma.user.update({
      where: { id: user.id },
      data: { profileChangedAfterDocuments: false },
    });

    const { cacheDeletePattern } = await import("@/lib/cache");
    await cacheDeletePattern(`profile:userId:${user.id}:*`);

    try {
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://myunion.pro";
      const documentsUrl = `${baseUrl}/dashboard/documents`;
      if (isExistingMember) {
        await sendUserNotification({
          userId: user.id,
          type: "documents_ready",
          title: "Документы сформированы",
          body: [
            "Ваши заявления сформированы и сохранены в разделе «Документы».",
            "Заявка направлена председателю для подтверждения вашего членства.",
            "Вам придёт уведомление после проверки. Спасибо!",
            "",
            `Открыть документы: ${documentsUrl}`,
          ].join("\n"),
          url: documentsUrl,
          senderName: "Система",
        });
      } else {
        await sendUserNotification({
          userId: user.id,
          type: "documents_ready",
          title: "Документы готовы для подписания",
          body: [
            "Ваши заявления о вступлении в профсоюз и перечислении членских взносов сформированы.",
            "",
            "Инструкция:",
            "1. Перейдите в личный кабинет → раздел «Документы» (или откройте анкету).",
            "2. Нажмите «Открыть для печати» — документ откроется в новой вкладке.",
            "3. Распечатайте документ (Ctrl+P / Cmd+P или кнопка печати в браузере).",
            "4. Подпишите документ от руки.",
            "5. Загрузите подписанный скан в анкете или в разделе «Документы» (кнопка «Прикрепить заявление»).",
            "",
            `Открыть документы: ${documentsUrl}`,
          ].join("\n"),
          url: documentsUrl,
          senderName: "Система",
        });
      }
    } catch (notificationError) {
      console.error("[documents/generate] ⚠️ Ошибка отправки уведомления:", notificationError);
    }

    return NextResponse.json({
      success: true,
      documents: [
        { id: membershipDoc.id, type: membershipDoc.type, title: membershipDoc.title, fileName: membershipDoc.fileName },
        { id: duesDoc.id, type: duesDoc.type, title: duesDoc.title, fileName: duesDoc.fileName },
      ],
    });
  } catch (error) {
    console.error("[documents/generate] Ошибка генерации документов:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    const isDev = process.env.NODE_ENV === "development";
    return NextResponse.json(
      {
        error: isDev ? errorMessage : "Ошибка при генерации документов. Попробуйте позже.",
        details: isDev && error instanceof Error ? error.stack : undefined,
      },
      { status: 500 }
    );
  }
}
