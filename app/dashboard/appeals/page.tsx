"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { MembershipGate } from "@/components/MembershipGate";
import { DEMO_MEMBER_USER_ID } from "@/lib/demo-constants";
import CloseAppealModal from "@/components/appeals/CloseAppealModal";

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
    avatarUrl?: string | null;
  };
  isOwner?: boolean;
  isOverdue?: boolean;
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
  const [closeModalTicket, setCloseModalTicket] = useState<Ticket | null>(null);

  // Контекст дашборда: председатель или сотрудник с правом appeals_view видит интерфейс ППО
  const [dashboardContext, setDashboardContext] = useState<{
    isChairman: boolean;
    isStaff: boolean;
    permissions: Record<string, boolean>;
  } | null>(null);
  const isDemoMember = session?.user?.id === DEMO_MEMBER_USER_ID;
  const forceMemberView = useMemo(() => searchParams.get("view") === "member", [searchParams]);
  // Председатель ППО (по роли, в любом режиме) или сотрудник/зам с правом обращений — вид «Входящие / Исходящие»
  const isChairmanRole =
    !forceMemberView &&
    !isDemoMember &&
    ((session?.user as { isPPOHead?: boolean })?.isPPOHead === true || session?.user?.role === "PPO_HEAD");
  const isStaffAppeals =
    !forceMemberView &&
    !isDemoMember &&
    !isChairmanRole &&
    dashboardContext?.isStaff === true &&
    dashboardContext?.permissions?.appeals_view === true;
  // Председатель (в любом режиме) и зам/сотрудник с appeals_view видят Входящие (все в организацию) + Исходящие (свои)
  const isAppealsInboxOutboxView = isChairmanRole || isStaffAppeals;
  // Участник без роли — только «Мои обращения» и создание
  const isMemberView = !isAppealsInboxOutboxView;

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

  // Председатель/сотрудник: при заходе без tab подставляем ?tab=incoming
  useEffect(() => {
    if (!isAppealsInboxOutboxView || !searchParams) return;
    if (!searchParams.get("tab")) {
      router.replace("/dashboard/appeals?tab=incoming");
    }
  }, [isAppealsInboxOutboxView, searchParams, router]);

  const loadTickets = async (view?: "inbox" | "outgoing") => {
    try {
      setIsLoading(true);
      setError(null);
      const viewParam = view ?? (isAppealsInboxOutboxView ? staffTab : null);
      const params = new URLSearchParams();
      if (filter !== "all") params.set("status", filter);
      if (viewParam) params.set("view", viewParam);
      const url = `/api/tickets${params.toString() ? `?${params.toString()}` : ""}`;
      // #region agent log
      fetch('http://127.0.0.1:7519/ingest/3c4942b8-26ef-4efc-b536-f006e7e1cd4b',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'3d28b8'},body:JSON.stringify({sessionId:'3d28b8',location:'appeals/page.tsx:loadTickets',message:'Load tickets request',data:{isAppealsInboxOutboxView,staffTab,viewParam,url,filter},hypothesisId:'D',timestamp:Date.now()})}).catch(()=>{});
      // #endregion
      const response = await fetch(url, { cache: "no-store" });
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
    if (isMemberView || isAppealsInboxOutboxView) {
      loadTickets(isAppealsInboxOutboxView ? staffTab : undefined);
    }
  }, [filter, isMemberView, isAppealsInboxOutboxView, staffTab]);

  // Обновление списка при возврате на вкладку (например после закрытия обращения из чата)
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === "visible" && (isMemberView || isAppealsInboxOutboxView)) {
        loadTickets(isAppealsInboxOutboxView ? staffTab : undefined);
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [isMemberView, isAppealsInboxOutboxView, staffTab]);

  const handleCloseAppeal = useCallback(async (rating: number, comment: string) => {
    if (!closeModalTicket) return;
    try {
      const res = await fetch(`/api/tickets/${closeModalTicket.publicId}/close`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rating, comment }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d?.error || "Ошибка закрытия");
      }
      setCloseModalTicket(null);
      loadTickets(isAppealsInboxOutboxView ? staffTab : undefined);
    } catch (e) {
      console.error(e);
      throw e;
    }
  }, [closeModalTicket, isAppealsInboxOutboxView, staffTab]);

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
            {isAppealsInboxOutboxView ? "Обращения членов профсоюза" : "Мои обращения"}
          </h1>
          <p className="mt-2 text-sm sm:text-base text-gray-600 dark:text-gray-400">
            {isAppealsInboxOutboxView
              ? staffTab === "outgoing"
                ? "Ваши личные обращения как члена профсоюза"
                : "Обращения от членов вашей организации"
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
        <div className="grid gap-2">
          {tickets.map((ticket) => {
            const creatorName = ticket.createdBy
              ? [ticket.createdBy.lastName, ticket.createdBy.firstName, ticket.createdBy.middleName].filter(Boolean).join(" ") || ticket.createdBy.email || "Пользователь"
              : "";
            const creatorInitials = ticket.createdBy
              ? [ticket.createdBy.firstName?.[0], ticket.createdBy.lastName?.[0]].filter(Boolean).join("").toUpperCase().slice(0, 2) || "?"
              : "?";
            return (
              <div
                key={ticket.id}
                className="rounded-lg border border-gray-200 bg-white px-3 py-2.5 shadow-sm transition-shadow hover:shadow-md dark:border-gray-700 dark:bg-gray-800 flex items-center gap-3 min-w-0"
              >
                <div className="flex-shrink-0 w-10 h-10 rounded-full bg-gray-200 dark:bg-gray-600 flex items-center justify-center overflow-hidden">
                  {ticket.createdBy?.avatarUrl ? (
                    <img
                      src={ticket.createdBy.avatarUrl}
                      alt=""
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <span className="text-sm font-medium text-gray-600 dark:text-gray-300">{creatorInitials}</span>
                  )}
                </div>
                <div className="flex-1 min-w-0 flex flex-wrap items-center gap-x-2 gap-y-1">
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-white truncate">
                    {ticket.title}
                  </h3>
                  <span className="inline-flex px-1.5 py-0.5 rounded text-xs font-mono font-bold text-purple-700 bg-purple-100 dark:text-purple-300 dark:bg-purple-900/30 shrink-0">
                    #{ticket.publicId}
                  </span>
                  <span className={`inline-flex px-1.5 py-0.5 rounded text-xs font-medium shrink-0 ${getStatusColor(ticket.status)}`}>
                    {TICKET_STATUSES[ticket.status as keyof typeof TICKET_STATUSES]?.label || ticket.status}
                  </span>
                  <span className={`inline-flex px-1.5 py-0.5 rounded text-xs font-medium shrink-0 ${PRIORITY_COLORS[ticket.priority as keyof typeof PRIORITY_COLORS] || PRIORITY_COLORS.MEDIUM}`}>
                    {PRIORITY_LABELS[ticket.priority as keyof typeof PRIORITY_LABELS] || ticket.priority}
                  </span>
                  {ticket.isOverdue && ticket.status !== "CLOSED" && ticket.status !== "RESOLVED" && (
                    <span className="inline-flex px-1.5 py-0.5 rounded text-xs font-medium shrink-0 bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300">
                      Просрочено
                    </span>
                  )}
                </div>
                <div className="flex-shrink-0 flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
                  {ticket.createdBy && !ticket.isOwner && (
                    <span className="hidden sm:inline truncate max-w-[120px]" title={creatorName}>
                      {creatorName}
                    </span>
                  )}
                  <span>{new Date(ticket.createdAt).toLocaleDateString("ru-RU")}</span>
                </div>
                <div className="flex-shrink-0 flex items-center gap-1">
                  {ticket.chatId ? (
                    <Link
                      href={`/dashboard/chat?chatId=${ticket.chatId}&ticketId=${ticket.id}`}
                      className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-green-600 text-white hover:bg-green-700 transition-colors"
                      title="Открыть чат обращения"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                      </svg>
                    </Link>
                  ) : null}
                  {ticket.isOwner && ticket.status !== "CLOSED" && ticket.status !== "RESOLVED" && (
                    <button
                      onClick={(e) => { e.stopPropagation(); setCloseModalTicket(ticket); }}
                      className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-gray-600 text-white hover:bg-gray-700 transition-colors"
                      title="Закрыть обращение"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  )}
                  <button
                    onClick={() => router.push(`/dashboard/appeals/${ticket.id}`)}
                    className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors"
                    title="Подробнее"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
      {closeModalTicket && (
        <CloseAppealModal
          isOpen={!!closeModalTicket}
          onClose={() => setCloseModalTicket(null)}
          onConfirm={handleCloseAppeal}
          ticketId={closeModalTicket.id}
          ticketPublicId={closeModalTicket.publicId}
        />
      )}
    </div>
    </MembershipGate>
  );
}