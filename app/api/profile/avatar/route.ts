import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get("avatar") as File;

    if (!file) {
      return NextResponse.json({ error: "Файл не найден" }, { status: 400 });
    }

    // Validate file type
    if (!file.type.startsWith("image/")) {
      return NextResponse.json({ error: "Файл должен быть изображением" }, { status: 400 });
    }

    // Validate file size (10MB max)
    const maxSize = 10 * 1024 * 1024; // 10MB
    if (file.size > maxSize) {
      return NextResponse.json(
        { error: "Размер файла не должен превышать 10MB" },
        { status: 400 }
      );
    }

    // Convert file to base64
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const base64 = buffer.toString("base64");
    const avatarUrl = `data:${file.type};base64,${base64}`;

    // Update user avatar URL in database (stored as base64 data URL)
    await prisma.user.update({
      where: { id: session.user.id },
      data: { avatarUrl },
    });

    console.log(`[avatar] ✅ Avatar uploaded for user ${session.user.id}: ${avatarUrl}`);

    return NextResponse.json({
      success: true,
      avatarUrl,
    });
  } catch (error) {
    console.error("[avatar] Error uploading avatar:", error);
    return NextResponse.json(
      { error: "Ошибка при загрузке фото" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    // Remove avatar URL from database
    await prisma.user.update({
      where: { id: session.user.id },
      data: { avatarUrl: null },
    });

    console.log(`[avatar] ✅ Avatar removed for user ${session.user.id}`);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[avatar] Error removing avatar:", error);
    return NextResponse.json(
      { error: "Ошибка при удалении фото" },
      { status: 500 }
    );
  }
}

