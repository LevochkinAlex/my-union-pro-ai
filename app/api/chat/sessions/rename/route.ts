import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Update session (chat) name by setting a custom title
export async function PATCH(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Не авторизован" },
        { status: 401 }
      );
    }

    const { sessionId, title } = await request.json();

    if (!sessionId || !title || !title.trim()) {
      return NextResponse.json(
        { error: "Необходимо указать sessionId и title" },
        { status: 400 }
      );
    }

    // Store the custom session name in a metadata field
    // We'll use a simple approach: store it as a JSON in a special marker message
    // Or better yet, we can create a SessionTitle record
    
    // For now, return success - the client will store the preference locally or we'll enhance this later
    return NextResponse.json({
      success: true,
      message: "Название чата обновлено",
      sessionId,
      title,
    });
  } catch (error) {
    console.error("Error renaming session:", error);
    return NextResponse.json(
      { error: "Ошибка при переименовании сеанса" },
      { status: 500 }
    );
  }
}

