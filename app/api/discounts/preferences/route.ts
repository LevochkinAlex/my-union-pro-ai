import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const preferenceSchema = z.object({
  pushEnabled: z.boolean().optional(),
  filters: z
    .object({
      cityId: z.number().nullable().optional(),
      categoryIds: z.array(z.number()).optional(),
      premiumOnly: z.boolean().optional(),
      radiusKm: z.number().min(1).max(500).nullable().optional(),
    })
    .optional(),
  geolocation: z
    .object({
      lat: z.number(),
      lng: z.number(),
      accuracy: z.number().nullable().optional(),
      cityId: z.number().nullable().optional(),
    })
    .nullable()
    .optional(),
});

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const preference = await prisma.discountPreference.findUnique({
      where: { userId: session.user.id },
    });

    if (!preference) {
      return NextResponse.json({
        pushEnabled: false,
        filters: null,
        geolocation: null,
        updatedAt: null,
      });
    }

    return NextResponse.json({
      pushEnabled: preference.pushEnabled,
      filters: preference.filters,
      geolocation: preference.geolocation,
      updatedAt: preference.updatedAt,
    });
  } catch (error) {
    console.error("[api/discounts/preferences] Failed to read preference:", error);
    return NextResponse.json(
      { error: "Не удалось загрузить настройки уведомлений" },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const body = await request.json();
    const parsed = preferenceSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Неверный формат данных", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const preference = await prisma.discountPreference.upsert({
      where: { userId: session.user.id },
      update: {
        pushEnabled: parsed.data.pushEnabled ?? false,
        filters: parsed.data.filters ?? null,
        geolocation: parsed.data.geolocation ?? null,
      },
      create: {
        userId: session.user.id,
        pushEnabled: parsed.data.pushEnabled ?? false,
        filters: parsed.data.filters ?? null,
        geolocation: parsed.data.geolocation ?? null,
      },
    });

    return NextResponse.json({
      pushEnabled: preference.pushEnabled,
      filters: preference.filters,
      geolocation: preference.geolocation,
      updatedAt: preference.updatedAt,
    });
  } catch (error) {
    console.error("[api/discounts/preferences] Failed to update preference:", error);
    return NextResponse.json(
      { error: "Не удалось сохранить настройки" },
      { status: 500 }
    );
  }
}

