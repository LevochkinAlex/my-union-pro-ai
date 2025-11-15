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

    // Получаем OneSignal настройки
    const appIdSetting = await prisma.systemSetting.findUnique({
      where: { key: "onesignal_app_id" },
    });

    const apiKeySetting = await prisma.systemSetting.findUnique({
      where: { key: "onesignal_rest_api_key" },
    });

    return new Response(
      JSON.stringify({
        oneSignalAppId: appIdSetting?.value,
        oneSignalRestApiKey: apiKeySetting?.value,
      }),
      { status: 200 }
    );
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
    const { oneSignalAppId, oneSignalRestApiKey } = data;

    if (oneSignalAppId) {
      await prisma.systemSetting.upsert({
        where: { key: "onesignal_app_id" },
        create: { key: "onesignal_app_id", value: oneSignalAppId },
        update: { value: oneSignalAppId },
      });
    }

    if (oneSignalRestApiKey) {
      await prisma.systemSetting.upsert({
        where: { key: "onesignal_rest_api_key" },
        create: { key: "onesignal_rest_api_key", value: oneSignalRestApiKey },
        update: { value: oneSignalRestApiKey },
      });
    }

    return new Response(
      JSON.stringify({
        success: true,
        oneSignalAppId,
        oneSignalRestApiKey,
      }),
      { status: 200 }
    );
  } catch (error) {
    console.error("[admin/settings] Error:", error);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
    });
  }
}
