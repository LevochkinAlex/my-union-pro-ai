import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * DEBUG ENDPOINT - Fill user profile with test data
 * Only for development/testing purposes
 */
export async function POST(request: NextRequest) {
  // Check if we're in development mode
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json(
      { error: "This endpoint is only available in development mode" },
      { status: 403 }
    );
  }

  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    // Fill profile with test data
    const updatedUser = await prisma.user.update({
      where: { id: session.user.id },
      data: {
        firstName: "Иван",
        lastName: "Иванов",
        middleName: "Иванович",
        dateOfBirth: new Date("1985-03-15"),
        phone: "+7 (800) 555-35-35",
        address: "ул. Пушкина, д. 10, кв. 42, г. Москва",
        jobTitle: "Инженер",
        profession: "Инженер-программист",
        education: "Высшее (бакалавриат)",
      },
    });

    return NextResponse.json({
      success: true,
      message: "Profile filled with test data",
      user: updatedUser,
    });
  } catch (error) {
    console.error("Error filling profile:", error);
    return NextResponse.json(
      { error: "Failed to fill profile" },
      { status: 500 }
    );
  }
}

