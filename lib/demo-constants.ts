/**
 * Константы демо-режима без зависимостей от БД.
 * Используйте этот файл в клиентских компонентах вместо lib/demo.ts,
 * чтобы не тянуть Prisma (и DATABASE_URL) в браузер.
 */

/** ID пользователя в сессии при входе в демо председателя (не существует в БД). */
export const DEMO_USER_ID = "demo-chairman";

/** ID пользователя в сессии при входе в демо члена профсоюза (не существует в БД). */
export const DEMO_MEMBER_USER_ID = "demo-member";

/** Название организации для подтягивания новостей в демо (Председатель Еременко, МООП РЗ Аппарат). */
export const DEMO_NEWS_ORG_NAME = "ППО Аппарат МООП РЗ РФ";

export interface DemoStats {
  pendingAppeals: number;
  pendingMembers: number;
  activeMembers: number;
  totalNews: number;
  totalDocuments: number;
  totalEmployees: number;
  appealSatisfactionPercent: number;
  growthYTD: number;
}

export interface DemoAppeal {
  id: string;
  publicId: string;
  title: string;
  status: string;
  createdAt: string;
  user: { firstName: string | null; lastName: string | null };
}

export interface DemoMember {
  id: string;
  firstName: string | null;
  lastName: string | null;
  createdAt: string;
}
