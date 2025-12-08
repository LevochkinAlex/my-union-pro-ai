import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import NewsList from "@/components/dashboard/news/NewsList";
import DiscountsScrollList from "@/components/dashboard/discounts/DiscountsScrollList";
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

  // Получаем список пользователей, на которых подписан текущий пользователь
  const subscriptions = await prisma.userSubscription.findMany({
    where: {
      subscriberId: userId,
    },
    select: {
      targetUserId: true,
    },
  });

  const subscribedUserIds = subscriptions.map((sub) => sub.targetUserId);

  // Получаем посты от подписок (последние 10)
  const postsFromSubscriptions = subscribedUserIds.length > 0
    ? await prisma.userPost.findMany({
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
      })
    : [];

  // Получаем свежие новости (последние 5)
  const recentNews = await prisma.newsPost.findMany({
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
      _count: {
        select: {
          likes: true,
          comments: true,
        },
      },
    },
  });

  // Получаем данные текущего пользователя для баннера
  let currentUser = null;
  let profileProgress = 0;
  let hasDocuments = false;
  let membershipStatus: "PENDING" | "APPROVED" | "REJECTED" | "PENDING_VERIFICATION" = "PENDING";

  try {
    currentUser = await prisma.user.findUnique({
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
    });

    // Вычисляем прогресс заполнения профиля
    if (currentUser) {
      membershipStatus = currentUser.membershipStatus;
      const progressResult = calculateProfileProgress(currentUser);
      profileProgress = progressResult.total;
      // Проверяем, что есть подписанные документы (отправленные на проверку)
      // Документ считается отправленным, если:
      // 1. Статус PENDING или APPROVED (уже отправлен на проверку)
      // 2. Статус SIGNED и есть signedFilePath (подписан и загружен)
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
  } catch (error) {
    console.error("[Dashboard] Error fetching current user:", error);
    // Продолжаем работу без данных пользователя
  }

  // Получаем новых пользователей (последние 10, зарегистрированных за последние 7 дней)
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const newUsers = await prisma.user.findMany({
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
  });

  // Получаем свежие скидки из BestBenefits API
  // Используем функцию fetchBestBenefitsDiscounts для получения реальных скидок
  let recentDiscounts: any[] = [];
  try {
    const { fetchBestBenefitsDiscounts } = await import("@/lib/best-benefits");
    const discountsResult = await fetchBestBenefitsDiscounts({
      limit: 10,
      page: 1,
    });
    recentDiscounts = discountsResult.discounts || [];
  } catch (error) {
    console.error("[Dashboard] Failed to fetch discounts:", error);
    // Если не удалось загрузить, оставляем пустой массив
  }

  return (
    <div className="space-y-8 min-w-0 w-full">
      {/* Заголовок */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
          Добро пожаловать, {session.user?.name || "Пользователь"}!
        </h1>
        <p className="mt-2 text-gray-600 dark:text-gray-400">
          Ваша панель управления профсоюзом МООП РЗ
        </p>
      </div>

      {/* Баннер для новых пользователей или тех, кто не заполнил профиль */}
      <MembershipBanner
        profileProgress={profileProgress}
        hasDocuments={hasDocuments}
        membershipStatus={membershipStatus}
        hasAdditionalInfo={currentUser ? Boolean(
          currentUser.aboutMe || 
          currentUser.hobbies || 
          currentUser.maritalStatus || 
          currentUser.hasChildren !== null ||
          currentUser.childrenInfo ||
          currentUser.spouseInfo
        ) : false}
        hasAwards={currentUser ? Boolean(currentUser.awards) : false}
      />

      {/* Посты от коллег */}
      <section className="overflow-hidden">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-2xl font-semibold text-gray-900 dark:text-white">
            Посты от коллег
          </h2>
          <a
            href="/dashboard/users"
            className="text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 text-sm font-medium"
          >
            Все коллеги →
          </a>
        </div>
        {subscribedUserIds.length === 0 ? (
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-8 text-center">
            <div className="flex flex-col items-center">
              <div className="h-16 w-16 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center mb-4">
                <svg
                  className="h-8 w-8 text-gray-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 4.354a4 4 0 110 5.292M15 19H9a6 6 0 016-6h0a6 6 0 016 6v1H9v-1a4 4 0 018 0z"
                  />
                </svg>
              </div>
              <p className="text-gray-500 dark:text-gray-400 font-medium mb-2">
                У вас пока нет подписок
              </p>
              <p className="text-gray-400 dark:text-gray-500 text-sm mb-4">
                Подпишитесь на коллег, чтобы видеть их посты
              </p>
              <a
                href="/dashboard/users"
                className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                Найти коллег
              </a>
            </div>
          </div>
        ) : postsFromSubscriptions.length > 0 ? (
          <PostsListClient
            posts={postsFromSubscriptions.map((post: any) => ({
              id: post.id,
              content: post.content,
              postType: post.postType,
              author: post.author,
              attachments: post.attachments,
              linkMetadata: post.linkMetadata,
              videoMetadata: post.videoMetadata,
              isLiked: post.likes.length > 0,
              likesCount: post._count.likes,
              commentsCount: post._count.comments,
              createdAt: post.createdAt.toISOString(),
              updatedAt: post.updatedAt.toISOString(),
            }))}
          />
        ) : (
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-8 text-center">
            <p className="text-gray-500 dark:text-gray-400">
              Пока нет постов от ваших подписок
            </p>
          </div>
        )}
      </section>

      {/* Свежие новости */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-2xl font-semibold text-gray-900 dark:text-white">
            Свежие новости
          </h2>
          <a
            href="/dashboard/news"
            className="text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 text-sm font-medium"
          >
            Все новости →
          </a>
        </div>
        <NewsList
          news={recentNews.map((news: any) => ({
            ...news,
            isLiked: false,
            polls: [],
          }))}
        />
      </section>

      {/* Новые пользователи */}
      <section className="min-w-0 overflow-hidden">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-2xl font-semibold text-gray-900 dark:text-white">
            Новые коллеги
          </h2>
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-500 dark:text-gray-400">
              За последние 7 дней
            </span>
            <a
              href="/dashboard/users"
              className="text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 text-sm font-medium"
            >
              Все коллеги →
            </a>
          </div>
        </div>
        {newUsers.length > 0 ? (
          <div 
            className="flex gap-4 pb-4 overflow-x-auto"
            style={{ 
              scrollbarWidth: 'none', 
              msOverflowStyle: 'none',
              WebkitOverflowScrolling: 'touch'
            }}
          >
            {newUsers.map((user) => (
              <div key={user.id} className="flex-none w-[280px] sm:w-[320px]">
                <UserCard user={user} />
              </div>
            ))}
          </div>
        ) : (
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm p-12 text-center">
            <div className="flex flex-col items-center">
              <div className="h-16 w-16 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center mb-4">
                <svg
                  className="h-8 w-8 text-gray-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 4.354a4 4 0 110 5.292M15 19H9a6 6 0 016-6h0a6 6 0 016 6v1H9v-1a4 4 0 018 0z"
                  />
                </svg>
              </div>
              <p className="text-gray-500 dark:text-gray-400 font-medium">
                За последние 7 дней новых участников не было
              </p>
            </div>
          </div>
        )}
      </section>

      {/* Свежие скидки */}
      <section className="overflow-hidden">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-2xl font-semibold text-gray-900 dark:text-white">
            Свежие скидки от партнеров
          </h2>
          <a
            href="/dashboard/discounts"
            className="text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 text-sm font-medium"
          >
            Все скидки →
          </a>
        </div>
        {recentDiscounts.length > 0 ? (
          <DiscountsScrollList discounts={recentDiscounts} />
        ) : (
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-8 text-center">
            <p className="text-gray-500 dark:text-gray-400">
              Пока нет доступных скидок
            </p>
            <a
              href="/dashboard/discounts"
              className="mt-4 inline-block text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 text-sm font-medium"
            >
              Посмотреть все скидки →
            </a>
          </div>
        )}
      </section>
    </div>
  );
}
