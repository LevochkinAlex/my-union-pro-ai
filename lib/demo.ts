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

/** Проверка: является ли текущий пользователь демо (председатель или член). */
export function isDemoUserId(userId: string | undefined): boolean {
  return userId === DEMO_USER_ID || userId === DEMO_MEMBER_USER_ID;
}
