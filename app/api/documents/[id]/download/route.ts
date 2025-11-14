import fs from "fs/promises";
import path from "path";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

function resolveFilePath(filePath: string) {
  const normalized = filePath.startsWith("/") ? filePath.slice(1) : filePath;
  return path.join(process.cwd(), "public", normalized);
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const { id } = await Promise.resolve(context.params);

    // Получаем документ
    const document = await prisma.document.findUnique({
      where: { id },
    });

    if (!document) {
      return NextResponse.json({ error: "Документ не найден" }, { status: 404 });
    }

    // Проверяем права доступа (пользователь может скачать только свои документы)
    if (document.userId !== session.user.id && session.user.role !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "Доступ запрещен" }, { status: 403 });
    }

    let pdfBuffer: Buffer | null = null;

    if (document.content) {
      pdfBuffer = Buffer.from(document.content, "base64");
    } else if (document.filePath) {
      try {
        const absolutePath = resolveFilePath(document.filePath);
        const fileBuffer = await fs.readFile(absolutePath);
        pdfBuffer = fileBuffer;
      } catch (error) {
        console.error("[documents/download] Не удалось прочитать файл:", error);
      }
    }

    if (!pdfBuffer) {
      return NextResponse.json(
        { error: "Содержимое документа не найдено" },
        { status: 404 }
      );
    }

    const pdfBytes = new Uint8Array(pdfBuffer.length);
    pdfBytes.set(pdfBuffer);
    const arrayBuffer = pdfBytes.buffer;

    // Возвращаем PDF файл
    return new NextResponse(arrayBuffer, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${document.fileName || "document.pdf"}"`,
        "Content-Length": pdfBuffer.length.toString(),
      },
    });
  } catch (error) {
    console.error("Ошибка скачивания документа:", error);
    return NextResponse.json(
      { error: "Ошибка при скачивании документа" },
      { status: 500 }
    );
  }
}

