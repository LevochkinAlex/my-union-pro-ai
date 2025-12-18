import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import Link from "next/link";
import NewsList from "@/components/dashboard/news/NewsList";
// import DiscountsScrollList from "@/components/dashboard/discounts/DiscountsScrollList"; // Не используется на главной
import MembershipBanner from "@/components/dashboard/MembershipBanner";
import UserCard from "@/components/dashboard/users/UserCard";
import PostsListClient from "@/components/posts/PostsListClient";
import { calculateProfileProgress } from "@/lib/profile-progress";

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);

  // ИСПРАВЛЕНО: Добавлено детальное логирование
  if (!session?.user?.id) {
    console.log("[dashboard/page] ⚠️ No session or user ID, redirecting to /login");
    redirect("/login");
  }

  const userId = session.user.id;
  if (!userId || typeof userId !== "string") {
    console.log("[dashboard/page] ⚠️ Invalid userId type:", typeof userId, "- redirecting to /login");
    redirect("/login");
  }
  
  console.log("[dashboard/page] ✅ Rendering dashboard for user:", userId);

  // ОПТИМИЗАЦИЯ: Выполняем все запросы параллельно
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

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
    
    // 2. Получаем свежие новости (последние 5)
    prisma.newsPost.findMany({
      where: {
        isPublished: true,
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
    
    // 4. Получаем новых пользователей (последние 10, зарегистрированных за последние 7 дней)
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

  if (currentUser) {
    membershipStatus = currentUser.membershipStatus;
    const progressResult = calculateProfileProgress(currentUser);
    profileProgress = progressResult.total;
    // Проверяем, что есть подписанные документы (отправленные на проверку)
    hasDocuments = currentUser.documents.some(
      (doc) => {
        // Если статус PENDING или APPROVED - документ точно отправлен
        if (doc.status === "PENDING" || doc.status === "APPROVED") {
          return true;
        }
        
        // Если статус SIGNED и есть signedFilePath - документ подписан и загружен
        if (doc.status === "SIGNED" && doc.signedFilePath) {
          return true;
        }
        
        return false;
      }
    );
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
      {/* Заголовок */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
          {greeting}, {userName}!
        </h1>
        <p className="mt-2 text-gray-600 dark:text-gray-400">
          Ваша панель управления профсоюзом МООП РЗ
        </p>
      </div>

      {/* Баннер членства */}
      {currentUser && (
        <MembershipBanner
          profileProgress={profileProgress}
          hasDocuments={hasDocuments}
          membershipStatus={membershipStatus}
        />
      )}

      {/* Основной контент */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-8 min-w-0">
        {/* Левая колонка: Лента постов (2/3 ширины на lg+) */}
        <div className="lg:col-span-2 space-y-6 min-w-0">
          {/* Посты от подписок */}
          {postsFromSubscriptions.length > 0 && (
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm p-4 lg:p-6 min-w-0">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg lg:text-xl font-semibold text-gray-900 dark:text-white">
                  Посты от подписок
                </h2>
                <Link
                  href="/dashboard/users"
                  className="text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
                >
                  Все подписки
                </Link>
              </div>
              <PostsListClient posts={postsFromSubscriptions} />
            </div>
          )}

          {/* Свежие новости */}
          {recentNews.length > 0 && (
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm p-4 lg:p-6 min-w-0">
              <div className="flex items-center justify-between mb-4 md:justify-start gap-4 w-full md:w-auto">
                <h2 className="text-lg lg:text-xl font-semibold text-gray-900 dark:text-white">
                  Свежие новости
                </h2>
                <Link
                  href="/dashboard/news"
                  className="text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 whitespace-nowrap"
                >
                  Все новости
                </Link>
              </div>
              <NewsList news={recentNews} />
            </div>
          )}

          {/* Скидки убраны для оптимизации производительности - доступны в разделе /dashboard/discounts */}
        </div>

        {/* Правая колонка: Сайдбар (1/3 ширины на lg+) */}
        <div className="space-y-6 min-w-0">

          {/* Новые участники */}
          {newUsers.length > 0 && (
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm p-4 lg:p-6 min-w-0">
              <div className="flex items-center justify-between gap-4 w-full">
                <h2 className="text-lg lg:text-xl font-semibold text-gray-900 dark:text-white">
                  Новые участники
                </h2>
                <Link
                  href="/dashboard/users"
                  className="text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 whitespace-nowrap"
                >
                  Все участники
                </Link>
              </div>
              <div className="mt-4 space-y-3">
                {newUsers.map((user) => (
                  <UserCard key={user.id} user={user} />
                ))}
              </div>
            </div>
          )}

          {/* Быстрые действия */}
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm p-4 lg:p-6 min-w-0">
            <h2 className="text-lg lg:text-xl font-semibold text-gray-900 dark:text-white mb-4 md:justify-start gap-4 w-full md:w-auto">
              Быстрые действия
            </h2>
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
                  Чат с AI-помощником
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
          </div>
        </div>
      </div>
    </div>
  );
}
