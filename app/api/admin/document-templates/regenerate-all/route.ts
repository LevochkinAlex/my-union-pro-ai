import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { generateDocumentFromTemplate } from "@/lib/document-templates/renderer";
import { DocumentType } from "@prisma/client";

/**
 * POST /api/admin/document-templates/regenerate-all
 * Перегенерировать все документы всех пользователей из текущих шаблонов
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    // Проверяем права доступа (только SUPER_ADMIN)
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { role: true },
    });

    if (user?.role !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "Доступ запрещен" }, { status: 403 });
    }

    console.log("[admin/document-templates/regenerate-all] Начало перегенерации всех документов...");

    // Получаем все активные шаблоны по умолчанию
    const templates = await prisma.documentTemplate.findMany({
      where: {
        isActive: true,
        isDefault: true,
      },
    });

    if (templates.length === 0) {
      return NextResponse.json(
        { error: "Нет активных шаблонов по умолчанию" },
        { status: 400 }
      );
    }

    console.log(`[admin/document-templates/regenerate-all] Найдено шаблонов: ${templates.length}`);

    // Получаем всех пользователей с заполненными профилями
    const users = await prisma.user.findMany({
      where: {
        firstName: { not: null },
        lastName: { not: null },
        dateOfBirth: { not: null },
        address: { not: null },
        phone: { not: null },
        jobTitle: { not: null },
        profession: { not: null },
        education: { not: null },
      },
      include: {
        organization: true,
      },
    });

    console.log(`[admin/document-templates/regenerate-all] Найдено пользователей для перегенерации: ${users.length}`);

    let totalRegenerated = 0;
    let totalErrors = 0;
    const errors: Array<{ userId: string; email: string; error: string }> = [];

    // Перегенерируем документы для каждого пользователя
    for (const user of users) {
      try {
        // Для каждого типа документа находим соответствующий шаблон
        for (const template of templates) {
          try {
            // Генерируем PDF из шаблона
            const pdfBuffer = await generateDocumentFromTemplate(template, user);

            // Находим существующий документ этого типа у пользователя
            const existingDoc = await prisma.document.findFirst({
              where: {
                userId: user.id,
                type: template.type,
              },
              orderBy: {
                createdAt: "desc",
              },
            });

            if (existingDoc) {
              // Обновляем существующий документ
              await prisma.document.update({
                where: { id: existingDoc.id },
                data: {
                  content: pdfBuffer.toString("base64"),
                  fileSize: pdfBuffer.length,
                  fileName: `${template.type.toLowerCase()}_${user.id}_${Date.now()}.pdf`,
                  updatedAt: new Date(),
                  templateId: template.id,
                },
              });
              console.log(`[admin/document-templates/regenerate-all] Обновлен документ ${template.type} для пользователя ${user.email}`);
            } else {
              // Создаем новый документ
              await prisma.document.create({
                data: {
                  userId: user.id,
                  organizationId: user.organizationId,
                  type: template.type,
                  status: "GENERATED",
                  title: template.name,
                  description: template.description || `Документ типа ${template.type}`,
                  fileName: `${template.type.toLowerCase()}_${user.id}_${Date.now()}.pdf`,
                  fileSize: pdfBuffer.length,
                  mimeType: "application/pdf",
                  content: pdfBuffer.toString("base64"),
                  templateId: template.id,
                },
              });
              console.log(`[admin/document-templates/regenerate-all] Создан новый документ ${template.type} для пользователя ${user.email}`);
            }

            totalRegenerated++;
          } catch (templateError) {
            console.error(`[admin/document-templates/regenerate-all] Ошибка генерации ${template.type} для ${user.email}:`, templateError);
            totalErrors++;
            errors.push({
              userId: user.id,
              email: user.email || "N/A",
              error: `Ошибка генерации ${template.type}: ${templateError instanceof Error ? templateError.message : String(templateError)}`,
            });
          }
        }
      } catch (userError) {
        console.error(`[admin/document-templates/regenerate-all] Ошибка обработки пользователя ${user.email}:`, userError);
        totalErrors++;
        errors.push({
          userId: user.id,
          email: user.email || "N/A",
          error: `Ошибка обработки пользователя: ${userError instanceof Error ? userError.message : String(userError)}`,
        });
      }
    }

    console.log(`[admin/document-templates/regenerate-all] Завершено. Перегенерировано: ${totalRegenerated}, Ошибок: ${totalErrors}`);

    return NextResponse.json({
      success: true,
      message: `Перегенерация завершена. Обработано документов: ${totalRegenerated}, ошибок: ${totalErrors}`,
      stats: {
        usersProcessed: users.length,
        documentsRegenerated: totalRegenerated,
        errors: totalErrors,
      },
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    console.error("[admin/document-templates/regenerate-all] Критическая ошибка:", error);
    return NextResponse.json(
      {
        error: "Ошибка при перегенерации документов",
        details: process.env.NODE_ENV === "development" ? (error instanceof Error ? error.message : String(error)) : undefined,
      },
      { status: 500 }
    );
  }
}

