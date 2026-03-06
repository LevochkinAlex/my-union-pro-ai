"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { MembershipGate } from "@/components/MembershipGate";
import { DEMO_MEMBER_USER_ID } from "@/lib/demo-constants";
import CloseAppealModal from "@/components/appeals/CloseAppealModal";
import { Card, PageHeader, EmptyState, StatusBadge, Spinner, Tabs } from "@/components/ui";

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
} as const;

const PRIORITY_BADGE_COLORS: Record<string, "gray" | "blue" | "orange" | "red"> = {
  LOW: "gray",
  MEDIUM: "blue",
  HIGH: "orange",
  URGENT: "red",
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

  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | keyof typeof TICKET_STATUSES>("all");
  const [closeModalTicket, setCloseModalTicket] = useState<Ticket | null>(null);

  const [dashboardContext, setDashboardContext] = useState<{
    isChairman: boolean;
    isStaff: boolean;
    permissions: Record<string, boolean>;
  } | null>(null);
  const isDemoMember = session?.user?.id === DEMO_MEMBER_USER_ID;
  const forceMemberView = useMemo(() => searchParams.get("view") === "member", [searchParams]);
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
  const isAppealsInboxOutboxView = isChairmanRole || isStaffAppeals;
  const isMemberView = !isAppealsInboxOutboxView;

  const staffTab: "inbox" | "outgoing" =
    searchParams.get("tab") === "outgoing" ? "outgoing" : "inbox";

  useEffect(() => {
    if (!session?.user?.id || isDemoMember) return;
    fetch("/api/dashboard/context")
      .then((r) => r.json())
      .then(setDashboardContext)
      .catch(() => setDashboardContext({ isChairman: false, isStaff: false, permissions: {} }));
  }, [session?.user?.id, isDemoMember]);

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

  const contextPending = session && !isDemoMember && dashboardContext === null;
  if (contextPending) {
    return <Spinner fullPage />;
  }

  if (isLoading) {
    return <Spinner fullPage />;
  }

  const filterTabs = [
    { id: "all", label: "Все обращения", count: tickets.length || undefined },
    ...Object.entries(TICKET_STATUSES).map(([key, value]) => {
      const count = tickets.filter((t) => t.status === key).length;
      return { id: key, label: value.label, count: count || undefined };
    }),
  ];

  return (
    <MembershipGate
      showBlur={true}
      title="Обращения для членов профсоюза"
      description="Подавайте обращения и получайте помощь от профсоюза. Станьте членом для доступа."
    >
    <div className="space-y-6 sm:space-y-8">
      <PageHeader
        title={isAppealsInboxOutboxView ? "Обращения членов профсоюза" : "Мои обращения"}
        description={
          isAppealsInboxOutboxView
            ? staffTab === "outgoing"
              ? "Ваши личные обращения как члена профсоюза"
              : "Обращения от членов вашей организации"
            : "Отслеживайте статус ваших обращений к профсоюзу"
        }
        actions={
          <Link
            href="/dashboard/appeals/new"
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 sm:px-6 py-2 font-medium text-white transition-colors hover:bg-blue-700 whitespace-nowrap"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Создать обращение
          </Link>
        }
      />

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-200">
          {error}
        </div>
      )}

      <Tabs
        tabs={filterTabs}
        activeTab={filter}
        onChange={(tabId) => setFilter(tabId as "all" | keyof typeof TICKET_STATUSES)}
      />

      {tickets.length === 0 ? (
        <EmptyState
          icon={
            <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          }
          title="Обращений не найдено"
          description="Создайте новое обращение, чтобы получить помощь от профсоюза"
          action={
            <Link
              href="/dashboard/appeals/new"
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 sm:px-6 py-2 font-medium text-white transition-colors hover:bg-blue-700"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Создать обращение
            </Link>
          }
        />
      ) : (
        <div className="grid gap-2">
          {tickets.map((ticket) => {
            const creatorName = ticket.createdBy
              ? [ticket.createdBy.lastName, ticket.createdBy.firstName, ticket.createdBy.middleName].filter(Boolean).join(" ") || ticket.createdBy.email || "Пользователь"
              : "";
            const creatorInitials = ticket.createdBy
              ? [ticket.createdBy.firstName?.[0], ticket.createdBy.lastName?.[0]].filter(Boolean).join("").toUpperCase().slice(0, 2) || "?"
              : "?";
            const statusInfo = TICKET_STATUSES[ticket.status as keyof typeof TICKET_STATUSES];
            return (
              <Card
                key={ticket.id}
                hoverable
                noPadding
                className="px-3 py-2.5 flex items-center gap-3 min-w-0"
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
                  <StatusBadge color="purple" className="font-mono font-bold">
                    #{ticket.publicId}
                  </StatusBadge>
                  <StatusBadge color={statusInfo?.color ?? "gray"}>
                    {statusInfo?.label || ticket.status}
                  </StatusBadge>
                  <StatusBadge color={PRIORITY_BADGE_COLORS[ticket.priority] || "blue"}>
                    {PRIORITY_LABELS[ticket.priority as keyof typeof PRIORITY_LABELS] || ticket.priority}
                  </StatusBadge>
                  {ticket.isOverdue && ticket.status !== "CLOSED" && ticket.status !== "RESOLVED" && (
                    <StatusBadge color="red">Просрочено</StatusBadge>
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
              </Card>
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
