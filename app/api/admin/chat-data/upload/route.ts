import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { parse } from "csv-parse/sync";

type TrainingRow = {
  question: string;
  answer: string;
  category?: string | null;
};

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

function normalizeRow(row: TrainingRow): TrainingRow | null {
  const question = row.question?.toString().trim();
  const answer = row.answer?.toString().trim();
  const category = row.category?.toString().trim() || null;

  if (!question || !answer) {
    return null;
  }

  return { question, answer, category };
}

function parseCsv(buffer: Buffer): TrainingRow[] {
  const records = parse(buffer, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  }) as Array<Record<string, string>>;

  return records
    .map((record) => {
      const entries = Object.fromEntries(
        Object.entries(record).map(([key, value]) => [key.toLowerCase(), value]),
      ) as Record<string, string>;

      return normalizeRow({
        question: entries.question ?? entries.q ?? "",
        answer: entries.answer ?? entries.a ?? "",
        category: entries.category ?? entries.tags ?? entries.topic ?? null,
      });
    })
    .filter((row): row is TrainingRow => row !== null);
}

function parseJson(text: string): TrainingRow[] {
  let payload: unknown;

  try {
    payload = JSON.parse(text);
  } catch (error) {
    throw new Error("Некорректный JSON файл");
  }

  if (!Array.isArray(payload)) {
    throw new Error("JSON должен содержать массив объектов");
  }

  return payload
    .map((item) => {
      if (typeof item !== "object" || item === null) {
        return null;
      }

      const record = item as Record<string, unknown>;

      return normalizeRow({
        question: (record.question as string) ?? (record.q as string) ?? "",
        answer: (record.answer as string) ?? (record.a as string) ?? "",
        category: (record.category as string) ?? (record.tags as string) ?? (record.topic as string) ?? null,
      });
    })
    .filter((row): row is TrainingRow => row !== null);
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  const errorResponse = ensureSuperAdmin(session);
  if (errorResponse) {
    return errorResponse;
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch (error) {
    console.error("[admin/chat-data] Не удалось прочитать formData", error);
    return NextResponse.json(
      { error: "Не удалось прочитать файл" },
      { status: 400 },
    );
  }

  const fileEntry = formData.get("file");

  if (!fileEntry || typeof fileEntry === "string") {
    return NextResponse.json(
      { error: "Файл обязателен" },
      { status: 400 },
    );
  }

  const file = fileEntry as File;

  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const fileName = file.name || "dataset";
  const extension = fileName.split(".").pop()?.toLowerCase();

  let rows: TrainingRow[] = [];

  try {
    if (extension === "json" || file.type === "application/json") {
      rows = parseJson(buffer.toString("utf-8"));
    } else {
      rows = parseCsv(buffer);
    }
  } catch (error) {
    console.error("[admin/chat-data] Ошибка парсинга", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Не удалось обработать файл",
      },
      { status: 400 },
    );
  }

  if (rows.length === 0) {
    return NextResponse.json(
      { error: "Не найдено ни одной строки с данными" },
      { status: 400 },
    );
  }

  try {
    const result = await prisma.aiTrainingSample.createMany({
      data: rows.map((row) => ({
        question: row.question,
        answer: row.answer,
        category: row.category,
        sourceFileName: fileName,
        uploadedByUserId: session!.user!.id,
      })),
      skipDuplicates: false,
    });

    return NextResponse.json({
      success: true,
      count: result.count,
      fileName,
    });
  } catch (error) {
    console.error("[admin/chat-data] Ошибка сохранения", error);
    return NextResponse.json(
      { error: "Не удалось сохранить данные" },
      { status: 500 },
    );
  }
}


