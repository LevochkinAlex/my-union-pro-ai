/**
 * Единая точка генерации заявлений для вступления в профсоюз.
 * Использует шаблоны из БД (DocumentTemplate) и рендерер (document-templates/renderer).
 * Все пути генерации (анкета, админка, скрипты) должны сходиться сюда.
 */

import { DocumentType, DocumentTemplate, User, Organization, PrismaClient } from "@prisma/client";
import { generateDocumentFromTemplate } from "@/lib/document-templates/renderer";

export type UserWithOrg = User & { organization?: Organization | null };

/** Результат проверки профиля для генерации документов */
export interface ValidateMembershipDocumentsResult {
  ok: boolean;
  missingFields?: string[];
}

/**
 * Проверяет, что у пользователя заполнены все поля, нужные для генерации заявлений.
 */
export function validateUserForMembershipDocuments(user: UserWithOrg): ValidateMembershipDocumentsResult {
  const missingFields: string[] = [];
  const hasOrganization = user.organizationId || user.organizationName || user.organization;

  if (!user.firstName) missingFields.push("Имя");
  if (!user.lastName) missingFields.push("Фамилия");
  if (!user.dateOfBirth) missingFields.push("Дата рождения");
  if (!user.address) missingFields.push("Адрес");
  if (!user.phone) missingFields.push("Телефон");
  if (!user.jobTitle) missingFields.push("Должность");
  if (!user.workplace) missingFields.push("Место работы");
  if (!hasOrganization) missingFields.push("Организация профсоюза");

  return {
    ok: missingFields.length === 0,
    missingFields: missingFields.length > 0 ? missingFields : undefined,
  };
}

/**
 * Возвращает шаблоны по умолчанию для заявления о вступлении и заявления о взносах.
 */
export async function getDefaultMembershipTemplates(prisma: PrismaClient): Promise<{
  membershipTemplate: DocumentTemplate;
  duesTemplate: DocumentTemplate;
} | null> {
  const [membershipTemplate, duesTemplate] = await Promise.all([
    prisma.documentTemplate.findFirst({
      where: {
        type: DocumentType.MEMBERSHIP_APPLICATION,
        isActive: true,
        isDefault: true,
      },
    }),
    prisma.documentTemplate.findFirst({
      where: {
        type: DocumentType.CONTRIBUTION_APPLICATION,
        isActive: true,
        isDefault: true,
      },
    }),
  ]);

  if (!membershipTemplate || !duesTemplate) return null;
  return { membershipTemplate, duesTemplate };
}

/**
 * Генерирует PDF заявления о вступлении и заявления о взносах из шаблонов.
 */
export async function generateMembershipAndContributionPDFs(
  user: UserWithOrg,
  membershipTemplate: DocumentTemplate,
  duesTemplate: DocumentTemplate
): Promise<{ membershipPdf: Buffer; duesPdf: Buffer }> {
  const [membershipPdf, duesPdf] = await Promise.all([
    generateDocumentFromTemplate(membershipTemplate, user),
    generateDocumentFromTemplate(duesTemplate, user),
  ]);
  return { membershipPdf, duesPdf };
}

/** Метаданные созданного/обновлённого документа для ответа API */
export interface SavedDocumentMeta {
  id: string;
  type: string;
  title: string | null;
  fileName: string | null;
}

/**
 * Сохраняет сгенерированные PDF в БД: обновляет существующие записи или создаёт новые.
 * Удаляет старые черновики/сгенерированные того же типа; не трогает подписанные и документы в workflow.
 */
export async function saveGeneratedMembershipDocumentsToDb(
  prisma: PrismaClient,
  user: UserWithOrg,
  membershipPdf: Buffer,
  duesPdf: Buffer,
  membershipTemplate: DocumentTemplate,
  duesTemplate: DocumentTemplate
): Promise<{ membershipDoc: { id: string; type: string; title: string | null; fileName: string | null }; duesDoc: { id: string; type: string; title: string | null; fileName: string | null } }> {
  const existingDocs = await prisma.document.findMany({
    where: {
      userId: user.id,
      type: { in: [DocumentType.MEMBERSHIP_APPLICATION, DocumentType.CONTRIBUTION_APPLICATION] },
    },
  });

  const existingMembership = existingDocs.find((d) => d.type === DocumentType.MEMBERSHIP_APPLICATION);
  const existingDues = existingDocs.find((d) => d.type === DocumentType.CONTRIBUTION_APPLICATION);

  const docsToDelete = existingDocs.filter((doc) => {
    if (existingMembership && doc.id === existingMembership.id) return false;
    if (existingDues && doc.id === existingDues.id) return false;
    if (["PENDING_REVIEW", "PENDING_APPROVAL", "PENDING_SIGNATURE", "COMPLETED"].includes(doc.status)) return false;
    if (doc.status === "SIGNED" && doc.signedFilePath) return false;
    return doc.status === "GENERATED" || doc.status === "DRAFT";
  });

  if (docsToDelete.length > 0) {
    await prisma.document.deleteMany({
      where: { id: { in: docsToDelete.map((d) => d.id) } },
    });
  }

  const now = Date.now();

  const membershipDoc = existingMembership
    ? await prisma.document.update({
        where: { id: existingMembership.id },
        data: {
          status: "GENERATED",
          title: "Заявление о вступлении в профсоюз",
          description: `Заявление о вступлении в МООП РЗ от ${user.lastName} ${user.firstName}`,
          fileName: `membership_application_${user.id}_${now}.pdf`,
          fileSize: membershipPdf.length,
          mimeType: "application/pdf",
          content: membershipPdf.toString("base64"),
          templateId: membershipTemplate.id,
          signedFilePath: null,
          driveFileId: null,
          driveUrl: null,
        },
      })
    : await prisma.document.create({
        data: {
          userId: user.id,
          organizationId: user.organizationId,
          type: DocumentType.MEMBERSHIP_APPLICATION,
          status: "GENERATED",
          title: "Заявление о вступлении в профсоюз",
          description: `Заявление о вступлении в МООП РЗ от ${user.lastName} ${user.firstName}`,
          fileName: `membership_application_${user.id}_${now}.pdf`,
          fileSize: membershipPdf.length,
          mimeType: "application/pdf",
          content: membershipPdf.toString("base64"),
          templateId: membershipTemplate.id,
        },
      });

  const duesDoc = existingDues
    ? await prisma.document.update({
        where: { id: existingDues.id },
        data: {
          status: "GENERATED",
          title: "Заявление о перечислении членских взносов",
          description: `Заявление о взносах от ${user.lastName} ${user.firstName}`,
          fileName: `dues_application_${user.id}_${now}.pdf`,
          fileSize: duesPdf.length,
          mimeType: "application/pdf",
          content: duesPdf.toString("base64"),
          templateId: duesTemplate.id,
          signedFilePath: null,
          driveFileId: null,
          driveUrl: null,
        },
      })
    : await prisma.document.create({
        data: {
          userId: user.id,
          organizationId: user.organizationId,
          type: DocumentType.CONTRIBUTION_APPLICATION,
          status: "GENERATED",
          title: "Заявление о перечислении членских взносов",
          description: `Заявление о взносах от ${user.lastName} ${user.firstName}`,
          fileName: `dues_application_${user.id}_${now}.pdf`,
          fileSize: duesPdf.length,
          mimeType: "application/pdf",
          content: duesPdf.toString("base64"),
          templateId: duesTemplate.id,
        },
      });

  return {
    membershipDoc: { id: membershipDoc.id, type: membershipDoc.type, title: membershipDoc.title, fileName: membershipDoc.fileName },
    duesDoc: { id: duesDoc.id, type: duesDoc.type, title: duesDoc.title, fileName: duesDoc.fileName },
  };
}

/**
 * Удаляет старые документы типа OTHER со статусом GENERATED/DRAFT у пользователя.
 */
export async function cleanupOldOtherDocuments(prisma: PrismaClient, userId: string): Promise<void> {
  const oldOther = await prisma.document.findMany({
    where: {
      userId,
      type: DocumentType.OTHER,
      status: { in: ["GENERATED", "DRAFT"] },
    },
  });
  if (oldOther.length > 0) {
    await prisma.document.deleteMany({
      where: { id: { in: oldOther.map((d) => d.id) } },
    });
  }
}
