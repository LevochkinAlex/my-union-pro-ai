import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { existsSync } from "fs";

const UPLOAD_DIR = path.join(process.cwd(), "public", "uploads", "avatars");

async function ensureUploadDir() {
  if (!existsSync(UPLOAD_DIR)) {
    await mkdir(UPLOAD_DIR, { recursive: true });
  }
}

/**
 * Загрузка аватара пользователя
 * POST /api/profile/avatar
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const formData = await request.formData();
    const avatarFile = formData.get("avatar") as File | null;

    if (!avatarFile) {
      return NextResponse.json({ error: "Файл не предоставлен" }, { status: 400 });
    }

    // Проверяем тип файла
    if (!avatarFile.type.startsWith("image/")) {
      return NextResponse.json({ error: "Файл должен быть изображением" }, { status: 400 });
    }

    // Проверяем размер файла (максимум 10MB)
    const MAX_FILE_SIZE = 10 * 1024 * 1024;
    if (avatarFile.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: `Размер файла не должен превышать ${MAX_FILE_SIZE / 1024 / 1024}MB` },
        { status: 400 }
      );
    }

    await ensureUploadDir();

    // Генерируем имя файла
    const fileExtension = avatarFile.name.split(".").pop() || "jpg";
    const filename = `${session.user.id}_${Date.now()}.${fileExtension}`;
    const filePath = path.join(UPLOAD_DIR, filename);

    // Сохраняем файл
    const bytes = await avatarFile.arrayBuffer();
    const buffer = Buffer.from(bytes);
    await writeFile(filePath, buffer);

    // Обновляем URL аватара в базе данных
    const avatarUrl = `/api/uploads/avatars/${filename}`;
    
    await prisma.user.update({
      where: { id: session.user.id },
      data: { avatarUrl },
    });

    console.log("[profile/avatar] Avatar uploaded successfully:", {
      userId: session.user.id,
      filename,
      size: avatarFile.size,
    });

    return NextResponse.json({
      success: true,
      avatarUrl,
    });
  } catch (error) {
    console.error("[profile/avatar] Error:", error);
    return NextResponse.json(
      { error: "Не удалось загрузить аватар" },
      { status: 500 }
    );
  }
}
