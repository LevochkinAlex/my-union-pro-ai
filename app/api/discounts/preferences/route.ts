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
      claimed: z.array(z.union([
        z.number(),
        z.object({
          id: z.number(),
          promoCode: z.string().nullable().optional(),
        }),
      ])).optional(),
      favorites: z.array(z.number()).optional(),
      view: z.string().optional(),
    })
    .passthrough() // Разрешаем дополнительные поля (claimed, favorites и т.д.)
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

async function updatePreferences(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const body = await request.json();
    
    // Получаем существующие preferences для мерджа
    const existingPreference = await prisma.discountPreference.findUnique({
      where: { userId: session.user.id },
    });

    const existingFilters = (existingPreference?.filters as any) || {};
    
    // Мерджим filters из запроса с существующими
    const updatedFilters = body.filters 
      ? { ...existingFilters, ...body.filters }
      : existingFilters;

    // Валидируем только pushEnabled и geolocation через схему
    const parsed = preferenceSchema.partial().safeParse({
      pushEnabled: body.pushEnabled,
      geolocation: body.geolocation,
    });

    const updateData: any = {
      filters: updatedFilters,
    };

    if (parsed.success) {
      if (parsed.data.pushEnabled !== undefined) {
        updateData.pushEnabled = parsed.data.pushEnabled;
      }
      if (parsed.data.geolocation !== undefined) {
        updateData.geolocation = parsed.data.geolocation;
      }
    } else if (body.pushEnabled !== undefined) {
      updateData.pushEnabled = body.pushEnabled;
    }

    const preference = await prisma.discountPreference.upsert({
      where: { userId: session.user.id },
      update: updateData,
      create: {
        userId: session.user.id,
        pushEnabled: updateData.pushEnabled ?? false,
        filters: updateData.filters ?? null,
        geolocation: updateData.geolocation ?? null,
      },
    });

    console.log("[api/discounts/preferences] Updated preferences:", {
      userId: session.user.id,
      filters: preference.filters,
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

export async function PUT(request: NextRequest) {
  return updatePreferences(request);
}

export async function POST(request: NextRequest) {
  return updatePreferences(request);
}

