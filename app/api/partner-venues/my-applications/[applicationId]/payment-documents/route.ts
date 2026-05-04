import { NextRequest, NextResponse } from "next/server";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  partnerApplicationPaymentUploadDir,
  partnerApplicationPaymentViewUrl,
} from "@/lib/partner-application-payment-upload";

export const dynamic = "force-dynamic";

const MAX_FILES = 10;
const MAX_BYTES_PER_FILE = 20 * 1024 * 1024; // 20 MB

function safeBasename(name: string): string {
  const base = path.basename(name).replace(/[^\w.\-()\s\u0400-\u04FF]+/g, "_");
  return base.slice(0, 180) || "file";
}

/**
 * GET — список отправленных документов об оплате (участник-заявитель).
 */
export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ applicationId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const { applicationId } = await context.params;
    const aid = applicationId?.trim();
    if (!aid) {
      return NextResponse.json({ error: "Некорректные параметры" }, { status: 400 });
    }

    const application = await prisma.partnerVenueApplication.findFirst({
      where: { id: aid, applicantUserId: session.user.id },
      select: {
        id: true,
        paymentDocuments: {
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            storedFileName: true,
            originalFileName: true,
            createdAt: true,
          },
        },
      },
    });
    if (!application) {
      return NextResponse.json({ error: "Заявка не найдена" }, { status: 404 });
    }

    const documents = application.paymentDocuments.map((d) => ({
      id: d.id,
      originalFileName: d.originalFileName,
      storedFileName: d.storedFileName,
      createdAt: d.createdAt.toISOString(),
      viewUrl: partnerApplicationPaymentViewUrl(application.id, d.storedFileName),
    }));

    return NextResponse.json({ documents });
  } catch (e) {
    console.error("[GET partner-venues/my-applications/.../payment-documents]", e);
    return NextResponse.json({ error: "Не удалось загрузить список" }, { status: 500 });
  }
}

/**
 * POST multipart: поле "files" (повторяющееся) — документы об оплате по заявке участника.
 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ applicationId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const { applicationId } = await context.params;
    const aid = applicationId?.trim();
    if (!aid) {
      return NextResponse.json({ error: "Некорректные параметры" }, { status: 400 });
    }

    const application = await prisma.partnerVenueApplication.findFirst({
      where: { id: aid, applicantUserId: session.user.id },
      select: { id: true, status: true },
    });
    if (!application) {
      return NextResponse.json({ error: "Заявка не найдена" }, { status: 404 });
    }
    if (application.status !== "NEW" && application.status !== "IN_PROGRESS") {
      return NextResponse.json(
        { error: "Отправить документ можно только по заявке в статусе «Новая» или «В работе»" },
        { status: 400 }
      );
    }

    const formData = await request.formData();
    const entries = formData.getAll("files");
    const files = entries.filter((e): e is File => e instanceof File && e.size > 0);
    if (files.length === 0) {
      return NextResponse.json({ error: "Добавьте хотя бы один файл" }, { status: 400 });
    }
    if (files.length > MAX_FILES) {
      return NextResponse.json({ error: `Не более ${MAX_FILES} файлов за раз` }, { status: 400 });
    }
    for (const f of files) {
      if (f.size > MAX_BYTES_PER_FILE) {
        return NextResponse.json(
          { error: `Файл «${f.name}» слишком большой (макс. ${MAX_BYTES_PER_FILE / 1024 / 1024} МБ)` },
          { status: 400 }
        );
      }
    }

    const dir = partnerApplicationPaymentUploadDir(aid);
    await mkdir(dir, { recursive: true });

    const created: Array<{
      id: string;
      originalFileName: string;
      storedFileName: string;
      createdAt: string;
      viewUrl: string;
    }> = [];

    for (const file of files) {
      const buf = Buffer.from(await file.arrayBuffer());
      const storedFileName = `${Date.now()}_${safeBasename(file.name)}`;
      const full = path.join(dir, storedFileName);
      await writeFile(full, buf);

      const row = await prisma.partnerVenueApplicationPaymentDocument.create({
        data: {
          partnerVenueApplicationId: aid,
          storedFileName,
          originalFileName: file.name || storedFileName,
          mimeType: file.type || null,
          sizeBytes: file.size,
        },
        select: {
          id: true,
          storedFileName: true,
          originalFileName: true,
          createdAt: true,
        },
      });

      created.push({
        id: row.id,
        originalFileName: row.originalFileName,
        storedFileName: row.storedFileName,
        createdAt: row.createdAt.toISOString(),
        viewUrl: partnerApplicationPaymentViewUrl(aid, row.storedFileName),
      });
    }

    return NextResponse.json({
      ok: true,
      count: created.length,
      documents: created,
    });
  } catch (e) {
    console.error("[POST partner-venues/my-applications/.../payment-documents]", e);
    const detail = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      {
        error: "Не удалось сохранить файлы",
        ...(process.env.NODE_ENV === "development" ? { detail } : {}),
      },
      { status: 500 }
    );
  }
}
