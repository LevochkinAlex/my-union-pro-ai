import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import NewsList from "@/components/dashboard/news/NewsList";
import DiscountCard from "@/components/dashboard/discounts/DiscountCard";
import MembershipBanner from "@/components/dashboard/MembershipBanner";
import UserCard from "@/components/dashboard/users/UserCard";
import { calculateProfileProgress } from "@/lib/profile-progress";

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    redirect("/login");
  }

  const userId = session.user.id;
  if (!userId || typeof userId !== "string") {
    redirect("/login");
  }

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
        },
      },
    });

    // Вычисляем прогресс заполнения профиля
    if (currentUser) {
      membershipStatus = currentUser.membershipStatus;
      const progressResult = calculateProfileProgress(currentUser);
      profileProgress = progressResult.total;
      hasDocuments = (currentUser.documents.length || 0) > 0;
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
    <div className="space-y-8">
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
      {membershipStatus !== "APPROVED" && (
        <MembershipBanner
          profileProgress={profileProgress}
          hasDocuments={hasDocuments}
          membershipStatus={membershipStatus}
        />
      )}

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
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-2xl font-semibold text-gray-900 dark:text-white">
            Новые участники
          </h2>
          <span className="text-sm text-gray-500 dark:text-gray-400">
            За последние 7 дней
          </span>
        </div>
        {newUsers.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {newUsers.map((user) => (
              <UserCard key={user.id} user={user} />
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
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-2xl font-semibold text-gray-900 dark:text-white">
            Свежие скидки BestBenefits
          </h2>
          <a
            href="/dashboard/discounts"
            className="text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 text-sm font-medium"
          >
            Все скидки →
          </a>
        </div>
        {recentDiscounts.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {recentDiscounts.map((discount) => (
              <DiscountCard key={discount.id} discount={discount} />
            ))}
          </div>
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
