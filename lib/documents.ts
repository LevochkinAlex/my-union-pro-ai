/**
 * Утилиты для документов: директория загрузок и обёртки генерации в файл (для API generate-membership/generate-contributions и скриптов).
 * Генерация PDF из шаблонов выполняется через lib/document-templates/renderer и lib/document-generation.
 */

import { User, Organization } from "@prisma/client";
import fs from "fs/promises";
import path from "path";
import { prisma } from "@/lib/prisma";
import { getDefaultMembershipTemplates } from "@/lib/document-generation";
import { generateDocumentFromTemplate } from "@/lib/document-templates/renderer";

const DOCUMENTS_DIR = path.join(process.cwd(), "public", "uploads", "documents");

export async function ensureDocumentsDir() {
  try {
    await fs.mkdir(DOCUMENTS_DIR, { recursive: true });
  } catch (error) {
    console.error("[documents] Ошибка создания директории:", error);
  }
}

/**
 * Генерирует заявление о вступлении в PDF и сохраняет в public/uploads/documents.
 * Использует шаблон по умолчанию из БД (DocumentTemplate). Для анкеты используйте POST /api/documents/generate.
 * @returns относительный путь к файлу, например /uploads/documents/membership_xxx.pdf
 */
export async function generateMembershipApplication(
  user: User & { organization?: Organization | null },
  _ppoChairman?: string
): Promise<string> {
  await ensureDocumentsDir();
  const templates = await getDefaultMembershipTemplates(prisma);
  if (!templates) {
    throw new Error("Шаблон заявления о вступлении не настроен. Настройте шаблон в админке (Конструктор документов).");
  }
  const pdfBuffer = await generateDocumentFromTemplate(templates.membershipTemplate, user);
  const fileName = `membership_${user.id}_${Date.now()}.pdf`;
  const filePath = path.join(DOCUMENTS_DIR, fileName);
  await fs.writeFile(filePath, pdfBuffer);
  return `/uploads/documents/${fileName}`;
}

/**
 * Генерирует заявление о взносах в PDF и сохраняет в public/uploads/documents.
 * Использует шаблон по умолчанию из БД. Для анкеты используйте POST /api/documents/generate.
 * @returns относительный путь к файлу
 */
export async function generateContributionsApplication(
  user: User & { organization?: Organization | null },
  _employerName?: string,
  _employerFullName?: string
): Promise<string> {
  await ensureDocumentsDir();
  const templates = await getDefaultMembershipTemplates(prisma);
  if (!templates) {
    throw new Error("Шаблон заявления о взносах не настроен. Настройте шаблон в админке (Конструктор документов).");
  }
  const pdfBuffer = await generateDocumentFromTemplate(templates.duesTemplate, user);
  const fileName = `contributions_${user.id}_${Date.now()}.pdf`;
  const filePath = path.join(DOCUMENTS_DIR, fileName);
  await fs.writeFile(filePath, pdfBuffer);
  return `/uploads/documents/${fileName}`;
}
