import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { AppealType } from "@prisma/client";

/**
 * Save analytics for Appeal Bot questions
 * Called after user submits a question to Appeal Bot
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Не авторизован" },
        { status: 401 }
      );
    }

    const { appealType, question, keywords, resolutionTime } = await request.json();

    if (!appealType || !question) {
      return NextResponse.json(
        { error: "Appeal type and question are required" },
        { status: 400 }
      );
    }

    // Create or get today's analytics record
    const now = new Date();
    const periodStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const periodEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);

    let analytics = await prisma.appealAnalytics.findFirst({
      where: {
        appealType: appealType as AppealType,
        periodStart: { gte: periodStart, lt: periodEnd },
      },
    });

    if (!analytics) {
      // Create new analytics record for today
      analytics = await prisma.appealAnalytics.create({
        data: {
          appealType: appealType as AppealType,
          totalCount: 0,
          resolvedCount: 0,
          periodStart,
          periodEnd,
        },
      });
    }

    // Extract keywords from question (simple word extraction)
    let extractedKeywords: string[] = [];
    if (keywords && Array.isArray(keywords)) {
      extractedKeywords = keywords;
    } else if (typeof keywords === "string") {
      extractedKeywords = keywords
        .split(/\s+/)
        .filter((word) => word.length > 3)
        .slice(0, 5);
    } else {
      // Auto-extract keywords from question
      extractedKeywords = question
        .split(/\s+/)
        .filter((word) => word.length > 4)
        .slice(0, 5);
    }

    // Update analytics
    const updatedAnalytics = await prisma.appealAnalytics.update({
      where: { id: analytics.id },
      data: {
        totalCount: { increment: 1 },
        ...(resolutionTime && {
          averageResolutionTime: (
            ((analytics.averageResolutionTime || 0) * analytics.totalCount + resolutionTime) /
            (analytics.totalCount + 1)
          ),
        }),
        commonKeywords: extractedKeywords.length > 0
          ? JSON.stringify([
              ...new Set([
                ...(analytics.commonKeywords
                  ? JSON.parse(analytics.commonKeywords)
                  : []),
                ...extractedKeywords,
              ]),
            ].slice(0, 10))
          : analytics.commonKeywords,
      },
    });

    console.log("[analytics] Appeal recorded:", {
      appealType,
      userId: session.user.id,
      keywords: extractedKeywords,
    });

    return NextResponse.json({
      success: true,
      analytics: updatedAnalytics,
    });
  } catch (error) {
    console.error("[analytics] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * Get analytics for a specific appeal type
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    // Only admins can view analytics
    if (session?.user?.role !== "SUPER_ADMIN" && session?.user?.role !== "ADMIN") {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const searchParams = request.nextUrl.searchParams;
    const appealType = searchParams.get("type");
    const days = parseInt(searchParams.get("days") || "7");

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const query: any = {
      periodStart: { gte: startDate },
    };

    if (appealType) {
      query.appealType = appealType;
    }

    const analytics = await prisma.appealAnalytics.findMany({
      where: query,
      orderBy: { periodStart: "desc" },
    });

    // Aggregate statistics
    const aggregated = {
      totalQuestions: analytics.reduce((sum, a) => sum + a.totalCount, 0),
      totalResolved: analytics.reduce((sum, a) => sum + a.resolvedCount, 0),
      averageResolutionTime:
        analytics.reduce((sum, a) => sum + (a.averageResolutionTime || 0), 0) /
        Math.max(analytics.length, 1),
      byType: Object.groupBy(analytics, (a) => a.appealType),
      commonKeywords: Array.from(
        new Set(
          analytics
            .flatMap((a) =>
              a.commonKeywords ? JSON.parse(a.commonKeywords) : []
            )
            .slice(0, 20)
        )
      ),
    };

    return NextResponse.json({
      success: true,
      analytics: aggregated,
      records: analytics,
    });
  } catch (error) {
    console.error("[analytics/GET] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

