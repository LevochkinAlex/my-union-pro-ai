import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getQueueStats, getJobStatus, clearFailedJobs } from "@/lib/queue";

/**
 * Get queue statistics and status
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    // Only admins can view queue stats
    if (session?.user?.role !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const stats = await getQueueStats();

    return NextResponse.json({
      success: true,
      stats,
    });
  } catch (error) {
    console.error("[queue-status] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * Clear failed jobs
 */
export async function DELETE(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    // Only admins can clear jobs
    if (session?.user?.role !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await clearFailedJobs();

    return NextResponse.json({
      success: true,
      message: "Failed jobs cleared",
    });
  } catch (error) {
    console.error("[queue-status] Error clearing jobs:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

