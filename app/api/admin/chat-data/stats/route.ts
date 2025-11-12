import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

function ensureSuperAdmin(session: any): NextResponse | null {
  const user = (session as any)?.user;
  if (!user?.id || !user?.role) {
    return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  }

  if (user.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Недостаточно прав" }, { status: 403 });
  }

  return null;
}

export async function GET() {
  const session = await auth();
  const errorResponse = ensureSuperAdmin(session);
  if (errorResponse) {
    return errorResponse;
  }

  const [count, latestSample] = await Promise.all([
    prisma.aiTrainingSample.count(),
    prisma.aiTrainingSample.findFirst({
      orderBy: { createdAt: "desc" },
      select: {
        createdAt: true,
        sourceFileName: true,
        uploadedBy: {
          select: {
            email: true,
          },
        },
      },
    }),
  ]);

  return NextResponse.json({
    count,
    latestUpload: latestSample
      ? {
          createdAt: latestSample.createdAt,
          sourceFileName: latestSample.sourceFileName,
          uploadedBy: latestSample.uploadedBy?.email ?? null,
        }
      : null,
  });
}
