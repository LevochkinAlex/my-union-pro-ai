import { NextRequest, NextResponse } from "next/server";
import { ensureSuperAdmin } from "@/lib/admin-auth";
import path from "path";
import fs from "fs/promises";

// Парсит строку .env файла в объект
const parseEnv = (content: string): Record<string, string> => {
  const env: Record<string, string> = {};
  const lines = content.split('\n');
  for (const line of lines) {
    const trimmedLine = line.trim();
    if (trimmedLine && !trimmedLine.startsWith('#')) {
      const parts = trimmedLine.split('=');
      const key = parts.shift();
      const value = parts.join('=');
      if (key) {
        // Убираем кавычки, если они есть
        env[key.trim()] = value.startsWith('"') && value.endsWith('"')
          ? value.slice(1, -1)
          : value.trim();
      }
    }
  }
  return env;
};

// Преобразует объект в строку .env файла
const stringifyEnv = (data: Record<string, string>): string => {
  return Object.entries(data)
    .map(([key, value]) => `${key}="${value}"`)
    .join('\n');
};

// Получает путь к файлу в зависимости от окружения
const getFilePath = (target: string) => {
  const fileName = target === 'production' ? '.env.production' : '.env.local';
  return path.join(process.cwd(), fileName);
};

// GET - получение переменных окружения
export async function GET(request: NextRequest) {
  try {
    const { error } = await ensureSuperAdmin();
    if (error) return error;

    const target = request.nextUrl.searchParams.get('target');
    if (target !== 'local' && target !== 'production') {
      return NextResponse.json({ error: 'Необходимо указать окружение (local или production)' }, { status: 400 });
    }
    
    const filePath = getFilePath(target);

    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const data = parseEnv(content);
      return NextResponse.json({ data });
    } catch (err: any) {
      if (err.code === 'ENOENT') {
        // Если файл не существует, возвращаем пустой объект
        return NextResponse.json({ data: {} });
      }
      throw err;
    }
  } catch (err) {
    console.error(`[admin/env-settings] GET Error:`, err);
    return NextResponse.json({ error: `Не удалось прочитать файл окружения` }, { status: 500 });
  }
}

// POST - обновление переменных окружения
export async function POST(request: NextRequest) {
  try {
    const { error } = await ensureSuperAdmin();
    if (error) return error;

    const target = request.nextUrl.searchParams.get('target');
    if (target !== 'local' && target !== 'production') {
      return NextResponse.json({ error: 'Необходимо указать окружение (local или production)' }, { status: 400 });
    }

    const filePath = getFilePath(target);
    const body = await request.json();
    const newData = body.data as Record<string, string>;

    if (!newData || typeof newData !== 'object') {
      return NextResponse.json({ error: 'Не предоставлены данные для сохранения' }, { status: 400 });
    }

    const content = stringifyEnv(newData);
    await fs.writeFile(filePath, content, 'utf-8');
    
    return NextResponse.json({ success: true, message: `Файл ${path.basename(filePath)} успешно обновлен.` });
  } catch (err) {
    console.error(`[admin/env-settings] POST Error:`, err);
    return NextResponse.json({ error: `Не удалось записать в файл окружения` }, { status: 500 });
  }
}
