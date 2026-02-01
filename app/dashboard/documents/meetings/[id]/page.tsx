"use client";

import { useState, useEffect, use, useRef, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { alertSuccess, alertError, confirm } from "@/lib/alert";
import Link from "next/link";
import { Modal } from "@/components/ui/modal";

interface Participant {
  id: string;
  role: string;
  attendance: string;
  canVote: boolean;
  hasVoted: boolean;
  user: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    middleName: string | null;
    jobTitle: string | null;
  } | null;
  externalName: string | null;
  externalPosition: string | null;
}

interface AgendaItem {
  id: string;
  orderNumber: number;
  title: string;
  description: string | null;
  heardText: string | null;
  speakerId: string | null;
  speakerName: string | null;
  speakerPosition: string | null;
  speaker: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    middleName: string | null;
  } | null;
  resolutionText: string | null;
  decidedText: string | null;
  votesFor: number;
  votesAgainst: number;
  votesAbstained: number;
  votingCompleted: boolean;
  isApproved: boolean | null;
}

interface Meeting {
  id: string;
  type: string;
  status: string;
  format: string;
  number: string;
  title: string | null;
  scheduledDate: string;
  scheduledTime: string | null;
  location: string | null;
  organization: {
    id: string;
    name: string;
    chairmanName: string | null;
  };
  agendaDocument: {
    id: string;
    regNumber: string | null;
    status: string;
    filePath: string | null;
    title: string;
  } | null;
  protocolDocument: {
    id: string;
    regNumber: string | null;
    status: string;
    filePath: string | null;
    title: string;
  } | null;
  participants: Participant[];
  agendaItems: AgendaItem[];
  resolutions: any[];
  extracts: any[];
}

const MEETING_STATUS_LABELS: Record<string, string> = {
  DRAFT: "Черновик",
  SCHEDULED: "Запланировано",
  IN_PROGRESS: "Идёт заседание",
  VOTING: "Голосование",
  COMPLETED: "Завершено",
  CANCELLED: "Отменено",
};

const DOC_STATUS_LABELS: Record<string, string> = {
  DRAFT: "Черновик",
  GENERATED: "Сформирован",
  PENDING_REVIEW: "На рассмотрении",
  PENDING_APPROVAL: "На согласовании",
  COMPLETED: "Утверждён",
};

const DOC_STATUS_COLORS: Record<string, string> = {
  DRAFT: "bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-300",
  GENERATED: "bg-blue-200 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  PENDING_REVIEW: "bg-yellow-200 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
  PENDING_APPROVAL: "bg-orange-200 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400",
  COMPLETED: "bg-green-200 text-green-800 dark:bg-green-900/30 dark:text-green-400",
};

export default function MeetingDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const resolvedParams = use(params);
  const { data: session } = useSession();
  const router = useRouter();
  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"info" | "agenda" | "protocol" | "resolutions" | "extracts">("info");
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Состояние для редактирования протокола
  const [protocolData, setProtocolData] = useState<Record<string, any>>({});
  const [members, setMembers] = useState<any[]>([]);
  const [isSendingNotifications, setIsSendingNotifications] = useState(false);
  const [isSendingForApproval, setIsSendingForApproval] = useState(false);
  const [isApproving, setIsApproving] = useState(false);
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string | null>(null);
  const tabsScrollRef = useRef<HTMLDivElement>(null);
  const [tabsScrollLeftHint, setTabsScrollLeftHint] = useState(false);
  const [tabsScrollRightHint, setTabsScrollRightHint] = useState(false);

  const updateTabsScrollHint = useCallback(() => {
    const el = tabsScrollRef.current;
    if (!el) return;
    const canScrollLeft = el.scrollLeft > 2;
    const canScrollRight = el.scrollLeft < el.scrollWidth - el.clientWidth - 2;
    setTabsScrollLeftHint(canScrollLeft);
    setTabsScrollRightHint(canScrollRight);
  }, []);

  const scrollTabs = useCallback((direction: "left" | "right") => {
    const el = tabsScrollRef.current;
    if (!el) return;
    const step = Math.max(200, el.clientWidth * 0.6);
    el.scrollBy({ left: direction === "left" ? -step : step, behavior: "smooth" });
  }, []);

  useEffect(() => {
    loadMeeting();
    loadMembers();
  }, [resolvedParams.id]);

  useEffect(() => {
    updateTabsScrollHint();
    const el = tabsScrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver(updateTabsScrollHint);
    ro.observe(el);
    return () => ro.disconnect();
  }, [meeting, updateTabsScrollHint]);

  const loadMeeting = async () => {
    try {
      setIsLoading(true);
      const response = await fetch(`/api/ppo-head/meetings/${resolvedParams.id}`);
      if (response.ok) {
        const data = await response.json();
        setMeeting(data.meeting);
        
        // Инициализация данных протокола из agendaItems
        const initialData: Record<string, any> = {};
        data.meeting.agendaItems.forEach((item: AgendaItem) => {
          initialData[item.id] = {
            heardText: item.heardText || item.title,
            speakerId: item.speakerId || "",
            speakerName: item.speakerName || "",
            resolutionText: item.resolutionText || "",
            decidedText: item.decidedText || "",
            votesFor: item.votesFor || 0,
            votesAgainst: item.votesAgainst || 0,
            votesAbstained: item.votesAbstained || 0,
          };
        });
        setProtocolData(initialData);
      }
    } catch (error) {
      console.error("Ошибка загрузки заседания:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const loadMembers = async () => {
    try {
      const response = await fetch("/api/ppo-head/members?status=approved");
      if (response.ok) {
        const data = await response.json();
        setMembers(data.members || []);
      }
    } catch (error) {
      console.error("Ошибка загрузки членов:", error);
    }
  };

  const handleGenerateDocument = async (documentType: "AGENDA" | "PROTOCOL") => {
    try {
      setIsGenerating(true);
      
      // Если это протокол, сначала сохраняем данные
      if (documentType === "PROTOCOL") {
        await saveProtocolData();
      }

      const response = await fetch(`/api/ppo-head/meetings/${resolvedParams.id}/generate-document`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentType }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Ошибка генерации");
      }

      const data = await response.json();
      alertSuccess(data.message || "Документ сформирован!");
      loadMeeting();
    } catch (error) {
      alertError(error instanceof Error ? error.message : "Не удалось сформировать документ");
    } finally {
      setIsGenerating(false);
    }
  };

  const saveProtocolData = async () => {
    try {
      setIsSaving(true);
      
      const items = Object.entries(protocolData).map(([id, data]) => ({
        id,
        ...data,
      }));

      const response = await fetch(`/api/ppo-head/meetings/${resolvedParams.id}/agenda`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items }),
      });

      if (!response.ok) {
        throw new Error("Ошибка сохранения");
      }

      alertSuccess("Данные сохранены");
    } catch (error) {
      alertError("Не удалось сохранить данные");
    } finally {
      setIsSaving(false);
    }
  };

  // Вычисляем количество участников с правом голоса
  const maxVotes = meeting?.participants?.filter(p => p.canVote).length || 0;

  const updateProtocolItem = (itemId: string, field: string, value: any) => {
    setProtocolData(prev => {
      const currentData = prev[itemId] || {};
      const newData = { ...currentData, [field]: value };
      
      // Валидация для полей голосования
      if (field === "votesFor" || field === "votesAgainst" || field === "votesAbstained") {
        const votesFor = field === "votesFor" ? (parseInt(value) || 0) : (currentData.votesFor || 0);
        const votesAgainst = field === "votesAgainst" ? (parseInt(value) || 0) : (currentData.votesAgainst || 0);
        const votesAbstained = field === "votesAbstained" ? (parseInt(value) || 0) : (currentData.votesAbstained || 0);
        
        const total = votesFor + votesAgainst + votesAbstained;
        
        // Если сумма превышает максимум, корректируем значение
        if (total > maxVotes) {
          const excess = total - maxVotes;
          if (field === "votesFor") {
            newData.votesFor = Math.max(0, votesFor - excess);
          } else if (field === "votesAgainst") {
            newData.votesAgainst = Math.max(0, votesAgainst - excess);
          } else if (field === "votesAbstained") {
            newData.votesAbstained = Math.max(0, votesAbstained - excess);
          }
        }
        
        // Гарантируем, что значения не отрицательные
        newData.votesFor = Math.max(0, newData.votesFor || 0);
        newData.votesAgainst = Math.max(0, newData.votesAgainst || 0);
        newData.votesAbstained = Math.max(0, newData.votesAbstained || 0);
      }
      
      return {
        ...prev,
        [itemId]: newData,
      };
    });
  };

  const getParticipantName = (p: Participant) => {
    if (p.user) {
      return [p.user.lastName, p.user.firstName, p.user.middleName].filter(Boolean).join(" ");
    }
    return p.externalName || "";
  };

  const getMemberName = (member: any) => {
    return [member.lastName, member.firstName, member.middleName].filter(Boolean).join(" ");
  };

  // Отправка повестки для ознакомления участникам
  const handleSendForReview = async () => {
    if (!meeting) return;
    
    try {
      setIsSendingNotifications(true);
      const response = await fetch(`/api/ppo-head/meetings/${resolvedParams.id}/notify-participants`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "agenda_review" }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Ошибка отправки");
      }

      const data = await response.json();
      alertSuccess(data.message || `Уведомления отправлены ${data.sentCount} участникам`);
      loadMeeting();
    } catch (error) {
      alertError(error instanceof Error ? error.message : "Не удалось отправить уведомления");
    } finally {
      setIsSendingNotifications(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <div className="mb-4 inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-blue-500 border-r-transparent"></div>
          <p className="text-gray-600 dark:text-gray-400">Загрузка...</p>
        </div>
      </div>
    );
  }

  if (!meeting) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-600 dark:text-gray-400">Заседание не найдено</p>
        <Link href="/dashboard/documents/meetings" className="mt-4 text-blue-600 hover:underline">
          ← Назад к списку
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Шапка */}
      <div className="flex items-start justify-between">
        <div>
          <Link
            href="/dashboard/documents/meetings"
            className="mb-2 inline-flex items-center text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400"
          >
            ← Назад к заседаниям
          </Link>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            Заседание профкома №{meeting.number}
          </h1>
          <p className="mt-1 text-gray-600 dark:text-gray-400">
            {new Date(meeting.scheduledDate).toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" })}
            {meeting.scheduledTime && ` в ${meeting.scheduledTime}`}
            {meeting.location && ` • ${meeting.location}`}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className={`rounded-full px-3 py-1 text-sm font-medium ${
            meeting.status === "COMPLETED" ? "bg-green-200 text-green-800 dark:bg-green-900/30 dark:text-green-400" :
            meeting.status === "IN_PROGRESS" ? "bg-yellow-200 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400" :
            "bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-300"
          }`}>
            {MEETING_STATUS_LABELS[meeting.status]}
          </span>
          {meeting.status === "DRAFT" && (
            <button
              onClick={async () => {
                const confirmed = await confirm(
                  "Вы уверены, что хотите удалить это заседание? Это действие нельзя отменить.",
                  "Подтвердите удаление"
                );
                if (!confirmed) {
                  return;
                }
                try {
                  const response = await fetch(`/api/ppo-head/meetings/${resolvedParams.id}`, {
                    method: "DELETE",
                  });
                  if (!response.ok) {
                    const error = await response.json();
                    throw new Error(error.error || "Ошибка удаления");
                  }
                  alertSuccess("Заседание удалено");
                  router.push("/dashboard/documents/meetings");
                } catch (error) {
                  alertError(error instanceof Error ? error.message : "Не удалось удалить заседание");
                }
              }}
              className="rounded-lg border border-red-300 bg-red-50 px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-100 dark:border-red-700 dark:bg-red-900/30 dark:text-red-400 dark:hover:bg-red-900/50"
            >
              Удалить
            </button>
          )}
        </div>
      </div>

      {/* Навигация по документам — одна строка, скролл стрелками или тачем */}
      <nav
        className="mt-6 border-b border-gray-200 dark:border-gray-700"
        aria-label="Разделы заседания"
      >
        <div className="flex items-stretch">
          {/* Стрелка влево — показать, когда есть куда скроллить влево */}
          {tabsScrollLeftHint && (
            <button
              type="button"
              onClick={() => scrollTabs("left")}
              className="shrink-0 self-center flex items-center justify-center w-10 h-10 rounded-full border border-transparent bg-white/70 dark:bg-gray-800/70 backdrop-blur-md text-gray-600 dark:text-gray-400 hover:bg-white/90 hover:text-gray-900 dark:hover:bg-gray-700/90 dark:hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-inset"
              aria-label="Прокрутить табы влево"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
          )}
          <div
            ref={tabsScrollRef}
            onScroll={updateTabsScrollHint}
            className="flex-1 min-w-0 overflow-x-auto overflow-y-hidden -mb-px"
            style={{ scrollbarWidth: "thin", WebkitOverflowScrolling: "touch" }}
          >
            <ul className="flex flex-nowrap gap-0 -mb-px min-w-max">
          {[
            {
              id: "info",
              label: "Информация",
              icon: (
                <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              ),
              badge: null,
            },
            {
              id: "agenda",
              label: "Повестка",
              icon: (
                <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              ),
              badge: meeting.agendaDocument?.regNumber ?? (meeting.agendaDocument ? DOC_STATUS_LABELS[meeting.agendaDocument.status] : null),
            },
            {
              id: "protocol",
              label: "Протокол",
              icon: (
                <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
              ),
              badge: meeting.protocolDocument?.regNumber ?? (meeting.protocolDocument ? DOC_STATUS_LABELS[meeting.protocolDocument.status] : null),
            },
            {
              id: "resolutions",
              label: "Постановления",
              icon: (
                <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                </svg>
              ),
              badge: meeting.resolutions.length ? `${meeting.resolutions.length}` : null,
            },
            {
              id: "extracts",
              label: "Выписки",
              icon: (
                <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              ),
              badge: meeting.extracts.length ? `${meeting.extracts.length}` : null,
            },
          ].map((tab) => (
            <li key={tab.id}>
              <button
                type="button"
                onClick={() => setActiveTab(tab.id as typeof activeTab)}
                aria-current={activeTab === tab.id ? "page" : undefined}
                className={`
                  flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors
                  focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 rounded-t-md
                  ${activeTab === tab.id
                    ? "border-blue-600 text-blue-600 dark:border-blue-400 dark:text-blue-400"
                    : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300 dark:hover:border-gray-600"
                  }
                `}
              >
                {tab.icon}
                <span>{tab.label}</span>
                {tab.badge && (
                  <span
                    className={`
                      shrink-0 rounded-full px-2 py-0.5 text-xs font-medium
                      ${activeTab === tab.id
                        ? "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300"
                        : "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400"
                      }
                    `}
                  >
                    {tab.badge}
                  </span>
                )}
              </button>
            </li>
          ))}
            </ul>
          </div>
          {/* Стрелка вправо — показать, когда есть куда скроллить вправо */}
          {tabsScrollRightHint && (
            <button
              type="button"
              onClick={() => scrollTabs("right")}
              className="shrink-0 self-center flex items-center justify-center w-10 h-10 rounded-full border border-transparent bg-white/70 dark:bg-gray-800/70 backdrop-blur-md text-gray-600 dark:text-gray-400 hover:bg-white/90 hover:text-gray-900 dark:hover:bg-gray-700/90 dark:hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-inset"
              aria-label="Прокрутить табы вправо"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          )}
        </div>
        {/* Контекст текущего раздела — одна строка вместо четырёх карточек */}
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-gray-500 dark:text-gray-400">
          {activeTab === "agenda" && (
            meeting.agendaDocument ? (
              <>
                <span className="font-medium text-gray-700 dark:text-gray-300">
                  {meeting.agendaDocument.regNumber ?? "Повестка дня"}
                </span>
                <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${DOC_STATUS_COLORS[meeting.agendaDocument.status] || DOC_STATUS_COLORS.DRAFT}`}>
                  {DOC_STATUS_LABELS[meeting.agendaDocument.status] || "Черновик"}
                </span>
              </>
            ) : (
              <span>Повестка не создана</span>
            )
          )}
          {activeTab === "protocol" && (
            meeting.protocolDocument ? (
              <>
                <span className="font-medium text-gray-700 dark:text-gray-300">
                  {meeting.protocolDocument.regNumber ?? "Протокол"}
                </span>
                <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${DOC_STATUS_COLORS[meeting.protocolDocument.status] || DOC_STATUS_COLORS.DRAFT}`}>
                  {DOC_STATUS_LABELS[meeting.protocolDocument.status] || "Черновик"}
                </span>
              </>
            ) : (
              <span>Протокол не создан</span>
            )
          )}
          {activeTab === "resolutions" && (
            <span>
              {meeting.resolutions.length === 0
                ? "Постановлений пока нет"
                : `${meeting.resolutions.length} ${meeting.resolutions.length === 1 ? "постановление" : meeting.resolutions.length < 5 ? "постановления" : "постановлений"}`
              }
            </span>
          )}
          {activeTab === "extracts" && (
            <span>
              {meeting.extracts.length === 0
                ? "Выписок пока нет"
                : `${meeting.extracts.length} ${meeting.extracts.length === 1 ? "выписка" : meeting.extracts.length < 5 ? "выписки" : "выписок"}`
              }
            </span>
          )}
        </div>
      </nav>

      {/* Контент табов */}
      {activeTab === "info" && (
        <div className="flex flex-col gap-6">
          {/* Информация о заседании */}
          <div className="rounded-lg border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
            <h3 className="mb-4 font-semibold text-gray-900 dark:text-white">Общая информация</h3>
            <dl className="space-y-3 text-sm">
              <div>
                <dt className="text-gray-500 dark:text-gray-400">Организация</dt>
                <dd className="font-medium">{meeting.organization.name}</dd>
              </div>
              <div>
                <dt className="text-gray-500 dark:text-gray-400">Председатель</dt>
                <dd className="font-medium">{meeting.organization.chairmanName || "—"}</dd>
              </div>
              {meeting.title && (
                <div>
                  <dt className="text-gray-500 dark:text-gray-400">Тема</dt>
                  <dd className="font-medium">{meeting.title}</dd>
                </div>
              )}
              <div>
                <dt className="text-gray-500 dark:text-gray-400">Формат</dt>
                <dd className="font-medium">
                  {meeting.format === "OFFLINE" ? "Очное" : meeting.format === "ONLINE" ? "Онлайн" : "Смешанное"}
                </dd>
              </div>
            </dl>
          </div>

          {/* Участники */}
          <div className="rounded-lg border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-semibold text-gray-900 dark:text-white">
                Участники ({meeting.participants.length})
              </h3>
              <button
                onClick={async () => {
                  try {
                    const participantsWithUserId = meeting.participants.filter(p => p.user?.id);
                    await Promise.all(
                      participantsWithUserId.map(p =>
                        fetch(`/api/ppo-head/meetings/${resolvedParams.id}/participants/${p.id}`, {
                          method: "PATCH",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ attendance: "PRESENT" }),
                        })
                      )
                    );
                    alertSuccess("Все участники отмечены как присутствующие");
                    loadMeeting();
                  } catch (error) {
                    alertError("Ошибка обновления статусов");
                  }
                }}
                className="text-xs rounded-lg border border-blue-300 bg-blue-50 px-3 py-1.5 text-blue-700 hover:bg-blue-100 dark:border-blue-700 dark:bg-blue-900/30 dark:text-blue-300 dark:hover:bg-blue-900/50"
              >
                Отметить всех присутствующими
              </button>
            </div>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {meeting.participants.map((p) => (
                <div key={p.id} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <span className={`h-2 w-2 rounded-full ${
                      p.attendance === "PRESENT" ? "bg-green-500" :
                      p.attendance === "ABSENT" ? "bg-red-500" : "bg-gray-300"
                    }`} />
                    <span>{getParticipantName(p)}</span>
                    {p.role === "CHAIRMAN" && (
                      <span className="text-xs text-blue-600">(Председатель)</span>
                    )}
                    {p.role === "SECRETARY" && (
                      <span className="text-xs text-purple-600">(Секретарь)</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {p.canVote && (
                      <span className="text-xs text-gray-500">Голосует</span>
                    )}
                    <select
                      value={p.attendance}
                      onChange={async (e) => {
                        try {
                          const response = await fetch(
                            `/api/ppo-head/meetings/${resolvedParams.id}/participants/${p.id}`,
                            {
                              method: "PATCH",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ attendance: e.target.value }),
                            }
                          );
                          if (response.ok) {
                            loadMeeting();
                          } else {
                            const error = await response.json();
                            alertError(error.error || "Ошибка обновления статуса");
                          }
                        } catch (error) {
                          alertError("Ошибка обновления статуса");
                        }
                      }}
                      className="text-xs rounded border border-gray-300 px-2 py-1 dark:border-gray-600 dark:bg-gray-700"
                    >
                      <option value="INVITED">Приглашён</option>
                      <option value="CONFIRMED">Подтвердил</option>
                      <option value="PRESENT">Присутствует</option>
                      <option value="ABSENT">Отсутствует</option>
                      <option value="EXCUSED">Отсутствует (уваж. причина)</option>
                    </select>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {activeTab === "agenda" && (
        <div className="space-y-6">
          {/* Документ повестки */}
          {meeting.agendaDocument ? (
            <div className="rounded-lg border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                    Повестка дня {meeting.agendaDocument.regNumber}
                  </h3>
                  <span className={`mt-2 inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${DOC_STATUS_COLORS[meeting.agendaDocument.status] || DOC_STATUS_COLORS.DRAFT}`}>
                    {DOC_STATUS_LABELS[meeting.agendaDocument.status] || "Черновик"}
                  </span>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                {meeting.agendaDocument.filePath && (
                  <>
                    <button
                      onClick={() => setPdfPreviewUrl(meeting.agendaDocument!.filePath!)}
                      className="inline-flex items-center justify-center gap-2 rounded-lg border border-blue-300 bg-blue-50 px-4 py-2 text-sm font-medium text-blue-700 transition-colors hover:bg-blue-100 dark:border-blue-700 dark:bg-blue-900/30 dark:text-blue-300 dark:hover:bg-blue-900/50"
                    >
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </svg>
                      Просмотреть PDF
                    </button>
                    <a
                      href={meeting.agendaDocument.filePath}
                      download
                      className="inline-flex items-center justify-center gap-2 rounded-lg border border-gray-300 bg-gray-50 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
                    >
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                      </svg>
                      Скачать
                    </a>
                  </>
                )}
                {meeting.agendaDocument.status === "DRAFT" && (
                  <button
                    onClick={async () => {
                      try {
                        setIsSendingForApproval(true);
                        const response = await fetch(`/api/ppo-head/meetings/${resolvedParams.id}/documents/${meeting.agendaDocument!.id}/send-for-approval`, {
                          method: "POST",
                        });

                        if (!response.ok) {
                          const error = await response.json();
                          throw new Error(error.error || "Ошибка отправки");
                        }

                        const data = await response.json();
                        alertSuccess(data.message || "Документ отправлен на согласование");
                        loadMeeting();
                      } catch (error) {
                        alertError(error instanceof Error ? error.message : "Не удалось отправить на согласование");
                      } finally {
                        setIsSendingForApproval(false);
                      }
                    }}
                    disabled={isSendingForApproval}
                    className="inline-flex items-center justify-center gap-2 rounded-lg border border-orange-300 bg-orange-50 px-4 py-2 text-sm font-medium text-orange-700 transition-colors hover:bg-orange-100 disabled:opacity-50 disabled:cursor-not-allowed dark:border-orange-700 dark:bg-orange-900/30 dark:text-orange-300 dark:hover:bg-orange-900/50"
                  >
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                    </svg>
                    {isSendingForApproval ? "Отправка..." : "Отправить на согласование"}
                  </button>
                )}
                {meeting.agendaDocument.status === "PENDING_APPROVAL" && (
                  <button
                    onClick={async () => {
                      try {
                        setIsApproving(true);
                        const response = await fetch(`/api/ppo-head/meetings/${resolvedParams.id}/documents/${meeting.agendaDocument!.id}/final-approve`, {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                        });

                        if (!response.ok) {
                          const error = await response.json();
                          throw new Error(error.error || "Ошибка утверждения");
                        }

                        const data = await response.json();
                        alertSuccess(data.message || "Документ утвержден");
                        loadMeeting();
                      } catch (error) {
                        alertError(error instanceof Error ? error.message : "Не удалось утвердить документ");
                      } finally {
                        setIsApproving(false);
                      }
                    }}
                    disabled={isApproving}
                    className="inline-flex items-center justify-center gap-2 rounded-lg border border-green-300 bg-green-50 px-4 py-2 text-sm font-medium text-green-700 transition-colors hover:bg-green-100 disabled:opacity-50 disabled:cursor-not-allowed dark:border-green-700 dark:bg-green-900/30 dark:text-green-300 dark:hover:bg-green-900/50"
                  >
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    {isApproving ? "Утверждение..." : "Утвердить документ"}
                  </button>
                )}
                <button
                  onClick={handleSendForReview}
                  disabled={isSendingNotifications || meeting.agendaDocument.status !== "COMPLETED"}
                  className="inline-flex items-center justify-center gap-2 rounded-lg border border-green-300 bg-green-50 px-4 py-2 text-sm font-medium text-green-700 transition-colors hover:bg-green-100 disabled:opacity-50 disabled:cursor-not-allowed dark:border-green-700 dark:bg-green-900/30 dark:text-green-300 dark:hover:bg-green-900/50"
                  title={meeting.agendaDocument.status !== "COMPLETED" ? "Сначала утвердите документ" : "Отправить участникам для ознакомления"}
                >
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                  </svg>
                  {isSendingNotifications ? "Отправка..." : "Разослать участникам"}
                </button>
              </div>
            </div>
          ) : (
            <div className="rounded-lg border-2 border-dashed border-gray-300 bg-white p-8 text-center dark:border-gray-700 dark:bg-gray-800">
              <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <h3 className="mt-2 text-sm font-medium text-gray-900 dark:text-white">Повестка дня не создана</h3>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                Сформируйте повестку дня на основе пунктов повестки
              </p>
              {meeting.agendaItems.length > 0 && (
                <button
                  onClick={() => handleGenerateDocument("AGENDA")}
                  disabled={isGenerating}
                  className="mt-4 rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {isGenerating ? "Формирование..." : "Сформировать повестку дня"}
                </button>
              )}
            </div>
          )}

          {/* Пункты повестки */}
          <div className="rounded-lg border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
            <h3 className="mb-4 text-lg font-semibold text-gray-900 dark:text-white">
              Пункты повестки дня ({meeting.agendaItems.length})
            </h3>
            {meeting.agendaItems.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                Нет пунктов в повестке
              </div>
            ) : (
              <div className="space-y-3">
                {meeting.agendaItems.map((item) => (
                  <div
                    key={item.id}
                    className="rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800/50"
                  >
                    <div className="flex items-start gap-3">
                      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-200 text-sm font-medium text-blue-800 dark:bg-blue-900/30 dark:text-blue-400">
                        {item.orderNumber}
                      </span>
                      <div className="flex-1">
                        <h4 className="font-medium text-gray-900 dark:text-white">{item.title}</h4>
                        {item.description && (
                          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">{item.description}</p>
                        )}
                        {(item.speakerName || item.speaker) && (
                          <p className="mt-2 text-sm text-gray-500">
                            <strong>Докладчик:</strong>{" "}
                            {item.speakerName || [item.speaker?.lastName, item.speaker?.firstName].filter(Boolean).join(" ")}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === "protocol" && (
        <div className="space-y-6">
          {/* Документ протокола */}
          {meeting.protocolDocument ? (
            <div className="rounded-lg border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                    Протокол {meeting.protocolDocument.regNumber}
                  </h3>
                  <span className={`mt-2 inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${DOC_STATUS_COLORS[meeting.protocolDocument.status] || DOC_STATUS_COLORS.DRAFT}`}>
                    {DOC_STATUS_LABELS[meeting.protocolDocument.status] || "Черновик"}
                  </span>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                {meeting.protocolDocument.filePath && (
                  <>
                    <button
                      onClick={() => setPdfPreviewUrl(meeting.protocolDocument!.filePath!)}
                      className="inline-flex items-center justify-center gap-2 rounded-lg border border-blue-300 bg-blue-50 px-4 py-2 text-sm font-medium text-blue-700 transition-colors hover:bg-blue-100 dark:border-blue-700 dark:bg-blue-900/30 dark:text-blue-300 dark:hover:bg-blue-900/50"
                    >
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </svg>
                      Просмотреть PDF
                    </button>
                    <a
                      href={meeting.protocolDocument.filePath}
                      download
                      className="inline-flex items-center justify-center gap-2 rounded-lg border border-gray-300 bg-gray-50 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
                    >
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                      </svg>
                      Скачать
                    </a>
                  </>
                )}
                {meeting.protocolDocument.status === "DRAFT" && (
                  <button
                    onClick={async () => {
                      try {
                        setIsSendingForApproval(true);
                        const response = await fetch(`/api/ppo-head/meetings/${resolvedParams.id}/documents/${meeting.protocolDocument!.id}/send-for-approval`, {
                          method: "POST",
                        });

                        if (!response.ok) {
                          const error = await response.json();
                          throw new Error(error.error || "Ошибка отправки");
                        }

                        const data = await response.json();
                        alertSuccess(data.message || "Документ отправлен на согласование");
                        loadMeeting();
                      } catch (error) {
                        alertError(error instanceof Error ? error.message : "Не удалось отправить на согласование");
                      } finally {
                        setIsSendingForApproval(false);
                      }
                    }}
                    disabled={isSendingForApproval}
                    className="inline-flex items-center justify-center gap-2 rounded-lg border border-orange-300 bg-orange-50 px-4 py-2 text-sm font-medium text-orange-700 transition-colors hover:bg-orange-100 disabled:opacity-50 disabled:cursor-not-allowed dark:border-orange-700 dark:bg-orange-900/30 dark:text-orange-300 dark:hover:bg-orange-900/50"
                  >
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                    </svg>
                    {isSendingForApproval ? "Отправка..." : "Отправить на согласование"}
                  </button>
                )}
                {meeting.protocolDocument.status === "PENDING_APPROVAL" && (
                  <button
                    onClick={async () => {
                      try {
                        setIsApproving(true);
                        const response = await fetch(`/api/ppo-head/meetings/${resolvedParams.id}/documents/${meeting.protocolDocument!.id}/final-approve`, {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                        });

                        if (!response.ok) {
                          const error = await response.json();
                          throw new Error(error.error || "Ошибка утверждения");
                        }

                        const data = await response.json();
                        alertSuccess(data.message || "Документ утвержден");
                        loadMeeting();
                      } catch (error) {
                        alertError(error instanceof Error ? error.message : "Не удалось утвердить документ");
                      } finally {
                        setIsApproving(false);
                      }
                    }}
                    disabled={isApproving}
                    className="inline-flex items-center justify-center gap-2 rounded-lg border border-green-300 bg-green-50 px-4 py-2 text-sm font-medium text-green-700 transition-colors hover:bg-green-100 disabled:opacity-50 disabled:cursor-not-allowed dark:border-green-700 dark:bg-green-900/30 dark:text-green-300 dark:hover:bg-green-900/50"
                  >
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    {isApproving ? "Утверждение..." : "Утвердить документ"}
                  </button>
                )}
                <button
                  onClick={async () => {
                    try {
                      setIsSendingNotifications(true);
                      const response = await fetch(`/api/ppo-head/meetings/${resolvedParams.id}/notify-participants`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ type: "protocol_review" }),
                      });

                      if (!response.ok) {
                        const error = await response.json();
                        throw new Error(error.error || "Ошибка отправки");
                      }

                      const data = await response.json();
                      alertSuccess(data.message || `Уведомления отправлены ${data.sentCount} участникам`);
                      loadMeeting();
                    } catch (error) {
                      alertError(error instanceof Error ? error.message : "Не удалось отправить уведомления");
                    } finally {
                      setIsSendingNotifications(false);
                    }
                  }}
                  disabled={isSendingNotifications || meeting.protocolDocument.status !== "COMPLETED"}
                  className="inline-flex items-center justify-center gap-2 rounded-lg border border-green-300 bg-green-50 px-4 py-2 text-sm font-medium text-green-700 transition-colors hover:bg-green-100 disabled:opacity-50 disabled:cursor-not-allowed dark:border-green-700 dark:bg-green-900/30 dark:text-green-300 dark:hover:bg-green-900/50"
                  title={meeting.protocolDocument.status !== "COMPLETED" ? "Сначала утвердите документ" : "Отправить участникам для ознакомления"}
                >
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                  </svg>
                  {isSendingNotifications ? "Отправка..." : "Разослать протокол"}
                </button>
              </div>
            </div>
          ) : (
            <div className="rounded-lg border-2 border-dashed border-gray-300 bg-white p-8 text-center dark:border-gray-700 dark:bg-gray-800">
              <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <h3 className="mt-2 text-sm font-medium text-gray-900 dark:text-white">Протокол не создан</h3>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                Заполните протокол на основе повестки дня и сформируйте документ
              </p>
            </div>
          )}

          {/* Форма заполнения протокола */}
          {meeting.agendaDocument && (
            <>
              <div className="flex items-center justify-between rounded-lg bg-gray-50 p-4 dark:bg-gray-800">
                <div>
                  <h3 className="font-semibold text-gray-900 dark:text-white">Заполнение протокола</h3>
                  <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                    Заполните данные по каждому вопросу повестки дня
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={saveProtocolData}
                    disabled={isSaving}
                    className="rounded-lg border border-gray-300 px-4 py-2 hover:bg-gray-100 disabled:opacity-50 dark:border-gray-600 dark:hover:bg-gray-700"
                  >
                    {isSaving ? "Сохранение..." : "Сохранить черновик"}
                  </button>
                  {!meeting.protocolDocument && (
                    <button
                      onClick={() => handleGenerateDocument("PROTOCOL")}
                      disabled={isGenerating}
                      className="rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:opacity-50"
                    >
                      {isGenerating ? "Формирование..." : "Сформировать протокол"}
                    </button>
                  )}
                </div>
              </div>

          {/* Вопросы с формами */}
          {meeting.agendaItems.map((item) => (
            <div
              key={item.id}
              className="rounded-lg border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800"
            >
              <div className="mb-4 flex items-center justify-between">
                <h4 className="text-lg font-semibold">
                  Вопрос {item.orderNumber}. {item.title}
                </h4>
              </div>

              <div className="space-y-4">
                {/* СЛУШАЛИ */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Слушали:
                  </label>
                  <textarea
                    value={protocolData[item.id]?.heardText || ""}
                    onChange={(e) => updateProtocolItem(item.id, "heardText", e.target.value)}
                    rows={2}
                    className="block w-full rounded-md border border-gray-300 px-3 py-2 dark:border-gray-600 dark:bg-gray-700"
                    placeholder={item.title}
                  />
                </div>

                {/* ДОКЛАДЫВАЛ */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Докладывал: *
                  </label>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <select
                      value={protocolData[item.id]?.speakerId || item.speakerId || ""}
                      onChange={(e) => {
                        const memberId = e.target.value;
                        // Сначала ищем среди участников заседания
                        const participant = meeting.participants.find(p => p.user?.id === memberId);
                        // Если не нашли, ищем среди всех членов
                        const member = participant?.user || members.find(m => m.id === memberId);
                        
                        updateProtocolItem(item.id, "speakerId", memberId);
                        if (member) {
                          const name = [member.lastName, member.firstName, member.middleName].filter(Boolean).join(" ");
                          updateProtocolItem(item.id, "speakerName", name);
                        }
                      }}
                      className="block w-full rounded-md border border-gray-300 px-3 py-2 dark:border-gray-600 dark:bg-gray-700"
                    >
                      <option value="">— Выбрать из участников —</option>
                      <optgroup label="Участники заседания">
                        {meeting.participants
                          .filter(p => p.user)
                          .map((p) => (
                            <option key={p.user!.id} value={p.user!.id}>
                              {getParticipantName(p)}
                              {p.role === "CHAIRMAN" && " (Председатель)"}
                              {p.role === "SECRETARY" && " (Секретарь)"}
                            </option>
                          ))}
                      </optgroup>
                      <optgroup label="Все члены организации">
                        {members
                          .filter(m => !meeting.participants.some(p => p.user?.id === m.id))
                          .map((member) => (
                            <option key={member.id} value={member.id}>
                              {getMemberName(member)}
                            </option>
                          ))}
                      </optgroup>
                    </select>
                    <input
                      type="text"
                      value={protocolData[item.id]?.speakerId ? "" : (protocolData[item.id]?.speakerName || item.speakerName || "")}
                      onChange={(e) => {
                        updateProtocolItem(item.id, "speakerName", e.target.value);
                        updateProtocolItem(item.id, "speakerId", "");
                      }}
                      className="block w-full rounded-md border border-gray-300 px-3 py-2 dark:border-gray-600 dark:bg-gray-700"
                      placeholder="или ввести ФИО вручную"
                      disabled={!!(protocolData[item.id]?.speakerId || item.speakerId)}
                    />
                  </div>
                  {(protocolData[item.id]?.speakerName || item.speakerName) && (
                    <p className="mt-1 text-xs text-green-600 dark:text-green-400">
                      Докладчик: {protocolData[item.id]?.speakerName || item.speakerName}
                    </p>
                  )}
                </div>

                {/* ПОСТАНОВИЛИ */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Постановили: *
                  </label>
                  <textarea
                    value={protocolData[item.id]?.resolutionText || ""}
                    onChange={(e) => updateProtocolItem(item.id, "resolutionText", e.target.value)}
                    rows={3}
                    className="block w-full rounded-md border border-gray-300 px-3 py-2 dark:border-gray-600 dark:bg-gray-700"
                    placeholder="Текст постановления..."
                  />
                </div>

                {/* ГОЛОСОВАНИЕ */}
                <div className="rounded-lg bg-gray-50 p-4 dark:bg-gray-900">
                  <div className="flex items-center justify-between mb-3">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                      Голосование:
                    </label>
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      Макс: {maxVotes} участников
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">За:</label>
                      <input
                        type="number"
                        min="0"
                        max={maxVotes}
                        value={protocolData[item.id]?.votesFor || 0}
                        onChange={(e) => {
                          const val = parseInt(e.target.value) || 0;
                          updateProtocolItem(item.id, "votesFor", val);
                        }}
                        className="block w-full rounded-md border border-green-300 bg-green-50 px-3 py-2 text-center font-medium text-green-700 dark:border-green-700 dark:bg-green-900/30 dark:text-green-400"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Против:</label>
                      <input
                        type="number"
                        min="0"
                        max={maxVotes}
                        value={protocolData[item.id]?.votesAgainst || 0}
                        onChange={(e) => {
                          const val = parseInt(e.target.value) || 0;
                          updateProtocolItem(item.id, "votesAgainst", val);
                        }}
                        className="block w-full rounded-md border border-red-300 bg-red-50 px-3 py-2 text-center font-medium text-red-700 dark:border-red-700 dark:bg-red-900/30 dark:text-red-400"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Воздержались:</label>
                      <input
                        type="number"
                        min="0"
                        max={maxVotes}
                        value={protocolData[item.id]?.votesAbstained || 0}
                        onChange={(e) => {
                          const val = parseInt(e.target.value) || 0;
                          updateProtocolItem(item.id, "votesAbstained", val);
                        }}
                        className="block w-full rounded-md border border-gray-300 bg-gray-100 px-3 py-2 text-center font-medium dark:border-gray-600 dark:bg-gray-700"
                      />
                    </div>
                  </div>
                  {(() => {
                    const votesFor = protocolData[item.id]?.votesFor || 0;
                    const votesAgainst = protocolData[item.id]?.votesAgainst || 0;
                    const votesAbstained = protocolData[item.id]?.votesAbstained || 0;
                    const total = votesFor + votesAgainst + votesAbstained;
                    const isValid = total <= maxVotes;
                    const remaining = maxVotes - total;
                    
                    return (
                      <div className="mt-3 flex items-center justify-between text-xs">
                        <span className={`font-medium ${isValid ? 'text-gray-600 dark:text-gray-400' : 'text-red-600 dark:text-red-400'}`}>
                          Всего: {total} / {maxVotes}
                        </span>
                        {isValid && remaining > 0 && (
                          <span className="text-gray-500 dark:text-gray-400">
                            Осталось: {remaining}
                          </span>
                        )}
                        {!isValid && (
                          <span className="text-red-600 dark:text-red-400 font-medium">
                            Превышено на {total - maxVotes}!
                          </span>
                        )}
                      </div>
                    );
                  })()}
                </div>

                {/* РЕШИЛИ */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Решили:
                  </label>
                  <textarea
                    value={protocolData[item.id]?.decidedText || ""}
                    onChange={(e) => updateProtocolItem(item.id, "decidedText", e.target.value)}
                    rows={2}
                    className="block w-full rounded-md border border-gray-300 px-3 py-2 dark:border-gray-600 dark:bg-gray-700"
                    placeholder="Текст решения (необязательно)..."
                  />
                </div>
              </div>
            </div>
          ))}

              {/* Кнопки внизу */}
              <div className="flex justify-between mt-6">
                <button
                  onClick={() => setActiveTab("agenda")}
                  className="rounded-lg border border-gray-300 px-4 py-2 hover:bg-gray-50 dark:border-gray-600 dark:hover:bg-gray-700"
                >
                  ← Назад к повестке
                </button>
                <div className="flex gap-2">
                  <button
                    onClick={saveProtocolData}
                    disabled={isSaving}
                    className="rounded-lg border border-gray-300 px-4 py-2 hover:bg-gray-100 disabled:opacity-50 dark:border-gray-600 dark:hover:bg-gray-700"
                  >
                    {isSaving ? "Сохранение..." : "Сохранить черновик"}
                  </button>
                  {!meeting.protocolDocument && (
                    <button
                      onClick={() => handleGenerateDocument("PROTOCOL")}
                      disabled={isGenerating}
                      className="rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:opacity-50"
                    >
                      {isGenerating ? "Формирование..." : "Сформировать протокол"}
                    </button>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {activeTab === "resolutions" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
              Постановления ({meeting.resolutions.length})
            </h3>
            {meeting.protocolDocument && meeting.protocolDocument.status === "COMPLETED" && (
              <button
                onClick={() => {
                  // TODO: Добавить функционал создания постановления
                  alertError("Функция создания постановления будет добавлена");
                }}
                className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Создать постановление
              </button>
            )}
          </div>

          {meeting.resolutions.length === 0 ? (
            <div className="rounded-lg border-2 border-dashed border-gray-300 bg-white p-8 text-center dark:border-gray-700 dark:bg-gray-800">
              <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <h3 className="mt-2 text-sm font-medium text-gray-900 dark:text-white">Нет постановлений</h3>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                {meeting.protocolDocument && meeting.protocolDocument.status === "COMPLETED"
                  ? "Создайте постановление на основании протокола"
                  : "Сначала нужно утвердить протокол заседания"}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {meeting.resolutions.map((resolution: any) => (
                <div
                  key={resolution.id}
                  className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <h4 className="text-sm font-semibold text-gray-900 dark:text-white">
                          {resolution.title || `Постановление ${resolution.regNumber || ""}`}
                        </h4>
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${DOC_STATUS_COLORS[resolution.status] || DOC_STATUS_COLORS.DRAFT}`}>
                          {DOC_STATUS_LABELS[resolution.status] || "Черновик"}
                        </span>
                      </div>
                      {resolution.regNumber && (
                        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                          № {resolution.regNumber}
                        </p>
                      )}
                    </div>
                    <div className="flex gap-2">
                      {resolution.filePath && (
                        <>
                          <button
                            onClick={() => setPdfPreviewUrl(resolution.filePath!)}
                            className="inline-flex items-center gap-1 rounded-lg border border-blue-300 bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-700 transition-colors hover:bg-blue-100 dark:border-blue-700 dark:bg-blue-900/30 dark:text-blue-300 dark:hover:bg-blue-900/50"
                          >
                            <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                            </svg>
                            Просмотр
                          </button>
                          <a
                            href={resolution.filePath}
                            download
                            className="inline-flex items-center gap-1 rounded-lg border border-gray-300 bg-gray-50 px-3 py-1.5 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-100 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
                          >
                            <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                            </svg>
                            Скачать
                          </a>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === "extracts" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
              Выписки из протокола ({meeting.extracts.length})
            </h3>
            {meeting.protocolDocument && meeting.protocolDocument.status === "COMPLETED" && (
              <button
                onClick={() => {
                  // TODO: Добавить функционал создания выписки
                  alertError("Функция создания выписки будет добавлена");
                }}
                className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Создать выписку
              </button>
            )}
          </div>

          {meeting.extracts.length === 0 ? (
            <div className="rounded-lg border-2 border-dashed border-gray-300 bg-white p-8 text-center dark:border-gray-700 dark:bg-gray-800">
              <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <h3 className="mt-2 text-sm font-medium text-gray-900 dark:text-white">Нет выписок</h3>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                {meeting.protocolDocument && meeting.protocolDocument.status === "COMPLETED"
                  ? "Создайте выписку из протокола при необходимости"
                  : "Сначала нужно утвердить протокол заседания"}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {meeting.extracts.map((extract: any) => (
                <div
                  key={extract.id}
                  className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <h4 className="text-sm font-semibold text-gray-900 dark:text-white">
                          {extract.title || `Выписка ${extract.regNumber || ""}`}
                        </h4>
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${DOC_STATUS_COLORS[extract.status] || DOC_STATUS_COLORS.DRAFT}`}>
                          {DOC_STATUS_LABELS[extract.status] || "Черновик"}
                        </span>
                      </div>
                      {extract.regNumber && (
                        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                          № {extract.regNumber}
                        </p>
                      )}
                    </div>
                    <div className="flex gap-2">
                      {extract.filePath && (
                        <>
                          <button
                            onClick={() => setPdfPreviewUrl(extract.filePath!)}
                            className="inline-flex items-center gap-1 rounded-lg border border-blue-300 bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-700 transition-colors hover:bg-blue-100 dark:border-blue-700 dark:bg-blue-900/30 dark:text-blue-300 dark:hover:bg-blue-900/50"
                          >
                            <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                            </svg>
                            Просмотр
                          </button>
                          <a
                            href={extract.filePath}
                            download
                            className="inline-flex items-center gap-1 rounded-lg border border-gray-300 bg-gray-50 px-3 py-1.5 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-100 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
                          >
                            <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                            </svg>
                            Скачать
                          </a>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Модальное окно для превью PDF */}
      <Modal
        isOpen={!!pdfPreviewUrl}
        onClose={() => setPdfPreviewUrl(null)}
        className="max-w-6xl w-full"
        isFullscreen={false}
      >
        <div className="p-4">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
              Просмотр документа
            </h3>
            <div className="flex gap-2">
              {pdfPreviewUrl && (
                <a
                  href={pdfPreviewUrl}
                  download
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-gray-50 px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
                >
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  Скачать
                </a>
              )}
            </div>
          </div>
          {pdfPreviewUrl && (
            <div className="w-full h-[80vh] border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden bg-gray-100 dark:bg-gray-900">
              <iframe
                src={`${pdfPreviewUrl}#toolbar=1&navpanes=1&scrollbar=1`}
                className="w-full h-full"
                title="PDF Preview"
                style={{ minHeight: '600px' }}
              />
              <div className="mt-2 text-xs text-gray-500 dark:text-gray-400 text-center">
                Если PDF не отображается, используйте кнопку "Скачать" для просмотра в браузере
              </div>
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}
