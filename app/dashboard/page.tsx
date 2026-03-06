import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import Link from "next/link";
import NewsList from "@/components/dashboard/news/NewsList";
import DiscountsPreview from "@/components/dashboard/discounts/DiscountsPreview";
import MembershipBanner from "@/components/dashboard/MembershipBanner";
import UserCard from "@/components/dashboard/users/UserCard";
import PostsListClient from "@/components/posts/PostsListClient";
import PPOHeadDashboard from "@/components/dashboard/PPOHeadDashboard";
import OrgHeadDashboard from "@/components/dashboard/OrgHeadDashboard";
import { calculateProfileProgress } from "@/lib/profile-progress";
import { hasBothApplicationsSubmitted } from "@/lib/documents-status";
import MembershipProtectedSection from "@/components/dashboard/MembershipProtectedSection";
import { Card, CardHeader, CardTitle, PageHeader, EmptyState } from "@/components/ui";
import { DEMO_USER_ID, DEMO_MEMBER_USER_ID, DEMO_NEWS_ORG_NAME } from "@/lib/demo-constants";
import {
  getDemoStats,
  getDemoAppeals,
  getDemoMembers,
  getDemoNewsFromOrg,
  getDemoNewUsers,
} from "@/lib/demo";

// Указываем, что страница динамическая (использует getServerSession)
export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  try {
    const session = await getServerSession(authOptions);

    // ИСПРАВЛЕНО: Добавлено детальное логирование
    if (!session?.user?.id) {
      console.log("[dashboard/page] No session or user ID, redirecting to /login");
      redirect("/login");
    }

    const userId = session.user.id;
    if (!userId || typeof userId !== "string") {
      console.log("[dashboard/page] Invalid userId type:", typeof userId, "- redirecting to /login");
      redirect("/login");
    }
    
    console.log("[dashboard/page] Rendering dashboard for user:", userId);

    // Демо-режим: не обращаемся к БД, подставляем данные председателя
    const isDemo = userId === DEMO_USER_ID;
    let userRole: {
      role: string;
      firstName: string | null;
      lastName: string | null;
      viewMode: string | null;
      isPPOHead: boolean;
      isMPOHead: boolean;
      isRPOHead: boolean;
      ppoHeadOrganizationId: string | null;
      mpoHeadOrganizationId: string | null;
      rpoHeadOrganizationId: string | null;
      organization: { id: string; name: string } | null;
      ppoHeadOrganization: { id: string; name: string } | null;
    } | null;

    if (isDemo) {
      userRole = {
        role: "PPO_HEAD",
        firstName: session.user.firstName ?? "Иван",
        lastName: session.user.lastName ?? "Еременко",
        viewMode: "PPO_HEAD",
        isPPOHead: true,
        isMPOHead: false,
        isRPOHead: false,
        ppoHeadOrganizationId: null,
        mpoHeadOrganizationId: null,
        rpoHeadOrganizationId: null,
        organization: { id: "demo-org", name: DEMO_NEWS_ORG_NAME },
        ppoHeadOrganization: { id: "demo-org", name: DEMO_NEWS_ORG_NAME },
      };
    } else if (userId === DEMO_MEMBER_USER_ID) {
      userRole = {
        role: "MEMBER",
        firstName: session.user.firstName ?? "Анна",
        lastName: session.user.lastName ?? "Сидорова",
        viewMode: "MEMBER",
        isPPOHead: false,
        isMPOHead: false,
        isRPOHead: false,
        ppoHeadOrganizationId: null,
        mpoHeadOrganizationId: null,
        rpoHeadOrganizationId: null,
        organization: { id: "demo-org", name: DEMO_NEWS_ORG_NAME },
        ppoHeadOrganization: null,
      };
    } else {
      try {
        if (!process.env.DATABASE_URL) {
          console.warn("[dashboard/page] DATABASE_URL не задан, используем данные из сессии");
          userRole = null;
        } else {
          userRole = await prisma.user.findUnique({
            where: { id: userId },
            select: {
              role: true,
              firstName: true,
              lastName: true,
              viewMode: true,
              isPPOHead: true,
              isMPOHead: true,
              isRPOHead: true,
              ppoHeadOrganizationId: true,
              mpoHeadOrganizationId: true,
              rpoHeadOrganizationId: true,
              organization: {
                select: {
                  id: true,
                  name: true,
                },
              },
              ppoHeadOrganization: {
                select: {
                  id: true,
                  name: true,
                },
              },
            },
          });
        }
      } catch (error) {
        console.error("[dashboard/page] Database query error:", error);
        userRole = null;
      }
    }
    
    const userRoleTyped = (userRole || null) as {
      role: string;
      firstName: string | null;
      lastName: string | null;
      viewMode: string | null;
      isPPOHead: boolean;
      isMPOHead: boolean;
      isRPOHead: boolean;
      ppoHeadOrganizationId: string | null;
      mpoHeadOrganizationId: string | null;
      rpoHeadOrganizationId: string | null;
      organization: { id: string; name: string } | null;
      ppoHeadOrganization: { id: string; name: string } | null;
    } | null;

  // Показываем дашборд председателя только когда выбран режим председателя ППО (в режиме «Участник» — дашборд участника)
  const showPPOHeadDashboard = userRole?.viewMode === "PPO_HEAD";
  
  // Определяем показывать ли дашборд МПО/РПО руководителя
  const showOrgHeadDashboard = 
    userRole?.viewMode === "MPO_HEAD" || 
    userRole?.viewMode === "RPO_HEAD";
  
  const ppoOrganization = userRole?.ppoHeadOrganization || userRole?.organization;

  // Если пользователь в режиме руководителя МПО/РПО, показываем специальный дашборд
  if (showOrgHeadDashboard) {
    return (
      <div className="space-y-6 p-0">
        <OrgHeadDashboard />
      </div>
    );
  }

  // Если пользователь в режиме Председателя ППО, показываем специальный дашборд
  if (showPPOHeadDashboard && ppoOrganization) {
    // Демо-режим: мок-данные без запросов к БД
    if (isDemo) {
      const stats = getDemoStats();
      const recentAppeals = getDemoAppeals();
      const recentMembers = getDemoMembers();
      const userName = [userRole?.firstName, userRole?.lastName].filter(Boolean).join(" ") || session.user?.name || "Председатель";
      return (
        <PPOHeadDashboard
          userName={userName}
          organizationName={ppoOrganization.name}
          stats={stats}
          recentAppeals={recentAppeals}
          recentMembers={recentMembers}
        />
      );
    }

    // Дата начала года для расчёта роста
    const startOfYear = new Date(new Date().getFullYear(), 0, 1);
    
    // Получаем статистику для Председателя
    const [
      pendingAppeals, 
      pendingMembers, 
      activeMembers, 
      totalNews, 
      totalDocuments, 
      recentAppeals, 
      recentMembers,
      membersAtYearStart,
      staffCount,
      resolvedOrClosedCount,
      totalWithOutcome,
    ] = await Promise.all([
      // Количество новых обращений
      prisma.ticket.count({
        where: {
          organizationId: ppoOrganization.id,
          status: "PENDING",
        },
      }),
      // Количество заявок на проверке
      prisma.user.count({
        where: {
          organizationId: ppoOrganization.id,
          membershipStatus: {
            in: ["DOCUMENTS_PENDING", "PROFILE_INCOMPLETE"],
          },
        },
      }),
      // Количество активных членов
      prisma.user.count({
        where: {
          organizationId: ppoOrganization.id,
          membershipStatus: "APPROVED",
        },
      }),
      // Количество новостей
      prisma.newsPost.count({
        where: {
          channel: {
            organizationId: ppoOrganization.id,
          },
        },
      }),
      // Количество документов
      prisma.document.count({
        where: {
          organizationId: ppoOrganization.id,
          type: {
            in: ["AGENDA", "PROTOCOL", "RESOLUTION", "PROTOCOL_EXTRACT"],
          },
        },
      }),
      // Последние обращения
      prisma.ticket.findMany({
        where: {
          organizationId: ppoOrganization.id,
        },
        orderBy: {
          createdAt: "desc",
        },
        take: 5,
        select: {
          id: true,
          publicId: true,
          title: true,
          status: true,
          createdAt: true,
          user: {
            select: {
              firstName: true,
              lastName: true,
            },
          },
        },
      }),
      // Последние заявки на вступление
      prisma.user.findMany({
        where: {
          organizationId: ppoOrganization.id,
          membershipStatus: {
            in: ["DOCUMENTS_PENDING", "PROFILE_INCOMPLETE"],
          },
        },
        orderBy: {
          createdAt: "desc",
        },
        take: 5,
        select: {
          id: true,
          firstName: true,
          lastName: true,
          createdAt: true,
        },
      }),
      // Количество членов на начало года (для расчёта роста)
      prisma.user.count({
        where: {
          organizationId: ppoOrganization.id,
          membershipStatus: "APPROVED",
          createdAt: { lt: startOfYear },
        },
      }),
      // Сотрудники в разделе «Управление сотрудниками» (staff) — число работников на дашборде
      prisma.organizationStaff.count({
        where: { organizationId: ppoOrganization.id },
      }),
      // Обращения с положительным исходом (решено / закрыто) — для удовлетворённости
      prisma.ticket.count({
        where: {
          organizationId: ppoOrganization.id,
          status: { in: ["RESOLVED", "CLOSED"] },
        },
      }),
      // Все обращения с итоговым решением (решено, закрыто, отклонено)
      prisma.ticket.count({
        where: {
          organizationId: ppoOrganization.id,
          status: { in: ["RESOLVED", "CLOSED", "REJECTED"] },
        },
      }),
    ]);

    // Число работников на дашборде — только по списку «Управление сотрудниками»
    const totalEmployees = staffCount;
    const growthYTD = membersAtYearStart > 0 
      ? Math.round(((activeMembers - membersAtYearStart) / membersAtYearStart) * 100) 
      : (activeMembers > 0 ? 100 : 0);
    // Удовлетворённость решениями обращений: % решённых/закрытых среди всех с итогом
    const appealSatisfactionPercent = totalWithOutcome > 0
      ? Math.round((resolvedOrClosedCount / totalWithOutcome) * 100)
      : 0;

    const userName = userRole.firstName || session.user?.name || "Председатель";

    return (
      <PPOHeadDashboard
        userName={userName}
        organizationName={ppoOrganization.name}
        stats={{
          pendingAppeals,
          pendingMembers,
          activeMembers,
          totalNews,
          totalDocuments,
          totalEmployees,
          appealSatisfactionPercent,
          growthYTD,
        }}
        recentAppeals={recentAppeals.map((a) => ({
          ...a,
          createdAt: a.createdAt.toISOString(),
        }))}
        recentMembers={recentMembers.map((m) => ({
          ...m,
          createdAt: m.createdAt.toISOString(),
        }))}
      />
    );
  }

  // Демо-режим члена: мок-данные без запросов к БД
  if (userId === DEMO_MEMBER_USER_ID) {
    const recentNews = await getDemoNewsFromOrg(5);
    const newUsers = getDemoNewUsers();
    const subscriptions: { targetUserId: string }[] = [];
    const postsFromSubscriptions: any[] = [];
    const currentUser = {
      id: DEMO_MEMBER_USER_ID,
      firstName: session.user.firstName ?? "Анна",
      lastName: session.user.lastName ?? "Сидорова",
      membershipStatus: "APPROVED" as const,
      organization: { id: "demo-org", name: DEMO_NEWS_ORG_NAME },
      documents: [],
      additionalInfo: null,
      aboutMe: null,
      hobbies: null,
      awards: null,
    };
    const profileProgress = 85;
    const hasDocuments = true;
    const hasAdditionalInfo = true;
    const hasAwards = false;
    const membershipStatus = "APPROVED" as const;
    const userName = [currentUser.firstName, currentUser.lastName].filter(Boolean).join(" ") || "Анна Сидорова";
    const greeting = "С возвращением";

    return (
      <div className="space-y-8 min-w-0 w-full">
        <PageHeader
          title={`${greeting}, ${userName}!`}
          description="Ваш личный кабинет члена Профсоюза"
        />

        {currentUser && (
          <MembershipBanner
            profileProgress={profileProgress}
            hasDocuments={hasDocuments}
            membershipStatus={membershipStatus}
            hasAdditionalInfo={hasAdditionalInfo}
            hasAwards={hasAwards}
          />
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-8 min-w-0">
          <div className="lg:col-span-2 space-y-6 min-w-0">
            <MembershipProtectedSection title="Новости для членов профсоюза">
              <Card className="min-w-0">
                <CardHeader className="mb-4">
                  <CardTitle as="h2">Свежие новости</CardTitle>
                  <Link
                    href="/dashboard/news"
                    className="text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 whitespace-nowrap"
                  >
                    Все новости
                  </Link>
                </CardHeader>
                {recentNews.length > 0 ? (
                  <NewsList news={recentNews} />
                ) : (
                  <EmptyState title="Пока нет новостей" className="border-0 bg-transparent dark:bg-transparent py-4" />
                )}
              </Card>
            </MembershipProtectedSection>

            <MembershipProtectedSection title="Скидки для членов профсоюза">
              <Card className="min-w-0">
                <CardHeader className="mb-4">
                  <CardTitle as="h2">Скидки и привилегии</CardTitle>
                  <Link
                    href="/dashboard/discounts"
                    className="text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 whitespace-nowrap"
                  >
                    Все скидки
                  </Link>
                </CardHeader>
                <DiscountsPreview />
              </Card>
            </MembershipProtectedSection>
          </div>

          <div className="space-y-6 min-w-0">
            <MembershipProtectedSection title="Коллеги для членов профсоюза">
              <Card className="min-w-0">
                <CardHeader>
                  <CardTitle as="h2">Новые коллеги</CardTitle>
                  <Link
                    href="/dashboard/users"
                    className="text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 whitespace-nowrap"
                  >
                    Все коллеги
                  </Link>
                </CardHeader>
                <div className="mt-4 space-y-3">
                  {newUsers.map((user) => (
                    <UserCard
                      key={user.id}
                      user={{ ...user, createdAt: new Date(user.createdAt) }}
                    />
                  ))}
                </div>
              </Card>
            </MembershipProtectedSection>

            <Card className="min-w-0">
              <CardHeader className="mb-4">
                <CardTitle as="h2">Быстрые действия</CardTitle>
              </CardHeader>
              <div className="space-y-2">
                <Link
                  href="/dashboard/documents"
                  className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                >
                  <svg className="h-5 w-5 text-gray-600 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <span className="text-sm text-gray-700 dark:text-gray-300">Мои документы</span>
                </Link>
                <Link
                  href="/dashboard/chat"
                  className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                >
                  <svg className="h-5 w-5 text-gray-600 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                  </svg>
                  <span className="text-sm text-gray-700 dark:text-gray-300">Мои чаты</span>
                </Link>
                <Link
                  href="/dashboard/discounts"
                  className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                >
                  <svg className="h-5 w-5 text-gray-600 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                  </svg>
                  <span className="text-sm text-gray-700 dark:text-gray-300">Скидки и привилегии</span>
                </Link>
              </div>
            </Card>
          </div>
        </div>
      </div>
    );
  }

  // ОПТИМИЗАЦИЯ: Выполняем все запросы параллельно
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  
  // Получаем организацию пользователя для фильтрации (учитываем председателей)
  const userOrganizationId =
    userRole?.ppoHeadOrganization?.id ||
    userRole?.organization?.id ||
    null;

  const [
    subscriptions,
    recentNews,
    currentUser,
    newUsers,
    recentDiscounts
  ] = await Promise.all([
    // 1. Получаем подписки
    prisma.userSubscription.findMany({
      where: {
        subscriberId: userId,
      },
      select: {
        targetUserId: true,
      },
    }),
    
    // 2. Получаем свежие новости (последние 5) - ТОЛЬКО из организации пользователя
    prisma.newsPost.findMany({
      where: {
        isPublished: true,
        channel: {
          organizationId: userOrganizationId || "___none___",
        },
      },
      orderBy: {
        createdAt: "desc",
      },
      take: 5,
      include: {
        author: {
          select: {
            firstName: true,
            lastName: true,
            avatarUrl: true,
          },
        },
        likes: {
          where: {
            userId: userId,
          },
          select: {
            id: true,
          },
        },
        _count: {
          select: {
            likes: true,
            comments: true,
          },
        },
      },
    }).then((posts) =>
      posts.map((post) => ({
        ...post,
        publishedAt: post.publishedAt?.toISOString() || null,
        createdAt: post.createdAt.toISOString(),
        updatedAt: post.updatedAt.toISOString(),
        isLiked: post.likes.length > 0,
        polls: [], // На главной странице опросы не показываем
      }))
    ),
    
    // 3. Получаем данные текущего пользователя для баннера
    prisma.user.findUnique({
      where: { id: userId },
      include: {
        organization: true,
        documents: {
          where: {
            type: {
              in: ["MEMBERSHIP_APPLICATION", "CONTRIBUTION_APPLICATION"],
            },
          },
          select: {
            id: true,
            type: true,
            status: true,
            signedFilePath: true,
            filePath: true,
          },
        },
      },
    }).catch((error) => {
      console.error("[Dashboard] Error fetching current user:", error);
      return null;
    }),
    
    // 4. Получаем новых пользователей (последние 10) - ТОЛЬКО из организации пользователя
    prisma.user.findMany({
      where: {
        id: {
          not: userId, // Исключаем текущего пользователя
        },
        createdAt: {
          gte: sevenDaysAgo,
        },
        role: {
          not: "SUPER_ADMIN",
        },
        // ВАЖНО: Показываем только одобренных членов профсоюза
        membershipStatus: "APPROVED",
        organizationId: userOrganizationId || "___none___",
      },
      orderBy: {
        createdAt: "desc",
      },
      take: 10,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        middleName: true,
        avatarUrl: true,
        jobTitle: true,
        profession: true,
        organization: {
          select: {
            name: true,
          },
        },
        createdAt: true,
      },
    }),
    
    // 5. Скидки убраны с главной страницы для оптимизации производительности
    Promise.resolve([])
  ]);

  const subscribedUserIds = subscriptions.map((sub) => sub.targetUserId);

  // Получаем посты от подписок (последние 10) - только если есть подписки
  let postsFromSubscriptions: any[] = [];
  if (subscribedUserIds.length > 0) {
    postsFromSubscriptions = await prisma.userPost.findMany({
      where: {
        authorId: {
          in: subscribedUserIds,
        },
      },
      include: {
        author: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            middleName: true,
            avatarUrl: true,
            jobTitle: true,
            profession: true,
            organization: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
        attachments: {
          orderBy: {
            createdAt: "asc",
          },
        },
        likes: {
          where: {
            userId: userId,
          },
          select: {
            id: true,
          },
        },
        _count: {
          select: {
            likes: true,
            comments: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
      take: 10,
    });
  }

  // Вычисляем прогресс заполнения профиля
  let profileProgress = 0;
  let hasDocuments = false;
  let membershipStatus: "PENDING" | "APPROVED" | "REJECTED" | "PENDING_VERIFICATION" = "PENDING";
  let hasAdditionalInfo = false;
  let hasAwards = false;

  if (currentUser) {
    membershipStatus = currentUser.membershipStatus;
    const progressResult = calculateProfileProgress(currentUser);
    profileProgress = progressResult.total;
    hasDocuments = hasBothApplicationsSubmitted(currentUser.documents);
    
    // Проверяем заполнение дополнительной информации
    hasAdditionalInfo = !!(
      currentUser.additionalInfo || 
      currentUser.aboutMe || 
      currentUser.hobbies
    );
    
    // Проверяем наличие наград
    if (currentUser.awards) {
      try {
        const awards = JSON.parse(currentUser.awards);
        hasAwards = Array.isArray(awards) && awards.length > 0;
      } catch {
        hasAwards = false;
      }
    }
  }

  // Формируем имя пользователя из ФИО
  const getUserName = () => {
    if (currentUser?.firstName) {
      // Если есть имя, используем его
      return currentUser.firstName;
    }
    // Если нет имени, пытаемся взять из session
    return session.user?.name || "Пользователь";
  };

  const userName = getUserName();
  // Определяем, первый ли это визит (если есть firstName, значит пользователь уже был и заполнил профиль)
  const isReturningUser = !!currentUser?.firstName;
  const greeting = isReturningUser ? "С возвращением" : "Добро пожаловать";

  return (
    <div className="space-y-8 min-w-0 w-full">
      <PageHeader
        title={`${greeting}, ${userName}!`}
        description="Ваш личный кабинет члена Профсоюза"
      />

      {currentUser && (
        <MembershipBanner
          profileProgress={profileProgress}
          hasDocuments={hasDocuments}
          membershipStatus={membershipStatus}
          hasAdditionalInfo={hasAdditionalInfo}
          hasAwards={hasAwards}
        />
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-8 min-w-0">
        <div className="lg:col-span-2 space-y-6 min-w-0">
          <MembershipProtectedSection title="Публикации от коллег">
          {postsFromSubscriptions.length > 0 && (
            <Card className="min-w-0">
              <CardHeader className="mb-4">
                <CardTitle as="h2">Публикации от коллег</CardTitle>
                <Link
                  href="/dashboard/users"
                  className="text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
                >
                  Все подписки
                </Link>
              </CardHeader>
              <PostsListClient posts={postsFromSubscriptions} />
            </Card>
          )}
          </MembershipProtectedSection>

          <MembershipProtectedSection title="Новости для членов профсоюза">
          <Card className="min-w-0">
            <CardHeader className="mb-4">
              <CardTitle as="h2">Свежие новости</CardTitle>
              <Link
                href="/dashboard/news"
                className="text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 whitespace-nowrap"
              >
                Все новости
              </Link>
            </CardHeader>
            {recentNews.length > 0 ? (
              <NewsList news={recentNews} />
            ) : (
              <EmptyState title="Пока нет новостей в вашей организации" className="border-0 bg-transparent dark:bg-transparent py-4" />
            )}
          </Card>
          </MembershipProtectedSection>

          <MembershipProtectedSection title="Скидки для членов профсоюза">
          <Card className="min-w-0">
            <CardHeader className="mb-4">
              <CardTitle as="h2">Скидки и привилегии</CardTitle>
              <Link
                href="/dashboard/discounts"
                className="text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 whitespace-nowrap"
              >
                Все скидки
              </Link>
            </CardHeader>
            <DiscountsPreview />
          </Card>
          </MembershipProtectedSection>
        </div>

        <div className="space-y-6 min-w-0">
          <MembershipProtectedSection title="Коллеги для членов профсоюза">
          <Card className="min-w-0">
            <CardHeader>
              <CardTitle as="h2">Новые коллеги</CardTitle>
              <Link
                href="/dashboard/users"
                className="text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 whitespace-nowrap"
              >
                Все коллеги
              </Link>
            </CardHeader>
            {newUsers.length > 0 ? (
              <div className="mt-4 space-y-3">
                {newUsers.map((user) => (
                  <UserCard key={user.id} user={user} />
                ))}
              </div>
            ) : (
              <EmptyState title="Пока нет новых коллег в вашей организации" className="border-0 bg-transparent dark:bg-transparent py-4 mt-4" />
            )}
          </Card>
          </MembershipProtectedSection>

          <Card className="min-w-0">
            <CardHeader className="mb-4">
              <CardTitle as="h2">Быстрые действия</CardTitle>
            </CardHeader>
            <div className="space-y-2">
              <Link
                href="/dashboard/documents"
                className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                <svg
                  className="h-5 w-5 text-gray-600 dark:text-gray-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                  />
                </svg>
                <span className="text-sm text-gray-700 dark:text-gray-300">
                  Мои документы
                </span>
              </Link>
              <Link
                href="/dashboard/chat"
                className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                <svg
                  className="h-5 w-5 text-gray-600 dark:text-gray-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                  />
                </svg>
                <span className="text-sm text-gray-700 dark:text-gray-300">
                  Мои чаты
                </span>
              </Link>
              <Link
                href="/dashboard/discounts"
                className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                <svg
                  className="h-5 w-5 text-gray-600 dark:text-gray-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z"
                  />
                </svg>
                <span className="text-sm text-gray-700 dark:text-gray-300">
                  Скидки и привилегии
                </span>
              </Link>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
  } catch (error: any) {
    // NEXT_REDIRECT - это нормальное исключение Next.js, не ошибка
    if (error?.message === 'NEXT_REDIRECT' || error?.digest?.startsWith('NEXT_REDIRECT')) {
      throw error; // Пробрасываем редирект дальше
    }
    
    console.error("[dashboard/page] Fatal error:", error);
    
    // Только для реальных ошибок проверяем сессию еще раз
    try {
      const session = await getServerSession(authOptions);
      if (!session) {
        redirect("/login?error=session_error");
      }
    } catch (sessionError) {
      redirect("/login?error=session_error");
    }
    
    // Если сессия есть, но все равно ошибка - пробрасываем дальше
    throw error;
  }
}
