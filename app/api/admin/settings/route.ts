import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { UserRole } from "@prisma/client";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);

    // Только суперадмин может получать настройки
    if (session?.user?.role !== UserRole.SUPER_ADMIN) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
      });
    }

    const settings = await prisma.systemSetting.findUnique({
      where: { id: "system_settings" },
    });

    if (!settings) {
      // Создаём default settings если их нет
      const created = await prisma.systemSetting.create({
        data: { id: "system_settings" },
      });
      return new Response(JSON.stringify(created), { status: 200 });
    }

    return new Response(JSON.stringify(settings), { status: 200 });
  } catch (error) {
    console.error("[admin/settings] Error:", error);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
    });
  }
}

export async function PUT(request: Request) {
  try {
    const session = await getServerSession(authOptions);

    // Только суперадмин может обновлять настройки
    if (session?.user?.role !== UserRole.SUPER_ADMIN) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
      });
    }

    const data = await request.json();

    const updated = await prisma.systemSetting.upsert({
      where: { id: "system_settings" },
      create: { id: "system_settings", ...data },
      update: data,
    });

    return new Response(JSON.stringify(updated), { status: 200 });
  } catch (error) {
    console.error("[admin/settings] Error:", error);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
    });
  }
}
