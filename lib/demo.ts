/**
 * Демо-режим платформы: полный функционал без записи в БД.
 * Данные хранятся локально или подставляются как заглушки.
 * Клиентским компонентам нужны только константы — импортируйте из lib/demo-constants.ts.
 */

import { prisma } from "./prisma";
import {
  DEMO_USER_ID,
  DEMO_MEMBER_USER_ID,
  DEMO_NEWS_ORG_NAME,
  type DemoStats,
  type DemoAppeal,
  type DemoMember,
} from "./demo-constants";

export { DEMO_USER_ID, DEMO_MEMBER_USER_ID, DEMO_NEWS_ORG_NAME };
export type { DemoStats, DemoAppeal, DemoMember };

/** Мок-статистика для дашборда председателя в демо. */
export function getDemoStats(): DemoStats {
  return {
    pendingAppeals: 3,
    pendingMembers: 2,
    activeMembers: 47,
    totalNews: 12,
    totalDocuments: 8,
    totalEmployees: 58,
    membershipPercent: 81,
    growthYTD: 5,
  };
}

/** Мок-обращения для демо. */
export function getDemoAppeals(): DemoAppeal[] {
  const now = new Date();
  return [
    {
      id: "demo-appeal-1",
      publicId: "AP-001",
      title: "Вопрос по отпуску",
      status: "PENDING",
      createdAt: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString(),
      user: { firstName: "Анна", lastName: "Сидорова" },
    },
    {
      id: "demo-appeal-2",
      publicId: "AP-002",
      title: "Консультация по больничному",
      status: "IN_PROGRESS",
      createdAt: new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000).toISOString(),
      user: { firstName: "Иван", lastName: "Петров" },
    },
    {
      id: "demo-appeal-3",
      publicId: "AP-003",
      title: "Справка для соцвыплаты",
      status: "PENDING",
      createdAt: new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000).toISOString(),
      user: { firstName: "Мария", lastName: "Козлова" },
    },
  ];
}

/** Мок-заявки на вступление для демо. */
export function getDemoMembers(): DemoMember[] {
  const now = new Date();
  return [
    {
      id: "demo-member-1",
      firstName: "Ольга",
      lastName: "Новикова",
      createdAt: new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000).toISOString(),
    },
    {
      id: "demo-member-2",
      firstName: "Дмитрий",
      lastName: "Волков",
      createdAt: new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000).toISOString(),
    },
  ];
}

/**
 * Получает реальные новости из организации «ППО Аппарат МООП РЗ РФ» для демо.
 * Только чтение из БД, без записи.
 */
export async function getDemoNewsFromOrg(limit = 10) {
  const org = await prisma.organization.findFirst({
    where: { name: DEMO_NEWS_ORG_NAME },
    select: { id: true },
  });
  if (!org) return [];

  const posts = await prisma.newsPost.findMany({
    where: {
      isPublished: true,
      channel: { organizationId: org.id },
    },
    orderBy: { createdAt: "desc" },
    take: limit,
    include: {
      author: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          avatarUrl: true,
        },
      },
      channel: {
        select: {
          id: true,
          name: true,
          iconUrl: true,
        },
      },
      _count: {
        select: { likes: true, comments: true },
      },
    },
  });

  return posts.map((post) => ({
    ...post,
    publishedAt: post.publishedAt?.toISOString() ?? null,
    createdAt: post.createdAt.toISOString(),
    updatedAt: post.updatedAt.toISOString(),
    isLiked: false,
    polls: [],
  }));
}

/** Мок «новые коллеги» для дашборда члена в демо. */
export function getDemoNewUsers() {
  return [
    { id: "demo-u1", firstName: "Анна", lastName: "Сидорова", middleName: "И.", avatarUrl: null, jobTitle: "Медсестра", profession: "Здравоохранение", organization: { name: DEMO_NEWS_ORG_NAME }, createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString() },
    { id: "demo-u2", firstName: "Иван", lastName: "Петров", middleName: null, avatarUrl: null, jobTitle: "Врач", profession: "Терапия", organization: { name: DEMO_NEWS_ORG_NAME }, createdAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString() },
    { id: "demo-u3", firstName: "Мария", lastName: "Козлова", middleName: "С.", avatarUrl: null, jobTitle: "Специалист по кадрам", profession: null, organization: { name: DEMO_NEWS_ORG_NAME }, createdAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString() },
  ];
}

/** Мок исходящих документов (заявлений) для демо-члена профсоюза — сгенерированные заявления. */
export function getDemoMemberOutgoingDocuments(): Array<{
  id: string;
  type: string;
  status: string;
  title: string;
  description: string | null;
  fileName: string | null;
  fileSize: number | null;
  mimeType: string;
  filePath: string | null;
  signedFilePath: string | null;
  driveFileId: string | null;
  driveUrl: string | null;
  verificationStatus: string | null;
  verificationMessage: string | null;
  verifiedAt: string | null;
  createdAt: string;
  updatedAt: string;
}> {
  const now = new Date().toISOString();
  return [
    {
      id: "demo-doc-membership",
      type: "MEMBERSHIP_APPLICATION",
      status: "GENERATED",
      title: "Заявление о вступлении в Профсоюз",
      description: "Заявление о вступлении в члены Профсоюза работников здравоохранения РФ",
      fileName: "Заявление_о_вступлении_Сидорова_А.П..docx",
      fileSize: 45678,
      mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      filePath: null,
      signedFilePath: null,
      driveFileId: null,
      driveUrl: null,
      verificationStatus: null,
      verificationMessage: null,
      verifiedAt: null,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "demo-doc-contribution",
      type: "CONTRIBUTION_APPLICATION",
      status: "GENERATED",
      title: "Заявление о перечислении членских взносов",
      description: "Заявление о перечислении членских взносов по безналичному расчёту",
      fileName: "Заявление_о_взносах_Сидорова_А.П..docx",
      fileSize: 38912,
      mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      filePath: null,
      signedFilePath: null,
      driveFileId: null,
      driveUrl: null,
      verificationStatus: null,
      verificationMessage: null,
      verifiedAt: null,
      createdAt: now,
      updatedAt: now,
    },
  ];
}

/** Проверка: является ли текущий пользователь демо (председатель или член). */
export function isDemoUserId(userId: string | undefined): boolean {
  return userId === DEMO_USER_ID || userId === DEMO_MEMBER_USER_ID;
}
