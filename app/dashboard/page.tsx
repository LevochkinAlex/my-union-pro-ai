import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import NewsList from "@/components/dashboard/news/NewsList";
import DiscountCard from "@/components/dashboard/discounts/DiscountCard";

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);

  if (!session) {
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
      avatarUrl: true,
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
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
            <div className="divide-y divide-gray-200 dark:divide-gray-700">
              {newUsers.map((user) => (
                <div
                  key={user.id}
                  className="flex items-center gap-4 p-4 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                >
                  {user.avatarUrl ? (
                    <img
                      src={user.avatarUrl}
                      alt={`${user.firstName} ${user.lastName}`}
                      className="h-12 w-12 rounded-full object-cover"
                    />
                  ) : (
                    <div className="h-12 w-12 rounded-full bg-blue-600 flex items-center justify-center text-white font-semibold">
                      {user.firstName?.charAt(0) || user.lastName?.charAt(0) || "U"}
                    </div>
                  )}
                  <div className="flex-1">
                    <p className="font-medium text-gray-900 dark:text-white">
                      {user.firstName} {user.lastName}
                    </p>
                    {user.organization?.name && (
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        {user.organization.name}
                      </p>
                    )}
                  </div>
                  <div className="text-sm text-gray-500 dark:text-gray-400">
                    {new Date(user.createdAt).toLocaleDateString("ru-RU", {
                      day: "numeric",
                      month: "short",
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-8 text-center">
            <p className="text-gray-500 dark:text-gray-400">
              За последние 7 дней новых участников не было
            </p>
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
