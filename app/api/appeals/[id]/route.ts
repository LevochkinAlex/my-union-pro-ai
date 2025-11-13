import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * DELETE /api/appeals/[id] - Delete an appeal
 */
export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const { id } = await context.params;

    // Verify ownership
    const appeal = await prisma.userAppeal.findUnique({
      where: { id },
    });

    if (!appeal || appeal.userId !== session.user.id) {
      return NextResponse.json(
        { error: "Appeal not found or unauthorized" },
        { status: 404 }
      );
    }

    // Delete appeal and its associated messages
    await prisma.userAppeal.delete({
      where: { id },
    });

    return NextResponse.json({
      success: true,
      message: "Appeal deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting appeal:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

