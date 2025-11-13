import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/appeals - Retrieve user's appeals
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    // Get user's appeals
    const appeals = await prisma.userAppeal.findMany({
      where: {
        userId: session.user.id,
      },
      include: {
        messages: {
          select: {
            id: true,
            content: true,
            createdAt: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    return NextResponse.json({
      success: true,
      appeals: appeals.map((appeal) => ({
        id: appeal.id,
        type: appeal.type,
        status: appeal.status,
        title: appeal.title,
        description: appeal.description,
        createdAt: appeal.createdAt,
        updatedAt: appeal.updatedAt,
        messageCount: appeal.messages.length,
        lastMessage: appeal.messages[0]?.createdAt || null,
      })),
    });
  } catch (error) {
    console.error("Error retrieving appeals:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/appeals - Create a new appeal
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const { type, title, description } = await request.json();

    if (!type || !title) {
      return NextResponse.json(
        { error: "Type and title are required" },
        { status: 400 }
      );
    }

    // Create new appeal
    const appeal = await prisma.userAppeal.create({
      data: {
        userId: session.user.id,
        type,
        status: "PENDING",
        title,
        description: description || "",
      },
    });

    return NextResponse.json({
      success: true,
      appeal: {
        id: appeal.id,
        type: appeal.type,
        status: appeal.status,
        title: appeal.title,
        description: appeal.description,
        createdAt: appeal.createdAt,
        updatedAt: appeal.updatedAt,
      },
    });
  } catch (error) {
    console.error("Error creating appeal:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/appeals - Update appeal status
 */
export async function PATCH(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const { appealId, status } = await request.json();

    if (!appealId || !status) {
      return NextResponse.json(
        { error: "Appeal ID and status are required" },
        { status: 400 }
      );
    }

    // Verify ownership
    const appeal = await prisma.userAppeal.findUnique({
      where: { id: appealId },
    });

    if (!appeal || appeal.userId !== session.user.id) {
      return NextResponse.json(
        { error: "Appeal not found or unauthorized" },
        { status: 404 }
      );
    }

    // Update appeal status
    const updated = await prisma.userAppeal.update({
      where: { id: appealId },
      data: { status },
    });

    return NextResponse.json({
      success: true,
      appeal: updated,
    });
  } catch (error) {
    console.error("Error updating appeal:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

