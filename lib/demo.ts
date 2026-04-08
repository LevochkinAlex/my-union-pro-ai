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

/** Server-side check: is this session a demo session (no real DB user). */
export function isDemoSession(session: any): boolean {
  return (
    session?.user?.isDemo === true ||
    session?.user?.id === DEMO_USER_ID ||
    session?.user?.id === DEMO_MEMBER_USER_ID
  );
}

/** Is this a demo chairman session? */
export function isDemoChairman(session: any): boolean {
  return session?.user?.id === DEMO_USER_ID;
}

/** Мок-статистика для дашборда председателя в демо. */
export function getDemoStats(): DemoStats {
  return {
    pendingAppeals: 3,
    pendingMembers: 2,
    activeMembers: 47,
    totalNews: 12,
    totalDocuments: 8,
    totalEmployees: 58,
    appealSatisfactionPercent: 85,
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

/** Мок-обращения для страницы председателя (GET /api/ppo-head/appeals). */
export function getDemoPPOHeadTickets(statusFilter?: string): any[] {
  const now = new Date();
  const base = [
    {
      id: "demo-appeal-1",
      publicId: "AP-001",
      type: "HR",
      status: "PENDING",
      priority: "MEDIUM",
      title: "Вопрос по отпуску",
      content: "Прошу уточнить порядок переноса ежегодного отпуска.",
      createdAt: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString(),
      updatedAt: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString(),
      user: { id: DEMO_MEMBER_USER_ID, firstName: "Анна", lastName: "Сидорова", middleName: "Петровна", email: "demo-member@demo.local", avatarUrl: null },
      commentsCount: 0,
      lastCommentAt: null,
      chatId: null,
      rejectionReason: null,
    },
    {
      id: "demo-appeal-2",
      publicId: "AP-002",
      type: "LEGAL",
      status: "IN_PROGRESS",
      priority: "LOW",
      title: "Консультация по больничному",
      content: "Хотел бы получить разъяснение по оплате больничного листа.",
      createdAt: new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000).toISOString(),
      updatedAt: new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000).toISOString(),
      user: { id: "demo-u2", firstName: "Иван", lastName: "Петров", middleName: null, email: null, avatarUrl: null },
      commentsCount: 2,
      lastCommentAt: new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000).toISOString(),
      chatId: null,
      rejectionReason: null,
    },
    {
      id: "demo-appeal-3",
      publicId: "AP-003",
      type: "OTHER",
      status: "PENDING",
      priority: "MEDIUM",
      title: "Справка для соцвыплаты",
      content: "Прошу подготовить справку в соцзащиту о членстве в профсоюзе.",
      createdAt: new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000).toISOString(),
      updatedAt: new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000).toISOString(),
      user: { id: "demo-u3", firstName: "Мария", lastName: "Козлова", middleName: "С.", email: null, avatarUrl: null },
      commentsCount: 0,
      lastCommentAt: null,
      chatId: null,
      rejectionReason: null,
    },
  ];
  if (statusFilter && statusFilter !== "all") {
    return base.filter((t) => t.status === statusFilter);
  }
  return base;
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

/** Мок-новости для демо (без БД). Используется для члена и председателя, когда нет данных из организации. */
export function getDemoNews(limit = 15): any[] {
  const now = new Date();
  return [
    {
      id: "demo-news-1",
      title: "Очередное заседание профкома",
      content: "<p>Состоялось плановое заседание профсоюзного комитета. Обсудили вопросы организации летнего отдыха и материальной помощи.</p>",
      coverImage: "/demo/demo-news-committee-meeting.png",
      publishedAt: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString(),
      viewCount: 42,
      author: { id: DEMO_USER_ID, firstName: "Иван", lastName: "Еременко", email: "demo-chairman@demo.local", avatarUrl: null },
      _count: { likes: 5, comments: 2 },
      isLiked: false,
      polls: [],
      channel: { id: "demo-channel", name: "Новости", iconUrl: null },
    },
    {
      id: "demo-news-2",
      title: "Льготы для членов профсоюза в 2025 году",
      content: "<p>Напоминаем о действующих скидках и специальных предложениях для членов профсоюза. Подробности в разделе «Скидки».</p>",
      coverImage: "/demo/demo-news-benefits.png",
      publishedAt: new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000).toISOString(),
      viewCount: 128,
      author: { id: "demo-u2", firstName: "Мария", lastName: "Козлова", email: "", avatarUrl: null },
      _count: { likes: 12, comments: 4 },
      isLiked: false,
      polls: [],
      channel: { id: "demo-channel", name: "Новости", iconUrl: null },
    },
    {
      id: "demo-news-3",
      title: "День здоровья — приглашаем на мероприятие",
      content: "<p>Профком организует День здоровья для сотрудников и их семей. Регистрация до конца месяца.</p>",
      coverImage: "/demo/demo-news-health-day.png",
      publishedAt: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString(),
      viewCount: 89,
      author: { id: DEMO_USER_ID, firstName: "Иван", lastName: "Еременко", email: "demo-chairman@demo.local", avatarUrl: null },
      _count: { likes: 8, comments: 1 },
      isLiked: false,
      polls: [],
      channel: { id: "demo-channel", name: "Новости", iconUrl: null },
    },
  ].slice(0, limit);
}

/** Мок «новые коллеги» для дашборда члена в демо. */
export function getDemoNewUsers() {
  return [
    { id: "demo-u1", firstName: "Анна", lastName: "Сидорова", middleName: "И.", avatarUrl: null, jobTitle: "Медсестра", profession: "Здравоохранение", organization: { name: DEMO_NEWS_ORG_NAME }, createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString() },
    { id: "demo-u2", firstName: "Иван", lastName: "Петров", middleName: null, avatarUrl: null, jobTitle: "Врач", profession: "Терапия", organization: { name: DEMO_NEWS_ORG_NAME }, createdAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString() },
    { id: "demo-u3", firstName: "Мария", lastName: "Козлова", middleName: "С.", avatarUrl: null, jobTitle: "Специалист по кадрам", profession: null, organization: { name: DEMO_NEWS_ORG_NAME }, createdAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString() },
  ];
}

/** Мок-пользователи для Профсети (страница /dashboard/users). Без БД. */
export function getDemoProfsetyUsers(opts?: { search?: string; page?: number; limit?: number; excludeUserId?: string }): { users: any[]; total: number } {
  const page = opts?.page ?? 1;
  const limit = opts?.limit ?? 10;
  const search = (opts?.search ?? "").trim().toLowerCase();
  const excludeUserId = opts?.excludeUserId;
  const all = [
    { id: DEMO_USER_ID, firstName: "Иван", lastName: "Еременко", middleName: "Сергеевич", email: "demo-chairman@demo.local", avatarUrl: null, phone: null, jobTitle: "Председатель ППО", profession: null, createdAt: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString(), organization: { id: "demo-org", name: DEMO_NEWS_ORG_NAME } },
    { id: DEMO_MEMBER_USER_ID, firstName: "Анна", lastName: "Сидорова", middleName: "Петровна", email: "demo-member@demo.local", avatarUrl: null, phone: null, jobTitle: "Медсестра", profession: "Здравоохранение", createdAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(), organization: { id: "demo-org", name: DEMO_NEWS_ORG_NAME } },
    { id: "demo-u2", firstName: "Иван", lastName: "Петров", middleName: "Сергеевич", email: "ivan.p@demo.local", avatarUrl: null, phone: null, jobTitle: "Врач", profession: "Терапия", createdAt: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString(), organization: { id: "demo-org", name: DEMO_NEWS_ORG_NAME } },
    { id: "demo-u3", firstName: "Мария", lastName: "Козлова", middleName: "Сергеевна", email: "maria.k@demo.local", avatarUrl: null, phone: null, jobTitle: "Специалист по кадрам", profession: null, createdAt: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString(), organization: { id: "demo-org", name: DEMO_NEWS_ORG_NAME } },
    { id: "demo-u4", firstName: "Ольга", lastName: "Новикова", middleName: null, email: "olga.n@demo.local", avatarUrl: null, phone: null, jobTitle: "Бухгалтер", profession: null, createdAt: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString(), organization: { id: "demo-org", name: DEMO_NEWS_ORG_NAME } },
    { id: "demo-u5", firstName: "Дмитрий", lastName: "Волков", middleName: "Игоревич", email: "dmitry.v@demo.local", avatarUrl: null, phone: null, jobTitle: "Инженер", profession: "ИТ", createdAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(), organization: { id: "demo-org", name: DEMO_NEWS_ORG_NAME } },
  ].filter((u) => u.id !== excludeUserId);
  let filtered = all;
  if (search) {
    filtered = all.filter(
      (u) =>
        u.firstName?.toLowerCase().includes(search) ||
        u.lastName?.toLowerCase().includes(search) ||
        u.email?.toLowerCase().includes(search) ||
        (u.jobTitle?.toLowerCase().includes(search) ?? false)
    );
  }
  const total = filtered.length;
  const users = filtered.slice((page - 1) * limit, page * limit);
  return { users, total };
}

/** Мок-посты для Профсети (лента постов). Без БД. */
export function getDemoProfsetyPosts(opts?: { limit?: number; page?: number }): any[] {
  const limit = opts?.limit ?? 10;
  const page = opts?.page ?? 1;
  const skip = (page - 1) * limit;
  const now = new Date();
  const org = { id: "demo-org", name: DEMO_NEWS_ORG_NAME };
  const all = [
    { id: "demo-post-1", content: "Коллеги, напоминаю о предстоящем Дне здоровья в эту субботу. Регистрация до четверга!", postType: "TEXT", author: { id: DEMO_USER_ID, firstName: "Иван", lastName: "Еременко", middleName: null, avatarUrl: null, jobTitle: "Председатель ППО", profession: null, organization: org }, attachments: [], linkMetadata: null, videoMetadata: null, coverImage: "/demo/demo-post-health-event.png", isLiked: false, likesCount: 5, commentsCount: 2, viewCount: 0, createdAt: new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000).toISOString(), updatedAt: new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000).toISOString() },
    { id: "demo-post-2", content: "Поделилась полезной статьёй про льготы для членов профсоюза — в разделе «Скидки» появились новые предложения.", postType: "TEXT", author: { id: DEMO_MEMBER_USER_ID, firstName: "Анна", lastName: "Сидорова", middleName: "Петровна", avatarUrl: null, jobTitle: "Медсестра", profession: "Здравоохранение", organization: org }, attachments: [], linkMetadata: null, videoMetadata: null, coverImage: "/demo/demo-post-discounts.png", isLiked: false, likesCount: 3, commentsCount: 0, viewCount: 0, createdAt: new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000).toISOString(), updatedAt: new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000).toISOString() },
    { id: "demo-post-3", content: "Спасибо профкому за организацию экскурсии — было очень интересно!", postType: "TEXT", author: { id: "demo-u2", firstName: "Иван", lastName: "Петров", middleName: "Сергеевич", avatarUrl: null, jobTitle: "Врач", profession: "Терапия", organization: org }, attachments: [], linkMetadata: null, videoMetadata: null, coverImage: "/demo/demo-post-excursion.png", isLiked: false, likesCount: 12, commentsCount: 4, viewCount: 0, createdAt: new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000).toISOString(), updatedAt: new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000).toISOString() },
  ];
  return all.slice(skip, skip + limit);
}

const DEMO_ORG = { id: "demo-org", name: DEMO_NEWS_ORG_NAME, inn: null as string | null };
const DEMO_JOINED_AT = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString();
const DEMO_UPDATED_AT = new Date().toISOString();

/** Мок профиля для GET /api/profile (демо). */
export function getDemoProfile(userId: string): { user: any; viewMode: string | null; isPPOHead: boolean } {
  const isChairman = userId === DEMO_USER_ID;
  const base = {
    emailVerified: null,
    phone: isChairman ? "+7 (999) 123-45-67" : "+7 (999) 765-43-21",
    dateOfBirth: isChairman ? "1980-05-15" : "1992-08-22",
    address: isChairman ? "г. Москва, ул. Примерная, д. 1, кв. 10" : "г. Москва, ул. Семейная, д. 5, кв. 42",
    preferredDiscountCity: "Москва",
    avatarUrl: null,
    jobTitle: isChairman ? "Председатель ППО" : "Медсестра",
    workplace: isChairman ? "Аппарат МООП РЗ РФ" : "Поликлиника № 1",
    workplaceInn: "7707123456",
    directorName: isChairman ? "Петров П. П." : "Сидорова М. И.",
    directorPosition: isChairman ? "Директор" : "Главный врач",
    profession: isChairman ? null : "Здравоохранение",
    education: isChairman ? "Высшее" : "Среднее специальное",
    employmentStatus: "",
    hobbies: isChairman ? "Шахматы, чтение" : "Йога, путешествия",
    aboutMe: isChairman ? "Председатель первичной профсоюзной организации." : "Работаю в здравоохранении более 5 лет.",
    hasChildren: null,
    childrenInfo: null,
    maritalStatus: null,
    spouseInfo: null,
    additionalInfo: null,
    membershipStatus: "APPROVED",
    unionMembershipStatus: "ACCEPTED",
    organizationId: DEMO_ORG.id,
    organization: DEMO_ORG,
    profileChangedAfterDocuments: false,
    profileLastModified: DEMO_UPDATED_AT,
    viewMode: isChairman ? "PPO_HEAD" : "MEMBER",
    isPPOHead: isChairman,
    createdAt: isChairman ? new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString() : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
    updatedAt: DEMO_UPDATED_AT,
    bestBenefitsLinked: true,
  };
  const user = isChairman
    ? {
        id: DEMO_USER_ID,
        email: "demo-chairman@demo.local",
        firstName: "Иван",
        lastName: "Еременко",
        middleName: "Сергеевич",
        ...base,
      }
    : {
        id: DEMO_MEMBER_USER_ID,
        email: "demo-member@demo.local",
        firstName: "Анна",
        lastName: "Сидорова",
        middleName: "Петровна",
        ...base,
      };
  return {
    user,
    viewMode: user.viewMode,
    isPPOHead: user.isPPOHead,
  };
}

/** Мок дополнительной информации профиля для GET /api/profile/additional-info (демо). */
export function getDemoProfileAdditionalInfo(userId: string): any {
  const isChairman = userId === DEMO_USER_ID;
  return {
    employmentStatus: "",
    hobbies: isChairman ? "Шахматы, чтение" : "Йога, путешествия",
    aboutMe: isChairman ? "Председатель первичной профсоюзной организации." : "Работаю в здравоохранении более 5 лет.",
    hasChildren: false,
    childrenInfo: "",
    childrenBirthDates: "",
    maritalStatus: "MARRIED",
    spouseInfo: "",
    awards: "",
    training: "",
    professions: null,
    educations: null,
    profession: isChairman ? null : "Здравоохранение",
    education: isChairman ? "Высшее" : "Среднее специальное",
    additionalInfo: "",
  };
}

/** Публичный профиль для GET /api/profile/[id] по любому демо-ID (демо-chairman, demo-member, demo-u2 и т.д.). */
export function getDemoPublicProfileById(userId: string): any | null {
  if (userId === DEMO_USER_ID || userId === DEMO_MEMBER_USER_ID) {
    const { user } = getDemoProfile(userId);
    return {
      id: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
      middleName: user.middleName,
      email: user.email,
      avatarUrl: user.avatarUrl,
      phone: user.phone,
      jobTitle: user.jobTitle,
      profession: user.profession,
      education: user.education,
      aboutMe: user.aboutMe,
      hobbies: user.hobbies,
      createdAt: user.createdAt,
      organization: user.organization ? { id: user.organization.id, name: user.organization.name, type: "PRIMARY" } : null,
    };
  }
  const { users } = getDemoProfsetyUsers({ excludeUserId: "none" });
  const u = users.find((x: any) => x.id === userId);
  if (!u) return null;
  return {
    id: u.id,
    firstName: u.firstName,
    lastName: u.lastName,
    middleName: u.middleName,
    email: u.email,
    avatarUrl: u.avatarUrl ?? null,
    phone: u.phone ?? null,
    jobTitle: u.jobTitle ?? null,
    profession: u.profession ?? null,
    education: null,
    aboutMe: "",
    hobbies: "",
    createdAt: u.createdAt,
    organization: u.organization ? { id: u.organization.id, name: u.organization.name, type: "PRIMARY" } : null,
  };
}

/** Мок данных о членстве для GET /api/profile/membership (демо). */
export function getDemoProfileMembership(userId: string): {
  unionCardNumber: string;
  membershipJoinedAt: string | null;
  membershipStatus: string;
  currentOrganization: { id: string | null; name: string; inn: string | null; chairmanName: string | null; type: string };
  history: Array<{ id: string; organizationName: string; organizationId: string | null; status: string; statusDate: string; notes: string | null }>;
} {
  const isChairman = userId === DEMO_USER_ID;
  return {
    unionCardNumber: "1234 5678 9012 3456",
    membershipJoinedAt: DEMO_JOINED_AT,
    membershipStatus: "ACCEPTED",
    currentOrganization: {
      id: DEMO_ORG.id,
      name: DEMO_ORG.name,
      inn: DEMO_ORG.inn,
      chairmanName: isChairman ? "Иван Сергеевич Еременко" : "Иван Сергеевич Еременко",
      type: "linked",
    },
    history: [
      { id: "demo-mh-1", organizationName: DEMO_ORG.name, organizationId: DEMO_ORG.id, status: "ACCEPTED", statusDate: DEMO_JOINED_AT, notes: null },
    ],
  };
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

/** ID мок-обращений для демо-члена (для GET /api/tickets/[id]). */
export const DEMO_TICKET_IDS = ["demo-ticket-1", "demo-ticket-2", "demo-ticket-3"] as const;

/** Мок-обращения для демо-члена профсоюза (список «Мои обращения»). */
export function getDemoMemberTickets(statusFilter?: string): Array<{
  id: string;
  publicId: string;
  type: string;
  status: string;
  priority: string;
  title: string;
  content: string;
  createdAt: string;
  updatedAt: string;
  attachmentsCount: number;
  commentsCount: number;
  lastCommentAt: string | null;
  chatId: string | null;
  createdBy: { id: string; firstName: string | null; lastName: string | null; middleName: string | null; email: string | null };
  isOwner: boolean;
  responseDeadline: string | null;
  lastResponseAt: string | null;
  lastUserResponseAt: string | null;
  userResponseDeadline: string | null;
  isOverdue: boolean;
  autoClosedAt: string | null;
}> {
  const now = new Date();
  const base = [
    {
      id: "demo-ticket-1",
      publicId: "1001-0001",
      type: "HR",
      status: "IN_PROGRESS",
      priority: "MEDIUM",
      title: "Вопрос по отпуску",
      content: "<p>Прошу уточнить порядок переноса ежегодного отпуска в связи с производственной необходимостью.</p>",
      createdAt: new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000).toISOString(),
      updatedAt: new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000).toISOString(),
      attachmentsCount: 0,
      commentsCount: 2,
      lastCommentAt: new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000).toISOString(),
      chatId: null,
      createdBy: { id: DEMO_MEMBER_USER_ID, firstName: "Анна", lastName: "Сидорова", middleName: "Петровна", email: "demo-member@demo.local" },
      isOwner: true,
      responseDeadline: new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000).toISOString(),
      lastResponseAt: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString(),
      lastUserResponseAt: null,
      userResponseDeadline: null,
      isOverdue: false,
      autoClosedAt: null,
    },
    {
      id: "demo-ticket-2",
      publicId: "1001-0002",
      type: "LEGAL",
      status: "PENDING",
      priority: "LOW",
      title: "Консультация по больничному",
      content: "<p>Хотела бы получить разъяснение по оплате больничного листа при стаже менее 5 лет.</p>",
      createdAt: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString(),
      updatedAt: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString(),
      attachmentsCount: 0,
      commentsCount: 0,
      lastCommentAt: null,
      chatId: null,
      createdBy: { id: DEMO_MEMBER_USER_ID, firstName: "Анна", lastName: "Сидорова", middleName: "Петровна", email: "demo-member@demo.local" },
      isOwner: true,
      responseDeadline: new Date(now.getTime() + 70 * 60 * 60 * 1000).toISOString(),
      lastResponseAt: null,
      lastUserResponseAt: null,
      userResponseDeadline: null,
      isOverdue: false,
      autoClosedAt: null,
    },
    {
      id: "demo-ticket-3",
      publicId: "1001-0003",
      type: "OTHER",
      status: "RESOLVED",
      priority: "MEDIUM",
      title: "Справка для соцвыплаты",
      content: "<p>Прошу подготовить справку в соцзащиту о членстве в профсоюзе для оформления субсидии.</p>",
      createdAt: new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString(),
      updatedAt: new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000).toISOString(),
      attachmentsCount: 1,
      commentsCount: 4,
      lastCommentAt: new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000).toISOString(),
      chatId: null,
      createdBy: { id: DEMO_MEMBER_USER_ID, firstName: "Анна", lastName: "Сидорова", middleName: "Петровна", email: "demo-member@demo.local" },
      isOwner: true,
      responseDeadline: null,
      lastResponseAt: new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000).toISOString(),
      lastUserResponseAt: null,
      userResponseDeadline: null,
      isOverdue: false,
      autoClosedAt: null,
    },
  ];
  if (statusFilter && statusFilter !== "all") {
    return base.filter((t) => t.status === statusFilter);
  }
  return base;
}

/** Один мок-тикет по id для демо-члена (для страницы обращения). */
export function getDemoMemberTicketById(
  id: string
): {
  id: string;
  publicId: string;
  type: string;
  status: string;
  priority: string;
  title: string;
  content: string;
  createdAt: string;
  updatedAt: string;
  attachments: Array<{ id: string; fileName: string; filePath: string; fileSize: number; mimeType: string }>;
  chatId: string | null;
  userId: string;
  organizationId: string | null;
  rejectionReason: string | null;
  helpfulRating: number | null;
  helpfulRatingComment: string | null;
  helpfulRatingAt: string | null;
} | null {
  const list = getDemoMemberTickets();
  const ticket = list.find((t) => t.id === id || t.publicId === id || t.publicId.replace("-", "") === id.replace(/-/g, ""));
  if (!ticket) return null;
  return {
    id: ticket.id,
    publicId: ticket.publicId,
    type: ticket.type,
    status: ticket.status,
    priority: ticket.priority,
    title: ticket.title,
    content: ticket.content,
    createdAt: ticket.createdAt,
    updatedAt: ticket.updatedAt,
    attachments: ticket.id === "demo-ticket-3" ? [{ id: "demo-att-1", fileName: "skan.pdf", filePath: "/uploads/tickets/demo.pdf", fileSize: 12345, mimeType: "application/pdf" }] : [],
    chatId: ticket.chatId,
    userId: DEMO_MEMBER_USER_ID,
    organizationId: "demo-org",
    rejectionReason: null,
    helpfulRating: null,
    helpfulRatingComment: null,
    helpfulRatingAt: null,
  };
}

/** Мок-чаты для демо-члена профсоюза (ИИ + обращение). */
export function getDemoMemberChats(): any[] {
  const now = new Date().toISOString();
  return [
    {
      id: "demo-ai-chat",
      type: "PRIVATE" as const,
      name: "ИИ-Ассистент",
      displayName: "ИИ-Ассистент",
      lastMessage: "Чем могу помочь?",
      lastMessageAt: now,
      unreadCount: 0,
      otherUser: { id: "ai-assistant-bot", firstName: "ИИ", lastName: "Ассистент", middleName: null, avatarUrl: null, isBot: true },
      participantsCount: 1,
      ticketId: null,
      ticketPublicId: null,
      ticketTitle: null,
      isAIChat: true,
    },
    {
      id: "demo-chat-ticket-1",
      type: "GROUP" as const,
      name: "Обращение #1001-0001: Вопрос по отпуску",
      displayName: "Обращение #1001-0001",
      lastMessage: "Обращение создано",
      lastMessageAt: now,
      unreadCount: 0,
      participantsCount: 2,
      ticketId: "demo-ticket-1",
      ticketPublicId: "1001-0001",
      ticketTitle: "Вопрос по отпуску",
      otherUser: null,
    },
  ];
}

/** Мок-чаты для демо-председателя (ИИ + канал + обращение). */
export function getDemoChairmanChats(): any[] {
  const now = new Date().toISOString();
  return [
    {
      id: "demo-ai-chat-ppo",
      type: "PRIVATE" as const,
      name: "ИИ-Ассистент",
      displayName: "ИИ-Ассистент",
      lastMessage: "Чем могу помочь?",
      lastMessageAt: now,
      unreadCount: 0,
      otherUser: { id: "ai-assistant-bot", firstName: "ИИ", lastName: "Ассистент", middleName: null, avatarUrl: null, isBot: true },
      participantsCount: 1,
      ticketId: null,
      ticketPublicId: null,
      ticketTitle: null,
      isAIChat: true,
    },
    {
      id: "demo-channel-1",
      type: "CHANNEL" as const,
      name: "Общие вопросы",
      displayName: "Общие вопросы",
      lastMessage: "📢 Пост в канале",
      lastMessageAt: now,
      unreadCount: 0,
      participantsCount: 12,
      otherUser: null,
    },
    {
      id: "demo-chat-ticket-ppo",
      type: "GROUP" as const,
      name: "Обращение #1001-0001: Вопрос по отпуску",
      displayName: "Обращение #1001-0001",
      lastMessage: "Обращение от Анна Сидорова",
      lastMessageAt: now,
      unreadCount: 0,
      participantsCount: 2,
      ticketId: "demo-ticket-1",
      ticketPublicId: "1001-0001",
      ticketTitle: "Вопрос по отпуску",
      otherUser: null,
    },
  ];
}

/** Проверка: является ли текущий пользователь демо (председатель или член). */
export function isDemoUserId(userId: string | undefined): boolean {
  return userId === DEMO_USER_ID || userId === DEMO_MEMBER_USER_ID;
}

// ---------------------------------------------------------------------------
//  Extended mocks for full demo cabinets
// ---------------------------------------------------------------------------

const DEMO_ORG_ID = "demo-org";

/** Расширенный список членов профсоюза для раздела «Члены» (председатель). */
export function getDemoMembersList(statusFilter?: string): any[] {
  const now = new Date();
  const approved = [
    { id: "demo-u1", firstName: "Анна", lastName: "Сидорова", middleName: "Петровна", email: "anna.s@demo.local", phone: "+7 999 765 43 21", avatarUrl: null, jobTitle: "Медсестра", status: "APPROVED", membershipJoinedAt: new Date(now.getTime() - 30 * 86400000).toISOString(), createdAt: new Date(now.getTime() - 30 * 86400000).toISOString(), organization: { id: DEMO_ORG_ID, name: DEMO_NEWS_ORG_NAME } },
    { id: "demo-u2", firstName: "Иван", lastName: "Петров", middleName: "Сергеевич", email: "ivan.p@demo.local", phone: "+7 999 111 22 33", avatarUrl: null, jobTitle: "Врач", status: "APPROVED", membershipJoinedAt: new Date(now.getTime() - 60 * 86400000).toISOString(), createdAt: new Date(now.getTime() - 60 * 86400000).toISOString(), organization: { id: DEMO_ORG_ID, name: DEMO_NEWS_ORG_NAME } },
    { id: "demo-u3", firstName: "Мария", lastName: "Козлова", middleName: "Сергеевна", email: "maria.k@demo.local", phone: "+7 999 222 33 44", avatarUrl: null, jobTitle: "Специалист по кадрам", status: "APPROVED", membershipJoinedAt: new Date(now.getTime() - 14 * 86400000).toISOString(), createdAt: new Date(now.getTime() - 14 * 86400000).toISOString(), organization: { id: DEMO_ORG_ID, name: DEMO_NEWS_ORG_NAME } },
    { id: "demo-u4", firstName: "Ольга", lastName: "Новикова", middleName: null, email: "olga.n@demo.local", phone: "+7 999 333 44 55", avatarUrl: null, jobTitle: "Бухгалтер", status: "APPROVED", membershipJoinedAt: new Date(now.getTime() - 90 * 86400000).toISOString(), createdAt: new Date(now.getTime() - 90 * 86400000).toISOString(), organization: { id: DEMO_ORG_ID, name: DEMO_NEWS_ORG_NAME } },
    { id: "demo-u5", firstName: "Дмитрий", lastName: "Волков", middleName: "Игоревич", email: "dmitry.v@demo.local", phone: "+7 999 444 55 66", avatarUrl: null, jobTitle: "Инженер", status: "APPROVED", membershipJoinedAt: new Date(now.getTime() - 7 * 86400000).toISOString(), createdAt: new Date(now.getTime() - 7 * 86400000).toISOString(), organization: { id: DEMO_ORG_ID, name: DEMO_NEWS_ORG_NAME } },
    { id: "demo-u6", firstName: "Елена", lastName: "Соколова", middleName: "Владимировна", email: "elena.s@demo.local", phone: "+7 999 555 66 77", avatarUrl: null, jobTitle: "Юрист", status: "APPROVED", membershipJoinedAt: new Date(now.getTime() - 120 * 86400000).toISOString(), createdAt: new Date(now.getTime() - 120 * 86400000).toISOString(), organization: { id: DEMO_ORG_ID, name: DEMO_NEWS_ORG_NAME } },
    { id: "demo-u7", firstName: "Алексей", lastName: "Кузнецов", middleName: "Андреевич", email: "alex.k@demo.local", phone: "+7 999 666 77 88", avatarUrl: null, jobTitle: "Программист", status: "APPROVED", membershipJoinedAt: new Date(now.getTime() - 180 * 86400000).toISOString(), createdAt: new Date(now.getTime() - 180 * 86400000).toISOString(), organization: { id: DEMO_ORG_ID, name: DEMO_NEWS_ORG_NAME } },
    { id: "demo-u8", firstName: "Наталья", lastName: "Морозова", middleName: "Ивановна", email: "natalya.m@demo.local", phone: "+7 999 777 88 99", avatarUrl: null, jobTitle: "Экономист", status: "APPROVED", membershipJoinedAt: new Date(now.getTime() - 45 * 86400000).toISOString(), createdAt: new Date(now.getTime() - 45 * 86400000).toISOString(), organization: { id: DEMO_ORG_ID, name: DEMO_NEWS_ORG_NAME } },
  ];
  const pending = [
    { id: "demo-pending-1", firstName: "Ольга", lastName: "Новикова", middleName: null, email: "olga.new@demo.local", phone: "+7 999 888 99 00", avatarUrl: null, jobTitle: "Терапевт", status: "DOCUMENTS_PENDING", membershipJoinedAt: null, createdAt: new Date(now.getTime() - 3 * 86400000).toISOString(), organization: { id: DEMO_ORG_ID, name: DEMO_NEWS_ORG_NAME } },
    { id: "demo-pending-2", firstName: "Дмитрий", lastName: "Волков", middleName: "Иг.", email: "dmitry.new@demo.local", phone: "+7 999 999 00 11", avatarUrl: null, jobTitle: "Водитель", status: "DOCUMENTS_PENDING", membershipJoinedAt: null, createdAt: new Date(now.getTime() - 1 * 86400000).toISOString(), organization: { id: DEMO_ORG_ID, name: DEMO_NEWS_ORG_NAME } },
  ];
  if (statusFilter === "pending" || statusFilter === "DOCUMENTS_PENDING") return pending;
  if (statusFilter === "approved" || statusFilter === "APPROVED") return approved;
  if (statusFilter === "excluded" || statusFilter === "EXCLUDED") return [];
  return [...approved, ...pending];
}

/** Готовое демо-заседание (статус «Проведено»). */
export function getDemoMeetings(): any[] {
  const now = new Date();
  const meetingDate = new Date(now.getTime() - 7 * 86400000);
  return [{
    id: "demo-meeting-1",
    title: "Заседание профсоюзного комитета №4",
    type: "COMMITTEE",
    status: "COMPLETED",
    meetingDate: meetingDate.toISOString(),
    meetingNumber: "4",
    location: "Конференц-зал, каб. 201",
    chairman: { id: DEMO_USER_ID, firstName: "Иван", lastName: "Еременко", middleName: "Сергеевич" },
    secretary: { id: "demo-u3", firstName: "Мария", lastName: "Козлова", middleName: "Сергеевна" },
    participantsCount: 5,
    agendaItemsCount: 3,
    documentsCount: 4,
    createdAt: new Date(now.getTime() - 14 * 86400000).toISOString(),
    updatedAt: meetingDate.toISOString(),
    organizationId: DEMO_ORG_ID,
    chatId: null,
  }];
}

/** Детали демо-заседания по ID. */
export function getDemoMeetingById(id: string): any | null {
  if (id !== "demo-meeting-1") return null;
  const now = new Date();
  const meetingDate = new Date(now.getTime() - 7 * 86400000);
  return {
    id: "demo-meeting-1",
    title: "Заседание профсоюзного комитета №4",
    type: "COMMITTEE",
    status: "COMPLETED",
    meetingDate: meetingDate.toISOString(),
    meetingNumber: "4",
    location: "Конференц-зал, каб. 201",
    chairman: { id: DEMO_USER_ID, firstName: "Иван", lastName: "Еременко", middleName: "Сергеевич" },
    secretary: { id: "demo-u3", firstName: "Мария", lastName: "Козлова", middleName: "Сергеевна" },
    organizationId: DEMO_ORG_ID,
    createdAt: new Date(now.getTime() - 14 * 86400000).toISOString(),
    updatedAt: meetingDate.toISOString(),
    chatId: null,
    participants: [
      { id: "demo-mp-1", userId: DEMO_USER_ID, role: "CHAIRMAN", user: { id: DEMO_USER_ID, firstName: "Иван", lastName: "Еременко", middleName: "Сергеевич" }, attended: true },
      { id: "demo-mp-2", userId: "demo-u3", role: "SECRETARY", user: { id: "demo-u3", firstName: "Мария", lastName: "Козлова", middleName: "Сергеевна" }, attended: true },
      { id: "demo-mp-3", userId: "demo-u1", role: "MEMBER", user: { id: "demo-u1", firstName: "Анна", lastName: "Сидорова", middleName: "Петровна" }, attended: true },
      { id: "demo-mp-4", userId: "demo-u6", role: "MEMBER", user: { id: "demo-u6", firstName: "Елена", lastName: "Соколова", middleName: "Владимировна" }, attended: true },
      { id: "demo-mp-5", userId: "demo-u7", role: "MEMBER", user: { id: "demo-u7", firstName: "Алексей", lastName: "Кузнецов", middleName: "Андреевич" }, attended: false },
    ],
    agendaItems: [
      { id: "demo-ai-1", number: 1, title: "Об итогах работы ППО за I квартал", speaker: "Еременко И.С.", coSpeaker: null, decision: "Принять к сведению. Информацию утвердить.", votesFor: 4, votesAgainst: 0, votesAbstained: 0, attachments: [] },
      { id: "demo-ai-2", number: 2, title: "Об организации Дня здоровья для сотрудников", speaker: "Сидорова А.П.", coSpeaker: "Козлова М.С.", decision: "Провести мероприятие 15.05.2026. Ответственный — Сидорова А.П.", votesFor: 4, votesAgainst: 0, votesAbstained: 0, attachments: [] },
      { id: "demo-ai-3", number: 3, title: "О материальной помощи членам профсоюза", speaker: "Соколова Е.В.", coSpeaker: null, decision: "Выделить материальную помощь согласно положению. Список утвердить.", votesFor: 3, votesAgainst: 0, votesAbstained: 1, attachments: [] },
    ],
    documents: [
      { id: "demo-doc-agenda", type: "AGENDA", title: "Повестка заседания №4", status: "SIGNED", filePath: "/demo/demo-agenda.pdf", createdAt: new Date(now.getTime() - 10 * 86400000).toISOString() },
      { id: "demo-doc-protocol", type: "PROTOCOL", title: "Протокол заседания №4", status: "SIGNED", filePath: "/demo/demo-protocol.pdf", createdAt: meetingDate.toISOString() },
      { id: "demo-doc-resolution", type: "RESOLUTION", title: "Постановление по итогам заседания №4", status: "SIGNED", filePath: "/demo/demo-resolution.pdf", createdAt: meetingDate.toISOString() },
      { id: "demo-doc-extract", type: "EXTRACT", title: "Выписка из протокола №4", status: "SIGNED", filePath: "/demo/demo-extract.pdf", createdAt: meetingDate.toISOString() },
    ],
  };
}

/** Документы организации для председателя. */
export function getDemoChairmanDocuments(): any[] {
  const now = new Date();
  return [
    { id: "demo-org-doc-1", type: "AGENDA", title: "Повестка заседания №4", status: "SIGNED", fileName: "Повестка_4.pdf", filePath: "/demo/demo-agenda.pdf", mimeType: "application/pdf", createdAt: new Date(now.getTime() - 10 * 86400000).toISOString(), updatedAt: new Date(now.getTime() - 10 * 86400000).toISOString(), meeting: { id: "demo-meeting-1", title: "Заседание №4" } },
    { id: "demo-org-doc-2", type: "PROTOCOL", title: "Протокол заседания №4", status: "SIGNED", fileName: "Протокол_4.pdf", filePath: "/demo/demo-protocol.pdf", mimeType: "application/pdf", createdAt: new Date(now.getTime() - 7 * 86400000).toISOString(), updatedAt: new Date(now.getTime() - 7 * 86400000).toISOString(), meeting: { id: "demo-meeting-1", title: "Заседание №4" } },
    { id: "demo-org-doc-3", type: "RESOLUTION", title: "Постановление заседания №4", status: "SIGNED", fileName: "Постановление_4.pdf", filePath: "/demo/demo-resolution.pdf", mimeType: "application/pdf", createdAt: new Date(now.getTime() - 7 * 86400000).toISOString(), updatedAt: new Date(now.getTime() - 7 * 86400000).toISOString(), meeting: { id: "demo-meeting-1", title: "Заседание №4" } },
    { id: "demo-org-doc-4", type: "EXTRACT", title: "Выписка из протокола №4", status: "SIGNED", fileName: "Выписка_4.pdf", filePath: "/demo/demo-extract.pdf", mimeType: "application/pdf", createdAt: new Date(now.getTime() - 7 * 86400000).toISOString(), updatedAt: new Date(now.getTime() - 7 * 86400000).toISOString(), meeting: { id: "demo-meeting-1", title: "Заседание №4" } },
  ];
}

/** Мок-скидки (каталог) для демо — без промо-активации. */
export function getDemoDiscounts(): { discounts: any[]; total: number } {
  const discounts = [
    { id: "demo-disc-1", title: "Скидка 15% в аптеке «Здоровье»", shortDescription: "Скидка на все лекарства и медтехнику для членов профсоюза", category: { id: "cat-1", name: "Здоровье" }, cities: [{ id: "city-1", name: "Москва" }], imageUrl: "/demo/demo-news-benefits.png", partnerName: "Аптека Здоровье", discountValue: "15%", isFavorite: false },
    { id: "demo-disc-2", title: "Скидка 20% в фитнес-клубе FitLife", shortDescription: "Абонемент со скидкой для членов профсоюза и их семей", category: { id: "cat-2", name: "Спорт" }, cities: [{ id: "city-1", name: "Москва" }], imageUrl: "/demo/demo-post-health-event.png", partnerName: "FitLife", discountValue: "20%", isFavorite: false },
    { id: "demo-disc-3", title: "Скидка 10% на путёвки в санаторий", shortDescription: "Льготные путёвки на санаторно-курортное лечение", category: { id: "cat-3", name: "Отдых" }, cities: [{ id: "city-1", name: "Москва" }, { id: "city-2", name: "Сочи" }], imageUrl: "/demo/demo-post-excursion.png", partnerName: "Санаторий «Подмосковье»", discountValue: "10%", isFavorite: false },
    { id: "demo-disc-4", title: "Скидка 25% на юридические консультации", shortDescription: "Бесплатная первичная консультация и скидка на услуги", category: { id: "cat-4", name: "Услуги" }, cities: [{ id: "city-1", name: "Москва" }], imageUrl: null, partnerName: "Юридический центр «Право»", discountValue: "25%", isFavorite: false },
    { id: "demo-disc-5", title: "Скидка 30% на обучающие курсы", shortDescription: "Повышение квалификации и переподготовка для членов профсоюза", category: { id: "cat-5", name: "Образование" }, cities: [{ id: "city-1", name: "Москва" }], imageUrl: null, partnerName: "Учебный центр «Профи»", discountValue: "30%", isFavorite: false },
    { id: "demo-disc-6", title: "Скидка 10% на мобильную связь", shortDescription: "Специальный тариф для членов профсоюза", category: { id: "cat-6", name: "Связь" }, cities: [{ id: "city-1", name: "Москва" }, { id: "city-2", name: "Сочи" }], imageUrl: null, partnerName: "МТС", discountValue: "10%", isFavorite: false },
  ];
  return { discounts, total: discounts.length };
}

/** Мок-отчёты для демо-председателя. */
export function getDemoReports(): any[] {
  const now = new Date();
  return [
    { id: "demo-report-1", title: "Ежеквартальный отчёт за I квартал 2026", templateName: "Квартальный отчёт", status: "APPROVED", period: "Q1 2026", dueDate: new Date(now.getTime() - 15 * 86400000).toISOString(), submittedAt: new Date(now.getTime() - 20 * 86400000).toISOString(), approvedAt: new Date(now.getTime() - 17 * 86400000).toISOString(), createdAt: new Date(now.getTime() - 30 * 86400000).toISOString(), updatedAt: new Date(now.getTime() - 17 * 86400000).toISOString() },
    { id: "demo-report-2", title: "Годовой отчёт за 2025 год", templateName: "Годовой отчёт", status: "APPROVED", period: "2025", dueDate: new Date(now.getTime() - 60 * 86400000).toISOString(), submittedAt: new Date(now.getTime() - 65 * 86400000).toISOString(), approvedAt: new Date(now.getTime() - 62 * 86400000).toISOString(), createdAt: new Date(now.getTime() - 90 * 86400000).toISOString(), updatedAt: new Date(now.getTime() - 62 * 86400000).toISOString() },
  ];
}

/** Мок-сотрудники ППО для демо-председателя. */
export function getDemoStaff(): any[] {
  return [
    { id: "demo-staff-1", userId: "demo-u3", user: { id: "demo-u3", firstName: "Мария", lastName: "Козлова", middleName: "Сергеевна", email: "maria.k@demo.local", avatarUrl: null }, role: { id: "demo-role-1", name: "Секретарь", permissions: {} }, status: "ACTIVE", createdAt: new Date(Date.now() - 180 * 86400000).toISOString() },
    { id: "demo-staff-2", userId: "demo-u6", user: { id: "demo-u6", firstName: "Елена", lastName: "Соколова", middleName: "Владимировна", email: "elena.s@demo.local", avatarUrl: null }, role: { id: "demo-role-2", name: "Юрист", permissions: {} }, status: "ACTIVE", createdAt: new Date(Date.now() - 120 * 86400000).toISOString() },
    { id: "demo-staff-3", userId: "demo-u8", user: { id: "demo-u8", firstName: "Наталья", lastName: "Морозова", middleName: "Ивановна", email: "natalya.m@demo.local", avatarUrl: null }, role: { id: "demo-role-3", name: "Казначей", permissions: {} }, status: "ACTIVE", createdAt: new Date(Date.now() - 60 * 86400000).toISOString() },
  ];
}

/** Каналы новостей для председателя (демо). */
export function getDemoNewsChannels(): any[] {
  return [
    { id: "demo-channel", name: "Новости ППО", iconUrl: null, organizationId: DEMO_ORG_ID, postsCount: 3, canPublish: true },
    { id: "demo-channel-2", name: "Объявления", iconUrl: null, organizationId: DEMO_ORG_ID, postsCount: 0, canPublish: true },
  ];
}

/** Мок «избранные тела» для API /api/ppo-head/elected-body-members. */
export function getDemoElectedBodyMembers(): any[] {
  return [
    { id: "demo-eb-1", userId: DEMO_USER_ID, user: { id: DEMO_USER_ID, firstName: "Иван", lastName: "Еременко", middleName: "Сергеевич" }, role: "CHAIRMAN" },
    { id: "demo-eb-2", userId: "demo-u3", user: { id: "demo-u3", firstName: "Мария", lastName: "Козлова", middleName: "Сергеевна" }, role: "SECRETARY" },
    { id: "demo-eb-3", userId: "demo-u6", user: { id: "demo-u6", firstName: "Елена", lastName: "Соколова", middleName: "Владимировна" }, role: "MEMBER" },
    { id: "demo-eb-4", userId: "demo-u7", user: { id: "demo-u7", firstName: "Алексей", lastName: "Кузнецов", middleName: "Андреевич" }, role: "MEMBER" },
    { id: "demo-eb-5", userId: "demo-u1", user: { id: "demo-u1", firstName: "Анна", lastName: "Сидорова", middleName: "Петровна" }, role: "MEMBER" },
  ];
}

/** Мок контекста дашборда (/api/dashboard/context) для демо. */
export function getDemoDashboardContext(userId: string): any {
  const isChairman = userId === DEMO_USER_ID;
  return {
    viewMode: isChairman ? "PPO_HEAD" : "MEMBER",
    isPPOHead: isChairman,
    permissions: isChairman
      ? { documents_view: true, documents_manage: true, appeals_view: true, appeals_manage: true, news_view: true, news_manage: true, members_view: true, members_manage: true, chats_view: true, chats_manage: true, discounts_view: true, reports_view: true, reports_manage: true, staff_view: true, staff_manage: true, settings_view: true, settings_manage: true }
      : {},
    isStaff: false,
    organization: { id: DEMO_ORG_ID, name: DEMO_NEWS_ORG_NAME },
  };
}

/** Статистика по обращениям для вкладки «Отчётность» (GET /api/ppo-head/tickets/statistics). */
export function getDemoTicketStatistics(): any {
  return {
    total: 15,
    byStatus: { PENDING: 3, IN_PROGRESS: 5, RESOLVED: 6, CLOSED: 1 },
    byType: { HR: 5, LEGAL: 4, OTHER: 6 },
    avgResolutionDays: 3.2,
    avgRating: 4.5,
    monthly: [
      { month: "2026-01", count: 4 },
      { month: "2026-02", count: 5 },
      { month: "2026-03", count: 6 },
    ],
  };
}
