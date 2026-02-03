"use client";

import { useState, useEffect, useMemo } from "react";
import { useSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import PPOHeadAppealsPage from "./ppo-head/page";
import { MembershipGate } from "@/components/MembershipGate";
import { DEMO_MEMBER_USER_ID } from "@/lib/demo-constants";

interface Ticket {
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
  createdBy?: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    middleName: string | null;
    email: string | null;
  };
  isOwner?: boolean;
}

const TICKET_TYPES = {
  LEGAL: "Юридическое обращение",
  ACCOUNTING: "Бухгалтерское обращение",
  TECHNICAL: "Техническая поддержка",
  HR: "Кадровые вопросы",
  OTHER: "Прочее",
};

const TICKET_STATUSES = {
  PENDING: { label: "Ожидание", color: "yellow" },
  IN_PROGRESS: { label: "В работе", color: "blue" },
  RESOLVED: { label: "Решено", color: "green" },
  REJECTED: { label: "Отклонено", color: "red" },
  CLOSED: { label: "Закрыто", color: "gray" },
};

const PRIORITY_COLORS = {
  LOW: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200",
  MEDIUM: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  HIGH: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
  URGENT: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
};

const PRIORITY_LABELS = {
  LOW: "Низкая",
  MEDIUM: "Средняя",
  HIGH: "Высокая",
  URGENT: "Срочная",
};

export default function AppealsPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  
  // Все hooks должны быть объявлены ДО любых условных return
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | keyof typeof TICKET_STATUSES>("all");
  
  // Контекст дашборда: председатель или сотрудник с правом appeals_view видит интерфейс ППО
  const [dashboardContext, setDashboardContext] = useState<{
    isChairman: boolean;
    isStaff: boolean;
    permissions: Record<string, boolean>;
  } | null>(null);
  const isDemoMember = session?.user?.id === DEMO_MEMBER_USER_ID;
  const forceMemberView = useMemo(() => searchParams.get("view") === "member", [searchParams]);
  // Только председатель (в режиме ППО) видит полный интерфейс председателя
  const isChairman =
    !forceMemberView &&
    !isDemoMember &&
    (dashboardContext?.isChairman === true ||
      ((session?.user as { viewMode?: string })?.viewMode === "PPO_HEAD" &&
        (session?.user?.role === "PPO_HEAD" && (session?.user as { isPPOHead?: boolean })?.isPPOHead === true)));
  // Сотрудник выборного органа (не председатель) с правом просмотра обращений — Входящие/Исходящие
  const isStaffAppeals =
    !forceMemberView &&
    !isDemoMember &&
    !isChairman &&
    dashboardContext?.isStaff === true &&
    dashboardContext?.permissions?.appeals_view === true;
  // Участник без роли председателя/сотрудника — только «Мои обращения» и создание
  const isMemberView = !isChairman && !isStaffAppeals;

  // Раздел у сотрудника задаётся из сайдбара (URL): tab=incoming | tab=outgoing
  const staffTab: "inbox" | "outgoing" =
    searchParams.get("tab") === "outgoing" ? "outgoing" : "inbox";

  useEffect(() => {
    if (!session?.user?.id || isDemoMember) return;
    fetch("/api/dashboard/context")
      .then((r) => r.json())
      .then(setDashboardContext)
      .catch(() => setDashboardContext({ isChairman: false, isStaff: false, permissions: {} }));
  }, [session?.user?.id, isDemoMember]);

  // Сотрудник: при заходе без tab подставляем ?tab=incoming, чтобы в сайдбаре подсвечивался «Входящие»
  useEffect(() => {
    if (!isStaffAppeals || !searchParams) return;
    if (!searchParams.get("tab")) {
      router.replace("/dashboard/appeals?tab=incoming");
    }
  }, [isStaffAppeals, searchParams, router]);

  const loadTickets = async (view?: "inbox" | "outgoing") => {
    try {
      setIsLoading(true);
      setError(null);
      const viewParam = view ?? (isStaffAppeals ? staffTab : null);
      const params = new URLSearchParams();
      if (filter !== "all") params.set("status", filter);
      if (viewParam) params.set("view", viewParam);
      const url = `/api/tickets${params.toString() ? `?${params.toString()}` : ""}`;
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error("Ошибка загрузки обращений");
      }
      const data = await response.json();
      setTickets(data.tickets || []);
    } catch (err) {
      console.error("Error loading tickets:", err);
      setError(err instanceof Error ? err.message : "Не удалось загрузить обращения");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isMemberView || isStaffAppeals) {
      loadTickets(isStaffAppeals ? staffTab : undefined);
    }
  }, [filter, isMemberView, isStaffAppeals, staffTab]);

  // Пока контекст не загружен (председатель/сотрудник) — не показывать контент членам, чтобы не мелькало
  const contextPending = session && !isDemoMember && dashboardContext === null;
  if (contextPending) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <div className="mb-4 inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-blue-500 border-t-transparent"></div>
          <p className="text-gray-600 dark:text-gray-400">Загрузка...</p>
        </div>
      </div>
    );
  }

  // Председатель видит полный интерфейс ППО (все обращения организации, смена статусов и т.д.)
  if (isChairman) {
    return <PPOHeadAppealsPage />;
  }

  const getStatusColor = (status: string) => {
    const statusInfo = TICKET_STATUSES[status as keyof typeof TICKET_STATUSES];
    const colorMap = {
      yellow: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
      blue: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
      green: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
      red: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
      gray: "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200",
    };
    return colorMap[statusInfo?.color || "gray"] || colorMap.gray;
  };

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <div className="mb-4 inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-blue-500 border-r-transparent"></div>
          <p className="text-gray-600 dark:text-gray-400">Загрузка обращений...</p>
        </div>
      </div>
    );
  }

  return (
    <MembershipGate
      showBlur={true}
      title="Обращения для членов профсоюза"
      description="Подавайте обращения и получайте помощь от профсоюза. Станьте членом для доступа."
    >
    <div className="space-y-6 sm:space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white">
            {isStaffAppeals ? "Обращения членов профсоюза" : "Мои обращения"}
          </h1>
          <p className="mt-2 text-sm sm:text-base text-gray-600 dark:text-gray-400">
            {isStaffAppeals
              ? "Входящие от членов и сотрудников организации, исходящие — ваши обращения председателю"
              : "Отслеживайте статус ваших обращений к профсоюзу"}
          </p>
        </div>
        <Link
          href="/dashboard/appeals/new"
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 sm:px-6 py-2 font-medium text-white transition-colors hover:bg-blue-700 whitespace-nowrap flex-shrink-0"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          <span className="whitespace-nowrap">Создать обращение</span>
        </Link>
      </div>

      {error && (
        <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-200">
          {error}
        </div>
      )}

      {/* Бейджи фильтров по статусу (как в Документах) */}
      <div className="flex flex-wrap items-center gap-2">
        {[
          { value: "all" as const, label: "Все обращения" },
          ...Object.entries(TICKET_STATUSES).map(([key, value]) => ({
            value: key as keyof typeof TICKET_STATUSES,
            label: value.label,
          })),
        ].map(({ value, label }) => {
          const count =
            value === "all"
              ? tickets.length
              : tickets.filter((t) => t.status === value).length;
          return (
            <button
              key={value}
              type="button"
              onClick={() => setFilter(value)}
              className={`rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
                filter === value
                  ? "border-blue-500 bg-blue-500 text-white dark:border-blue-400 dark:bg-blue-600 dark:text-white"
                  : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
              }`}
            >
              {label}
              {count > 0 && (
                <span className="ml-1.5 rounded-full bg-white/20 px-1.5 py-0.5 text-xs">
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {tickets.length === 0 ? (
        <div className="rounded-lg border-2 border-dashed border-gray-300 bg-white p-6 sm:p-12 text-center dark:border-gray-700 dark:bg-gray-800">
          <svg
            className="mx-auto h-10 w-10 sm:h-12 sm:w-12 text-gray-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <h3 className="mt-4 text-base sm:text-lg font-medium text-gray-900 dark:text-white">
            Обращений не найдено
          </h3>
          <p className="mt-2 text-xs sm:text-sm text-gray-500 dark:text-gray-400">
            Создайте новое обращение, чтобы получить помощь от профсоюза
          </p>
          <Link
            href="/dashboard/appeals/new"
            className="mt-4 inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 sm:px-6 py-2 text-sm sm:text-base font-medium text-white transition-colors hover:bg-blue-700"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Создать обращение
          </Link>
        </div>
      ) : (
        <div className="grid gap-4">
          {tickets.map((ticket) => (
            <div
              key={ticket.id}
              className="rounded-lg border border-gray-200 bg-white p-4 sm:p-6 shadow-sm transition-shadow hover:shadow-md dark:border-gray-700 dark:bg-gray-800"
            >
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                    <h3 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-white break-words">
                      {ticket.title}
                    </h3>
                    <span className="inline-flex items-center px-2 sm:px-2.5 py-0.5 rounded-full text-xs font-mono font-bold text-purple-700 bg-purple-100 dark:text-purple-300 dark:bg-purple-900/30 whitespace-nowrap flex-shrink-0">
                      #{ticket.publicId}
                    </span>
                    <span className={`inline-flex items-center px-2 sm:px-2.5 py-0.5 rounded-full text-xs font-medium whitespace-nowrap flex-shrink-0 ${getStatusColor(ticket.status)}`}>
                      {TICKET_STATUSES[ticket.status as keyof typeof TICKET_STATUSES]?.label || ticket.status}
                    </span>
                    <span className={`inline-flex items-center px-2 sm:px-2.5 py-0.5 rounded-full text-xs font-medium whitespace-nowrap flex-shrink-0 ${PRIORITY_COLORS[ticket.priority as keyof typeof PRIORITY_COLORS] || PRIORITY_COLORS.MEDIUM}`}>
                      {PRIORITY_LABELS[ticket.priority as keyof typeof PRIORITY_LABELS] || ticket.priority}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                    {TICKET_TYPES[ticket.type as keyof typeof TICKET_TYPES] || ticket.type}
                  </p>
                  {ticket.createdBy && !ticket.isOwner && (
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                      От: {[ticket.createdBy.lastName, ticket.createdBy.firstName, ticket.createdBy.middleName].filter(Boolean).join(" ") || ticket.createdBy.email || "Пользователь"}
                    </p>
                  )}
                  <div className="mt-3 sm:mt-4 flex flex-col gap-1 sm:flex-row sm:flex-wrap sm:gap-2 sm:gap-4 text-xs text-gray-500 dark:text-gray-400">
                    <span className="whitespace-nowrap">Создано: {new Date(ticket.createdAt).toLocaleDateString("ru-RU")}</span>
                    {ticket.attachmentsCount > 0 && (
                      <>
                        <span className="hidden sm:inline">•</span>
                        <span className="whitespace-nowrap">Файлов: {ticket.attachmentsCount}</span>
                      </>
                    )}
                    {ticket.commentsCount > 0 && (
                      <>
                        <span className="hidden sm:inline">•</span>
                        <span className="whitespace-nowrap">Комментариев: {ticket.commentsCount}</span>
                      </>
                    )}
                    {ticket.lastCommentAt && (
                      <>
                        <span className="hidden sm:inline">•</span>
                        <span className="whitespace-nowrap">Последний ответ: {new Date(ticket.lastCommentAt).toLocaleDateString("ru-RU")}</span>
                      </>
                    )}
                  </div>
                </div>
                <div className="flex-shrink-0 sm:ml-4 flex gap-2">
                  {ticket.chatId && (
                    <Link
                      href={`/dashboard/chat?chatId=${ticket.chatId}&ticketId=${ticket.id}`}
                      className="inline-flex items-center justify-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-green-700"
                      title="Открыть чат обращения"
                    >
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                      </svg>
                      <span className="hidden sm:inline">Чат</span>
                    </Link>
                  )}
                  <button
                    onClick={() => router.push(`/dashboard/appeals/${ticket.id}`)}
                    className="inline-flex w-full sm:w-auto items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
                  >
                    <svg
                      className="h-4 w-4 flex-shrink-0"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                      />
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                      />
                    </svg>
                    <span>Подробнее</span>
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
    </MembershipGate>
  );
}