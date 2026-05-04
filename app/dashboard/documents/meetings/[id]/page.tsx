"use client";

import { useState, useEffect, use, useRef, useCallback, useMemo } from "react";
import { useSession } from "next-auth/react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { alertSuccess, alertError, confirm } from "@/lib/alert";
import { DATE_INPUT_MIN, DATE_INPUT_MAX, normalizeDateInputValue } from "@/lib/date-bounds";
import Link from "next/link";
import { backNavLinkButtonClass } from "@/lib/back-nav-link-button";
import { Modal, ModalBody, ModalFooter, ModalHeader } from "@/components/ui/modal";
import { MembershipGate } from "@/components/MembershipGate";
import { HorizontalTabArrowStrip } from "@/components/ui/HorizontalTabArrowStrip";

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

type AgendaAttachment = { name: string; url: string; size?: number };

/** Со-докладчик: член выборного органа (userId) или приглашённый (extId = id участника заседания) */
type AgendaCoSpeakerEntry = { name: string; userId?: string; extId?: string; position?: string };

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
  coSpeakerId: string | null;
  coSpeakerName: string | null;
  resolutionText: string | null;
  decidedText: string | null;
  votesFor: number;
  votesAgainst: number;
  votesAbstained: number;
  votingCompleted: boolean;
  isApproved: boolean | null;
  attachments?: string | AgendaAttachment[] | null;
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
    updatedAt?: string;
    approvals?: Array<{
      id: string;
      status: string;
      comment: string | null;
      approvedAt: string | null;
      user: { id?: string; firstName: string | null; lastName: string | null; middleName: string | null };
    }>;
  } | null;
  protocolDocument: {
    id: string;
    regNumber: string | null;
    status: string;
    filePath: string | null;
    title: string;
    approvals?: Array<{
      id: string;
      status: string;
      comment: string | null;
      approvedAt: string | null;
      user: { id?: string; firstName: string | null; lastName: string | null; middleName: string | null };
    }>;
  } | null;
  participants: Participant[];
  agendaItems: AgendaItem[];
  resolutions: any[];
  extracts: any[];
  presidingOfficerUserId?: string | null;
  secretaryUserId?: string | null;
  voteCounterUserIds?: string | null; // JSON array of userId
  groupChat?: { id: string; archivedAt?: string | Date | null } | null;
  invitedGuests?: unknown[] | null;
  protocolProceduralData?: { agendaApprovedItemIds?: string[] } | null;
  /** Повестка изменялась после последней генерации PDF */
  agendaModifiedAt?: string | null;
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
  SIGNED: "Подписан",
};
/** Для повестки дня при полном согласовании показываем «Согласованно» */
const DOC_STATUS_LABELS_AGENDA: Record<string, string> = { ...DOC_STATUS_LABELS, COMPLETED: "Согласованно" };

const DOC_STATUS_COLORS: Record<string, string> = {
  DRAFT: "bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-300",
  GENERATED: "bg-blue-200 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  PENDING_REVIEW: "bg-yellow-200 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
  PENDING_APPROVAL: "bg-orange-200 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400",
  COMPLETED: "bg-green-200 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  SIGNED: "bg-emerald-200 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400",
};

export default function MeetingDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const resolvedParams = use(params);
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const { data: session } = useSession();
  const router = useRouter();
  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [readOnly, setReadOnly] = useState(false);
  const [canDeleteMeeting, setCanDeleteMeeting] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const tabFromUrl = searchParams.get("tab");
  const initialTab: "info" | "agenda" | "protocol" | "resolutions" | "extracts" =
    tabFromUrl === "agenda" || tabFromUrl === "protocol" || tabFromUrl === "resolutions" || tabFromUrl === "extracts" ? tabFromUrl : "info";
  const [activeTab, setActiveTab] = useState<"info" | "agenda" | "protocol" | "resolutions" | "extracts">(initialTab);
  // Вкладка из URL имеет приоритет (при переходе «Новый протокол» → ?tab=protocol сразу открывается «Протокол»)
  const effectiveTab: "info" | "agenda" | "protocol" | "resolutions" | "extracts" =
    tabFromUrl === "agenda" || tabFromUrl === "protocol" || tabFromUrl === "resolutions" || tabFromUrl === "extracts" ? tabFromUrl : activeTab;
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Состояние для редактирования протокола
  const [protocolData, setProtocolData] = useState<Record<string, any>>({});
  const [members, setMembers] = useState<any[]>([]);
  const [electedBody, setElectedBody] = useState<Array<{ id: string; firstName: string | null; lastName: string | null; middleName: string | null; jobTitle: string | null; roleName: string }>>([]);
  const [protocolProcedural, setProtocolProcedural] = useState<{
    chairmanReportUserId: string;
    chairmanVotesFor: number; chairmanVotesAgainst: number; chairmanVotesAbstained: number;
    secretaryReportUserId: string;
    secretaryVotesFor: number; secretaryVotesAgainst: number; secretaryVotesAbstained: number;
    voteCounterReportUserId: string;
    voteCounterVotesFor: number; voteCounterVotesAgainst: number; voteCounterVotesAbstained: number;
    agendaApprovalVotesFor: number; agendaApprovalVotesAgainst: number; agendaApprovalVotesAbstained: number;
    agendaApprovedItemIds?: string[];
  }>({
    chairmanReportUserId: "", chairmanVotesFor: 0, chairmanVotesAgainst: 0, chairmanVotesAbstained: 0,
    secretaryReportUserId: "", secretaryVotesFor: 0, secretaryVotesAgainst: 0, secretaryVotesAbstained: 0,
    voteCounterReportUserId: "", voteCounterVotesFor: 0, voteCounterVotesAgainst: 0, voteCounterVotesAbstained: 0,
    agendaApprovalVotesFor: 0, agendaApprovalVotesAgainst: 0, agendaApprovalVotesAbstained: 0,
  });
  const [presidingOfficerUserId, setPresidingOfficerUserId] = useState<string>("");
  const [secretaryUserId, setSecretaryUserId] = useState<string>("");
  const [voteCounterUserIds, setVoteCounterUserIds] = useState<string[]>([]);
  const [invitedGuests, setInvitedGuests] = useState<string>("");
  const [newGuestInput, setNewGuestInput] = useState<string>("");
  const guestsList = invitedGuests ? invitedGuests.split(",").map(g => g.trim()).filter(Boolean) : [];
  const addGuest = () => {
    const name = newGuestInput.trim();
    if (!name) return;
    const updated = [...guestsList, name];
    setInvitedGuests(updated.join(", "));
    setNewGuestInput("");
  };
  const removeGuest = (index: number) => {
    const updated = guestsList.filter((_, i) => i !== index);
    setInvitedGuests(updated.join(", "));
  };
  const [isSyncingParticipants, setIsSyncingParticipants] = useState(false);
  const [protocolGeneralCollapsed, setProtocolGeneralCollapsed] = useState(false);
  const [isSendingForApproval, setIsSendingForApproval] = useState(false);
  const [isApproving, setIsApproving] = useState(false);
  const [agendaParticipantApprovalSubmitting, setAgendaParticipantApprovalSubmitting] = useState(false);
  const [uploadingSignedProtocol, setUploadingSignedProtocol] = useState(false);
  const [sendingProtocolToInbox, setSendingProtocolToInbox] = useState(false);
  const [protocolSentToInbox, setProtocolSentToInbox] = useState(false);
  const protocolSignedFileInputRef = useRef<HTMLInputElement>(null);
  const [uploadingSignedResolutionId, setUploadingSignedResolutionId] = useState<string | null>(null);
  const [resolutionIdForSignedUpload, setResolutionIdForSignedUpload] = useState<string | null>(null);
  const [isCreatingResolutions, setIsCreatingResolutions] = useState(false);
  const [isCreatingExtract, setIsCreatingExtract] = useState(false);
  /** Выбранные пункты повестки для выписки (галочки во вкладке «Выписки») */
  const [extractSelectedItemIds, setExtractSelectedItemIds] = useState<string[]>([]);
  const resolutionSignedFileInputRef = useRef<HTMLInputElement>(null);
  const [uploadingSignedExtractId, setUploadingSignedExtractId] = useState<string | null>(null);
  const [extractIdForSignedUpload, setExtractIdForSignedUpload] = useState<string | null>(null);
  const [deletingExtractId, setDeletingExtractId] = useState<string | null>(null);
  const [sendingExtractId, setSendingExtractId] = useState<string | null>(null);
  /** Модалка «Разослать выписку»: id выписки и выбранные получатели (userId[]) */
  const [extractIdForSendModal, setExtractIdForSendModal] = useState<string | null>(null);
  const [selectedUserIdsForExtract, setSelectedUserIdsForExtract] = useState<string[]>([]);
  /** Кому уже разослана текущая выписка (для пометки в модалке) */
  const [extractAlreadySentToUserIds, setExtractAlreadySentToUserIds] = useState<string[]>([]);
  const extractSignedFileInputRef = useRef<HTMLInputElement>(null);
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string | null>(null);
  const [editingAgendaId, setEditingAgendaId] = useState<string | null>(null);
  const [agendaEditForm, setAgendaEditForm] = useState<Record<string, { title: string; description: string; speakerId: string; speakerName: string; speakerPosition: string; coSpeakers: AgendaCoSpeakerEntry[]; attachments: AgendaAttachment[] }>>({});
  const [showAddAgendaForm, setShowAddAgendaForm] = useState(false);
  const [newAgendaForm, setNewAgendaForm] = useState({ title: "", description: "", speakerId: "", speakerName: "", speakerPosition: "", coSpeakers: [] as AgendaCoSpeakerEntry[], attachments: [] as AgendaAttachment[] });
  const [coSpeakerDropdownAgendaId, setCoSpeakerDropdownAgendaId] = useState<string | null>(null);
  const [coSpeakerDropdownNew, setCoSpeakerDropdownNew] = useState(false);
  const coSpeakerDropdownRef = useRef<HTMLDivElement>(null);
  const [uploadingAttachmentAgendaId, setUploadingAttachmentAgendaId] = useState<string | null>(null);
  const [uploadingResolutionAttachmentId, setUploadingResolutionAttachmentId] = useState<string | null>(null);
  const [uploadingNewAgendaAttachment, setUploadingNewAgendaAttachment] = useState(false);
  const [isSavingAgenda, setIsSavingAgenda] = useState(false);
  const [isAddingAgenda, setIsAddingAgenda] = useState(false);
  const [deletingAgendaId, setDeletingAgendaId] = useState<string | null>(null);
  const [agendaDataChangedSinceLoad, setAgendaDataChangedSinceLoad] = useState(false);
  const [agendaNeedsRegenerate, setAgendaNeedsRegenerate] = useState(false);
  const [agendaRegNumberOverride, setAgendaRegNumberOverride] = useState("");
  const [protocolRegNumberOverride, setProtocolRegNumberOverride] = useState("");
  const [protocolDocDate, setProtocolDocDate] = useState("");
  const [protocolMeetingTime, setProtocolMeetingTime] = useState("");
  const [protocolPlace, setProtocolPlace] = useState("");
  const [isSavingMeetingGeneral, setIsSavingMeetingGeneral] = useState(false);

  const agendaAllApproved = !!(
    meeting?.agendaDocument?.approvals?.length &&
    meeting.agendaDocument.approvals.every((a: { status: string }) => a.status === "APPROVED")
  );
  const agendaDisplayStatus = meeting?.agendaDocument
    ? meeting.agendaDocument.status === "PENDING_APPROVAL" && agendaAllApproved
      ? "Согласованно"
      : DOC_STATUS_LABELS_AGENDA[meeting.agendaDocument.status] || "Черновик"
    : null;
  const agendaDisplayColor = meeting?.agendaDocument
    ? meeting.agendaDocument.status === "PENDING_APPROVAL" && agendaAllApproved
      ? DOC_STATUS_COLORS.COMPLETED
      : DOC_STATUS_COLORS[meeting.agendaDocument.status] || DOC_STATUS_COLORS.DRAFT
    : DOC_STATUS_COLORS.DRAFT;
  const canCreateProtocol = !!meeting?.agendaDocument && meeting.agendaDocument.status === "COMPLETED";
  /** Пустое состояние вкладки «Протокол» для не председателя/зама, когда протокол ещё не создан */
  const protocolTabRestrictedEmpty = canCreateProtocol && !meeting?.protocolDocument && !canDeleteMeeting;

  /** Все прикреплённые к протоколу документы (из пунктов повестки) для отображения ссылок */
  const protocolAttachmentsList = useMemo(() => {
    const list: { name: string; url: string; itemNum?: number; itemTitle?: string }[] = [];
    (meeting?.agendaItems ?? []).forEach((item) => {
      const atts = (protocolData[item.id]?.attachments ?? parseAgendaAttachments(item)) as AgendaAttachment[];
      atts.forEach((a) => list.push({ name: a.name, url: a.url, itemNum: item.orderNumber, itemTitle: item.title }));
    });
    return list;
  }, [meeting?.agendaItems, protocolData]);

  const meetingTabs = useMemo(() => [
    { id: "info" as const, label: "Информация", icon: <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>, badge: null as string | null },
    { id: "agenda" as const, label: "Повестка", icon: <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>, badge: meeting?.agendaDocument?.regNumber ?? agendaDisplayStatus ?? null },
    { id: "protocol" as const, label: "Протокол", icon: <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>, badge: meeting?.protocolDocument?.regNumber ?? (meeting?.protocolDocument ? DOC_STATUS_LABELS[meeting.protocolDocument.status] : null) ?? null },
    { id: "resolutions" as const, label: "Постановления", icon: <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" /></svg>, badge: null },
    { id: "extracts" as const, label: "Выписки", icon: <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>, badge: null },
  ], [meeting?.agendaDocument, meeting?.protocolDocument, meeting?.resolutions?.length, agendaDisplayStatus]);

  useEffect(() => {
    loadMeeting();
    loadMembers();
    loadElectedBody();
  }, [resolvedParams.id]);

  // При посещении страницы заседания помечаем уведомления о согласовании по этому заседанию как прочитанные
  useEffect(() => {
    const meetingId = resolvedParams.id;
    if (!meetingId) return;
    fetch("/api/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ markMeetingNotificationsRead: meetingId }),
    }).catch((err) => console.warn("[meetings/[id]] markMeetingNotificationsRead:", err));
  }, [resolvedParams.id]);

  useEffect(() => {
    const t = searchParams.get("tab");
    if (t === "agenda" || t === "protocol" || t === "resolutions" || t === "extracts") setActiveTab(t);
  }, [searchParams]);

  // При открытии модалки «Разослать выписку» загружаем список тех, кому уже разослана эта выписка
  useEffect(() => {
    if (!extractIdForSendModal || !resolvedParams.id) {
      setExtractAlreadySentToUserIds([]);
      return;
    }
    let cancelled = false;
    fetch(`/api/ppo-head/meetings/${resolvedParams.id}/extracts/${encodeURIComponent(extractIdForSendModal)}`)
      .then((res) => (res.ok ? res.json() : { userIds: [] }))
      .then((data: { userIds?: string[] }) => {
        if (!cancelled && Array.isArray(data.userIds)) setExtractAlreadySentToUserIds(data.userIds);
      })
      .catch(() => {
        if (!cancelled) setExtractAlreadySentToUserIds([]);
      });
    return () => { cancelled = true; };
  }, [extractIdForSendModal, resolvedParams.id]);

  useEffect(() => {
    const onMouseDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (coSpeakerDropdownRef.current && !coSpeakerDropdownRef.current.contains(target)) {
        setCoSpeakerDropdownAgendaId(null);
        setCoSpeakerDropdownNew(false);
      }
    };
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, []);

  // Новые пункты повестки по умолчанию включаем в утверждаемый список (блок 5)
  useEffect(() => {
    if (!meeting?.agendaItems?.length) return;
    const ids = meeting.agendaItems.map((i) => i.id);
    setProtocolProcedural((p) => {
      const current = p.agendaApprovedItemIds ?? ids;
      const added = ids.filter((id) => !current.includes(id));
      if (added.length === 0) return p;
      return { ...p, agendaApprovedItemIds: [...current, ...added] };
    });
  }, [meeting?.agendaItems?.map((i) => i.id).join(",")]);

  // Выбранные для выписки: только из утверждённых в протоколе (блок 5); по умолчанию галочки не установлены
  useEffect(() => {
    if (!meeting?.agendaItems?.length) return;
    const approvedIds = protocolProcedural.agendaApprovedItemIds ?? meeting.agendaItems.map((i) => i.id);
    setExtractSelectedItemIds((prev) => prev.filter((id) => approvedIds.includes(id)));
  }, [meeting?.agendaItems, protocolProcedural.agendaApprovedItemIds]);

  const loadMeeting = async (bypassCache = false) => {
    try {
      setIsLoading(true);
      const url = `/api/ppo-head/meetings/${resolvedParams.id}` + (bypassCache ? `?_=${Date.now()}` : "");
      const response = await fetch(url);
      if (response.ok) {
        const data = await response.json();
        setMeeting((prev) => {
          const m = data.meeting;
          if (!m) return prev;
          return { ...m, groupChat: m.groupChat ?? prev?.groupChat };
        });
        setReadOnly(data.readOnly === true);
        setCanDeleteMeeting(data.canDeleteMeeting === true);
        setAgendaNeedsRegenerate(data.agendaNeedsRegenerate === true);
        setProtocolSentToInbox(data.protocolSentToInbox === true);

        // Инициализация данных протокола из agendaItems (все поля, которые выводятся в PDF протокола)
        const initialData: Record<string, any> = {};
        data.meeting.agendaItems.forEach((item: AgendaItem) => {
          initialData[item.id] = {
            heardText: item.heardText || item.title,
            speakerId: item.speakerId || "",
            speakerName: item.speakerName || "",
            speakerPosition: item.speakerPosition || "",
            resolutionText: item.resolutionText || "",
            decidedText: item.decidedText || "",
            votesFor: item.votesFor ?? 0,
            votesAgainst: item.votesAgainst ?? 0,
            votesAbstained: item.votesAbstained ?? 0,
            isApproved: item.isApproved ?? null,
            attachments: parseAgendaAttachments(item),
          };
        });
        setProtocolData(initialData);
        const d = data.meeting.scheduledDate;
        if (d) {
          const date = new Date(d);
          setProtocolDocDate(date.toISOString().slice(0, 10));
        }
        setProtocolMeetingTime(data.meeting.scheduledTime || "");
        setProtocolPlace(data.meeting.location || "");
        setPresidingOfficerUserId(data.meeting.presidingOfficerUserId || "");
        setSecretaryUserId(data.meeting.secretaryUserId || "");
        setInvitedGuests(data.meeting.invitedGuests || "");
        try {
          const vc = data.meeting.voteCounterUserIds;
          setVoteCounterUserIds(vc ? (typeof vc === "string" ? JSON.parse(vc) : vc) : []);
        } catch {
          setVoteCounterUserIds([]);
        }
        if (data.meeting.protocolProceduralData) {
          const pd = data.meeting.protocolProceduralData;
          const allAgendaIds = (data.meeting.agendaItems || []).map((a: { id: string }) => a.id);
          setProtocolProcedural({
            chairmanReportUserId: pd.chairmanReportUserId || "",
            chairmanVotesFor: pd.chairmanVotesFor || 0, chairmanVotesAgainst: pd.chairmanVotesAgainst || 0, chairmanVotesAbstained: pd.chairmanVotesAbstained || 0,
            secretaryReportUserId: pd.secretaryReportUserId || "",
            secretaryVotesFor: pd.secretaryVotesFor || 0, secretaryVotesAgainst: pd.secretaryVotesAgainst || 0, secretaryVotesAbstained: pd.secretaryVotesAbstained || 0,
            voteCounterReportUserId: pd.voteCounterReportUserId || "",
            voteCounterVotesFor: pd.voteCounterVotesFor || 0, voteCounterVotesAgainst: pd.voteCounterVotesAgainst || 0, voteCounterVotesAbstained: pd.voteCounterVotesAbstained || 0,
            agendaApprovalVotesFor: pd.agendaApprovalVotesFor || 0, agendaApprovalVotesAgainst: pd.agendaApprovalVotesAgainst || 0, agendaApprovalVotesAbstained: pd.agendaApprovalVotesAbstained || 0,
            agendaApprovedItemIds: Array.isArray(pd.agendaApprovedItemIds) ? pd.agendaApprovedItemIds : allAgendaIds,
          });
        }
      }
    } catch (error) {
      console.error("Ошибка загрузки заседания:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const loadElectedBody = async () => {
    try {
      const res = await fetch("/api/ppo-head/elected-body-members");
      if (res.ok) {
        const data = await res.json();
        setElectedBody(data.members || []);
      }
    } catch (e) {
      console.error("Ошибка загрузки выборного органа:", e);
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

  const canEditAgenda = meeting && !readOnly && (meeting.status === "DRAFT" || meeting.status === "SCHEDULED");

  /** Текущий пользователь — председатель этого заседания (кнопки «Согласовать»/«Отклонить» для него не показываем) */
  const isChairman = !!meeting?.participants?.some(
    (p: { user?: { id?: string }; role: string }) => p.user?.id === session?.user?.id && p.role === "CHAIRMAN"
  );

  /** Участник уже нажал «Согласовать» или «Отклонить» по повестке — скрываем у него кнопки «Добавить пункт», «Редактировать», «Удалить» */
  const participantHasApprovedAgenda =
    !!meeting?.agendaDocument?.approvals?.some(
      (a: { user?: { id?: string }; status: string }) =>
        (a.user as { id?: string })?.id === session?.user?.id && (a.status === "APPROVED" || a.status === "REJECTED")
    );

  /** Внутренний участник заседания (не приглашённый гость) — может добавлять пункты повестки */
  const isInternalParticipant =
    !!meeting?.participants?.some((p) => p.user?.id === session?.user?.id);

  /** Председатель или заместитель — участник заседания с правами председателя/зама (для кнопок загрузки подписанных выписок и т.п.) */
  const isChairmanOrDeputyParticipant =
    canDeleteMeeting &&
    !!meeting?.participants?.some((p: { user?: { id?: string }; userId?: string }) => (p.user?.id ?? p.userId) === session?.user?.id);
  /** Добавлять пункты могут: те, у кого есть редактирование, или все внутренние участники (но не если уже согласовал) */
  const canAddAgendaItems =
    !!meeting &&
    (meeting.status === "DRAFT" || meeting.status === "SCHEDULED") &&
    (!readOnly || isInternalParticipant) &&
    !participantHasApprovedAgenda;

  /** После утверждения протокола скрываем «Пересоздать документ» и «Добавить пункт» у всех */
  const protocolApproved = !!meeting?.protocolDocument && (meeting.protocolDocument.status === "COMPLETED" || meeting.protocolDocument.status === "SIGNED");

  const parseAgendaAttachments = (item: AgendaItem): AgendaAttachment[] => {
    const raw = item.attachments;
    if (!raw) return [];
    if (Array.isArray(raw)) return raw;
    try {
      const parsed = JSON.parse(raw as string);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  };

  /** Парсит coSpeakerName (через запятую) в массив записей со-докладчиков (без userId/extId при загрузке) */
  const parseCoSpeakersFromItem = (item: AgendaItem): AgendaCoSpeakerEntry[] => {
    const s = item.coSpeakerName?.trim();
    if (!s) return [];
    return s.split(/\s*,\s*/).map((name) => ({ name: name.trim() })).filter((c) => c.name);
  };

  const startEditAgendaItem = (item: AgendaItem) => {
    setEditingAgendaId(item.id);
    setAgendaEditForm((prev) => ({
      ...prev,
      [item.id]: {
        title: item.title,
        description: item.description || "",
        speakerId: item.speakerId || "",
        speakerName: item.speakerName || "",
        speakerPosition: item.speakerPosition || "",
        coSpeakers: parseCoSpeakersFromItem(item),
        attachments: parseAgendaAttachments(item),
      },
    }));
  };

  const cancelEditAgendaItem = () => {
    setEditingAgendaId(null);
    setAgendaEditForm({});
    setCoSpeakerDropdownAgendaId(null);
  };

  const saveAgendaItem = async (itemId: string) => {
    const form = agendaEditForm[itemId];
    if (!form || !form.title.trim()) return;
    if (!form.speakerId) {
      alertError("Выберите докладчика из состава выборного органа");
      return;
    }
    try {
      setIsSavingAgenda(true);
      const res = await fetch(`/api/ppo-head/meetings/${resolvedParams.id}/agenda`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: [{
            id: itemId,
            title: form.title.trim(),
            description: form.description.trim() || null,
            speakerId: form.speakerId || null,
            speakerName: form.speakerName.trim() || null,
            speakerPosition: form.speakerPosition.trim() || null,
            coSpeakerId: form.coSpeakers?.find((c) => c.userId)?.userId || null,
            coSpeakerName: form.coSpeakers?.length ? form.coSpeakers.map((c) => c.name).join(", ") : null,
            attachments: form.attachments?.length ? form.attachments : [],
          }],
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Ошибка сохранения");
      }
      setEditingAgendaId(null);
      setAgendaEditForm({});
      await loadMeeting();
      setAgendaDataChangedSinceLoad(true);
      alertSuccess("Пункт повестки сохранён");
    } catch (e) {
      alertError(e instanceof Error ? e.message : "Не удалось сохранить");
    } finally {
      setIsSavingAgenda(false);
    }
  };

  const addAgendaItem = async () => {
    if (!newAgendaForm.title.trim()) {
      alertError("Укажите название вопроса");
      return;
    }
    if (!newAgendaForm.speakerId) {
      alertError("Выберите докладчика из состава выборного органа");
      return;
    }
    try {
      setIsAddingAgenda(true);
      const res = await fetch(`/api/ppo-head/meetings/${resolvedParams.id}/agenda`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: newAgendaForm.title.trim(),
          description: newAgendaForm.description.trim() || null,
          speakerId: newAgendaForm.speakerId || null,
          speakerName: newAgendaForm.speakerName.trim() || null,
          speakerPosition: newAgendaForm.speakerPosition.trim() || null,
          coSpeakerId: newAgendaForm.coSpeakers?.find((c) => c.userId)?.userId || null,
          coSpeakerName: newAgendaForm.coSpeakers?.length ? newAgendaForm.coSpeakers.map((c) => c.name).join(", ") : null,
          attachments: newAgendaForm.attachments?.length ? newAgendaForm.attachments : undefined,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Ошибка добавления");
      }
      setShowAddAgendaForm(false);
      setNewAgendaForm({ title: "", description: "", speakerId: "", speakerName: "", speakerPosition: "", coSpeakers: [], attachments: [] });
      setCoSpeakerDropdownNew(false);
      await loadMeeting();
      setAgendaDataChangedSinceLoad(true);
      alertSuccess("Пункт повестки добавлен");
    } catch (e) {
      alertError(e instanceof Error ? e.message : "Не удалось добавить");
    } finally {
      setIsAddingAgenda(false);
    }
  };

  const deleteAgendaItem = async (itemId: string) => {
    const ok = await confirm("Удалить этот пункт повестки?", "Удаление пункта");
    if (!ok) return;
    try {
      setDeletingAgendaId(itemId);
      const res = await fetch(`/api/ppo-head/meetings/${resolvedParams.id}/agenda/${itemId}`, { method: "DELETE" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Ошибка удаления");
      }
      await loadMeeting();
      setAgendaDataChangedSinceLoad(true);
      alertSuccess("Пункт повестки удалён");
    } catch (e) {
      alertError(e instanceof Error ? e.message : "Не удалось удалить");
    } finally {
      setDeletingAgendaId(null);
    }
  };

  const handleGenerateDocument = async (documentType: "AGENDA" | "PROTOCOL", regNumberOverride?: string) => {
    try {
      setIsGenerating(true);

      // Если это протокол, сначала сохраняем данные
      if (documentType === "PROTOCOL") {
        await saveProtocolData();
      }

      const body: Record<string, unknown> = { documentType };
      if (regNumberOverride?.trim()) body.regNumber = regNumberOverride.trim();
      if (documentType === "PROTOCOL") {
        body.protocolProceduralData = protocolProcedural;
        if (protocolMeetingTime?.trim()) body.meetingTime = protocolMeetingTime.trim();
        if (protocolDocDate) body.meetingDate = protocolDocDate;
        if (protocolPlace !== undefined && protocolPlace !== null) body.meetingPlace = protocolPlace;
        if (invitedGuests !== undefined && invitedGuests !== null) body.invitedGuests = invitedGuests;
        if (voteCounterUserIds?.length) body.voteCounterUserIds = voteCounterUserIds;
        if (presidingOfficerUserId) body.presidingOfficerUserId = presidingOfficerUserId;
        if (secretaryUserId) body.secretaryUserId = secretaryUserId;
      }

      const response = await fetch(`/api/ppo-head/meetings/${resolvedParams.id}/generate-document`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        const message = (data && typeof data.error === "string" ? data.error : null) || (data && data.details ? `${data.error || "Ошибка"}: ${data.details}` : null) || "Ошибка генерации документа";
        throw new Error(message);
      }

      if (data.meeting) setMeeting(data.meeting);
      if (documentType === "AGENDA") {
        setAgendaDataChangedSinceLoad(false);
        await loadMeeting();
      }
      alertSuccess((data && data.message) || "Документ сформирован!");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Не удалось сформировать документ";
      alertError(message);
      console.error("[handleGenerateDocument]", error);
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

  const PRESENT_STATUSES = ["PRESENT", "PRESENT_OFFLINE", "PRESENT_ONLINE"];
  const totalEligible = meeting?.participants?.filter(p => p.canVote).length || 0;
  const maxVotes = meeting?.participants?.filter(p => p.canVote && PRESENT_STATUSES.includes(p.attendance)).length || 0;
  const hasQuorum = totalEligible > 0 && maxVotes >= Math.floor(totalEligible / 2) + 1;

  /** Кнопка «Утвердить» активна только когда: все выборы в процедурных блоках сделаны, все «Всего: X / Y» совпадают (X === Y), все обязательные поля (*) заполнены */
  const canApproveProtocol = useMemo(() => {
    if (!hasQuorum || !meeting?.agendaItems?.length) return false;
    const p = protocolProcedural;
    const chairmanTotal = (p.chairmanVotesFor ?? 0) + (p.chairmanVotesAgainst ?? 0) + (p.chairmanVotesAbstained ?? 0);
    const secretaryTotal = (p.secretaryVotesFor ?? 0) + (p.secretaryVotesAgainst ?? 0) + (p.secretaryVotesAbstained ?? 0);
    const voteCounterTotal = (p.voteCounterVotesFor ?? 0) + (p.voteCounterVotesAgainst ?? 0) + (p.voteCounterVotesAbstained ?? 0);
    const agendaApprovalTotal = (p.agendaApprovalVotesFor ?? 0) + (p.agendaApprovalVotesAgainst ?? 0) + (p.agendaApprovalVotesAbstained ?? 0);
    const proceduralVotesComplete =
      maxVotes > 0 &&
      chairmanTotal === maxVotes &&
      secretaryTotal === maxVotes &&
      voteCounterTotal === maxVotes &&
      agendaApprovalTotal === maxVotes;
    const proceduralSelectsFilled =
      !!presidingOfficerUserId &&
      !!p.chairmanReportUserId &&
      !!p.secretaryReportUserId &&
      !!secretaryUserId &&
      !!p.voteCounterReportUserId;
    // Учитываем только активные пункты (отмеченные в блоке 5). Пункты «не актуально» (не отмеченные) не влияют на условие для «Утвердить».
    const approvedIds = p.agendaApprovedItemIds ?? meeting.agendaItems.map((i: AgendaItem) => i.id);
    const approvedItems = meeting.agendaItems.filter((item: AgendaItem) => approvedIds.includes(item.id));
    const agendaItemsComplete = approvedItems.every((item: AgendaItem) => {
      const d = protocolData[item.id];
      const speakerId = d?.speakerId ?? item.speakerId;
      const resolutionText = (d?.resolutionText ?? "").trim();
      const vf = d?.votesFor ?? 0;
      const va = d?.votesAgainst ?? 0;
      const vab = d?.votesAbstained ?? 0;
      const voteTotal = vf + va + vab;
      return !!speakerId && !!resolutionText && voteTotal === maxVotes;
    });
    return proceduralSelectsFilled && proceduralVotesComplete && agendaItemsComplete;
  }, [
    hasQuorum,
    meeting?.agendaItems,
    maxVotes,
    protocolProcedural,
    presidingOfficerUserId,
    secretaryUserId,
    protocolData,
  ]);

  const protocolBlocksLocked =
    meeting?.protocolDocument?.status === "COMPLETED" || meeting?.protocolDocument?.status === "SIGNED";

  const presentParticipantIds = new Set(
    meeting?.participants?.filter(p => PRESENT_STATUSES.includes(p.attendance)).map(p => p.user?.id).filter(Boolean) || []
  );
  const presentElectedBody = electedBody.filter(m => presentParticipantIds.has(m.id));

  const presentSummary = meeting?.participants?.filter(p => PRESENT_STATUSES.includes(p.attendance)) ?? [];
  const absentSummary = meeting?.participants?.filter(p => p.attendance === "ABSENT" || p.attendance === "EXCUSED") ?? [];
  const unmarkedSummary = meeting?.participants?.filter(p => p.attendance === "INVITED" || p.attendance === "CONFIRMED") ?? [];

  /** Вычисляет текст решения по голосованию: единогласно / большинством / не принято.
   *  Правило: решение принимается большинством (50% + 1) от числа присутствующих. */
  const getVoteDecisionText = (votesFor: number, votesAgainst: number, votesAbstained: number) => {
    const total = votesFor + votesAgainst + votesAbstained;
    if (total === 0) return { text: "Не голосовали", approved: null, color: "text-gray-500 dark:text-gray-400" };
    const majorityRequired = Math.floor(maxVotes / 2) + 1;
    if (votesFor === maxVotes && votesAgainst === 0 && votesAbstained === 0) return { text: "Принято единогласно", approved: true, color: "text-green-700 dark:text-green-400" };
    if (votesFor >= majorityRequired) return { text: `Принято большинством голосов (${votesFor} из ${maxVotes})`, approved: true, color: "text-green-700 dark:text-green-400" };
    return { text: `Не принято (за: ${votesFor}, против: ${votesAgainst}, необходимо: ${majorityRequired})`, approved: false, color: "text-red-600 dark:text-red-400" };
  };

  /** Ограничивает голоса процедурного блока: сумма За+Против+Воздержались не больше maxVotes. Если в одном поле maxVotes — остальные обнуляются. */
  const clampProceduralVotes = useCallback((
    forVal: number, againstVal: number, abstainedVal: number,
    field: "for" | "against" | "abstained", newVal: number
  ) => {
    let f = field === "for" ? newVal : forVal;
    let a = field === "against" ? newVal : againstVal;
    let ab = field === "abstained" ? newVal : abstainedVal;
    const total = f + a + ab;
    if (maxVotes > 0 && total > maxVotes) {
      const excess = total - maxVotes;
      if (field === "for") f = Math.max(0, f - excess);
      else if (field === "against") a = Math.max(0, a - excess);
      else ab = Math.max(0, ab - excess);
    }
    // Автоматизация: если в одном поле все голоса (maxVotes), остальные два — 0
    if (maxVotes > 0) {
      const changedVal = field === "for" ? f : field === "against" ? a : ab;
      if (changedVal === maxVotes) {
        if (field === "for") { a = 0; ab = 0; }
        else if (field === "against") { f = 0; ab = 0; }
        else { f = 0; a = 0; }
      }
    }
    return { for: Math.max(0, f), against: Math.max(0, a), abstained: Math.max(0, ab) };
  }, [maxVotes]);

  const updateProtocolItem = (itemId: string, field: string, value: any) => {
    setProtocolData(prev => {
      const currentData = prev[itemId] || {};
      const newData = { ...currentData, [field]: value };
      
      // Валидация для полей голосования
      if (field === "votesFor" || field === "votesAgainst" || field === "votesAbstained") {
        if (value === "") return { ...prev, [itemId]: newData };
        const votesFor = field === "votesFor" ? (parseInt(value) || 0) : (parseInt(currentData.votesFor) || 0);
        const votesAgainst = field === "votesAgainst" ? (parseInt(value) || 0) : (parseInt(currentData.votesAgainst) || 0);
        const votesAbstained = field === "votesAbstained" ? (parseInt(value) || 0) : (parseInt(currentData.votesAbstained) || 0);
        
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
        // Автоматизация: если в одном поле все голоса (maxVotes), остальные два — 0
        if (maxVotes > 0) {
          const vFor = newData.votesFor ?? 0;
          const vAgainst = newData.votesAgainst ?? 0;
          const vAbst = newData.votesAbstained ?? 0;
          if (field === "votesFor" && vFor === maxVotes) {
            newData.votesAgainst = 0;
            newData.votesAbstained = 0;
          } else if (field === "votesAgainst" && vAgainst === maxVotes) {
            newData.votesFor = 0;
            newData.votesAbstained = 0;
          } else if (field === "votesAbstained" && vAbst === maxVotes) {
            newData.votesFor = 0;
            newData.votesAgainst = 0;
          }
        }

        // Auto-compute isApproved from votes (50%+1 rule)
        const fv = newData.votesFor ?? 0;
        const av = newData.votesAgainst ?? 0;
        const abv = newData.votesAbstained ?? 0;
        const tv = fv + av + abv;
        if (tv === 0) {
          newData.isApproved = null;
        } else {
          newData.isApproved = fv > tv / 2;
        }
      }
      
      return {
        ...prev,
        [itemId]: newData,
      };
    });
  };

  /** URL для просмотра/скачивания документа через API (работает на проде при отсутствии файла на диске) */
  const getDocumentViewUrl = (docId: string) => `/api/documents/${docId}/download?inline=1`;
  const getDocumentDownloadUrl = (docId: string) => `/api/documents/${docId}/download`;

  const getParticipantName = (p: Participant) => {
    if (p.user) {
      return [p.user.lastName, p.user.firstName, p.user.middleName].filter(Boolean).join(" ");
    }
    return p.externalName || "";
  };

  const getMemberName = (member: any) => {
    return [member.lastName, member.firstName, member.middleName].filter(Boolean).join(" ");
  };

  const getElectedMemberName = (m: { lastName?: string | null; firstName?: string | null; middleName?: string | null }) => {
    return [m.lastName, m.firstName, m.middleName].filter(Boolean).join(" ");
  };

  /** Список для выбора докладчика в форме нового пункта: выборный орган + текущий пользователь, если он участник, но не в списке */
  const speakerOptionsForNewAgenda = (() => {
    const currentUserId = session?.user?.id;
    const inBody = currentUserId ? electedBody.find((m) => m.id === currentUserId) : null;
    if (inBody) return electedBody;
    const myParticipant = currentUserId && meeting?.participants?.find((p) => p.user?.id === currentUserId);
    if (!myParticipant?.user) return electedBody;
    const u = myParticipant.user;
    const selfEntry: (typeof electedBody)[0] = {
      id: u.id,
      firstName: u.firstName,
      lastName: u.lastName,
      middleName: u.middleName,
      jobTitle: u.jobTitle,
      roleName: "",
    };
    return [selfEntry, ...electedBody];
  })();

  const syncParticipantsWithElectedBody = async () => {
    if (!meeting || electedBody.length === 0) return;
    const participantUserIds = meeting.participants.map(p => p.user?.id).filter(Boolean) as string[];
    const missing = electedBody.filter(m => !participantUserIds.includes(m.id)).map(m => m.id);
    if (missing.length === 0) {
      alertSuccess("Все члены выборного органа уже в заседании");
      return;
    }
    try {
      setIsSyncingParticipants(true);
      const res = await fetch(`/api/ppo-head/meetings/${resolvedParams.id}/participants`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userIds: missing }),
      });
      if (!res.ok) throw new Error("Ошибка добавления");
      const data = await res.json();
      if (data.meeting) setMeeting(data.meeting);
      alertSuccess(`Добавлено участников: ${data.added || missing.length}`);
    } catch (e) {
      alertError(e instanceof Error ? e.message : "Не удалось добавить участников");
    } finally {
      setIsSyncingParticipants(false);
    }
  };

  const saveProtocolProceduralAndElected = async () => {
    if (!meeting) return;
    try {
      setIsSavingMeetingGeneral(true);
      const res = await fetch(`/api/ppo-head/meetings/${resolvedParams.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scheduledDate: protocolDocDate ? new Date(protocolDocDate).toISOString() : undefined,
          scheduledTime: protocolMeetingTime || undefined,
          location: protocolPlace || undefined,
          presidingOfficerUserId: presidingOfficerUserId || null,
          secretaryUserId: secretaryUserId || null,
          voteCounterUserIds: voteCounterUserIds.length ? voteCounterUserIds : null,
          protocolProceduralData: protocolProcedural,
          invitedGuests: invitedGuests || null,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Ошибка сохранения");
      }
      const data = await res.json();
      if (data.meeting) setMeeting(data.meeting);
      alertSuccess("Данные протокола сохранены");
    } catch (e) {
      alertError(e instanceof Error ? e.message : "Не удалось сохранить");
    } finally {
      setIsSavingMeetingGeneral(false);
    }
  };

  return (
    <MembershipGate>
  {isLoading ? (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <div className="mb-4 inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-blue-500 border-r-transparent"></div>
          <p className="text-gray-600 dark:text-gray-400">Загрузка...</p>
        </div>
      </div>
  ) : !meeting ? (
      <div className="text-center py-12">
        <p className="text-gray-600 dark:text-gray-400">Заседание не найдено</p>
        <Link href="/dashboard/documents/meetings" className={`${backNavLinkButtonClass} mt-4 inline-flex`}>
          ← Назад к списку
        </Link>
      </div>
  ) : (
    <div className="space-y-6">
      {/* Шапка */}
      <div className="flex items-start justify-between">
        <div>
          <Link href="/dashboard/documents/meetings" className={`${backNavLinkButtonClass} mb-2`}>
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
          {readOnly && (
            <span className="rounded-lg border border-gray-300 bg-gray-50 px-3 py-1.5 text-sm text-gray-600 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-400">
              Только просмотр
            </span>
          )}
          {canDeleteMeeting && (
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

      {/* Навигация по документам — скролл стрелками или тачем */}
      <nav
        className="mt-6 border-b border-gray-200 dark:border-gray-700"
        aria-label="Разделы заседания"
      >
        <HorizontalTabArrowStrip
          enabled={!!meeting && !isLoading}
          remeasureDeps={[meeting?.id, effectiveTab, meetingTabs.length]}
        >
          {(innerRef) => (
            <ul ref={innerRef} className="-mb-px flex min-w-max flex-nowrap gap-0">
          {meetingTabs.map((tab) => (
            <li key={tab.id}>
              <button
                type="button"
                onClick={() => {
                  const t = tab.id as typeof activeTab;
                  setActiveTab(t);
                  const q = t === "info" ? "" : `?tab=${t}`;
                  router.replace(`${pathname}${q}`);
                }}
                aria-current={effectiveTab === tab.id ? "page" : undefined}
                className={`
                  flex shrink-0 items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors
                  focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 rounded-t-md
                  ${effectiveTab === tab.id
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
                      ${effectiveTab === tab.id
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
          )}
        </HorizontalTabArrowStrip>
        {/* Контекст текущего раздела — одна строка вместо четырёх карточек */}
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-gray-500 dark:text-gray-400">
          {effectiveTab === "agenda" && (
            meeting.agendaDocument ? (
              <>
                <span className="font-medium text-gray-700 dark:text-gray-300">
                  {meeting.agendaDocument.regNumber ?? "Повестка дня"}
                </span>
                <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${agendaDisplayColor}`}>
                  {agendaDisplayStatus}
                </span>
              </>
            ) : (
              <span>Повестка не создана</span>
            )
          )}
          {effectiveTab === "protocol" && (
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
          {effectiveTab === "resolutions" && (
            <span>
              {meeting.resolutions.length === 0
                ? "Постановлений пока нет"
                : `${meeting.resolutions.length} ${meeting.resolutions.length === 1 ? "постановление" : meeting.resolutions.length < 5 ? "постановления" : "постановлений"}`
              }
            </span>
          )}
          {effectiveTab === "extracts" && (
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
      {effectiveTab === "info" && (
        <div className="flex flex-col gap-6">
          {/* Общая информация */}
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
              <div>
                <dt className="text-gray-500 dark:text-gray-400">Место проведения</dt>
                <dd className="font-medium">{meeting.location || "—"}</dd>
              </div>
            </dl>
          </div>

          {/* Участники и итог проведения: посещаемость известна только после протокола */}
          <div className="rounded-lg border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
            <h3 className="mb-4 font-semibold text-gray-900 dark:text-white">
              {meeting.protocolDocument ? "Итог проведения" : "Участники заседания"}
            </h3>
            <p className="mb-4 text-sm text-gray-500 dark:text-gray-400">
              {meeting.protocolDocument
                ? "Участники и статус присутствия по итогам заседания (только просмотр)."
                : "Состав участников. Посещаемость (присутствовали / отсутствовали) будет указана в протоколе после проведения заседания."}
            </p>
            {meeting.protocolDocument ? (
              <div className="grid gap-6 sm:grid-cols-2">
                <div>
                  <h4 className="mb-2 text-xs font-medium uppercase tracking-wide text-green-600 dark:text-green-400">
                    Присутствовали ({presentSummary.length})
                  </h4>
                  <ul className="space-y-1.5 text-sm">
                    {presentSummary.map((p) => (
                      <li key={p.id} className="flex items-center gap-2">
                        <span className="h-2 w-2 shrink-0 rounded-full bg-green-500" />
                        <span>{getParticipantName(p)}</span>
                        {p.role === "CHAIRMAN" && <span className="text-xs text-blue-600">(Председатель)</span>}
                        {p.role === "SECRETARY" && <span className="text-xs text-purple-600">(Секретарь)</span>}
                        {p.externalName && <span className="text-xs text-gray-500">(приглашенный)</span>}
                        <span className="text-xs text-gray-500">
                          {p.attendance === "PRESENT_ONLINE" ? "онлайн" : "очно"}
                        </span>
                      </li>
                    ))}
                    {presentSummary.length === 0 && (
                      <li className="text-gray-500 dark:text-gray-400">—</li>
                    )}
                  </ul>
                </div>
                <div>
                  <h4 className="mb-2 text-xs font-medium uppercase tracking-wide text-red-600 dark:text-red-400">
                    Отсутствовали ({absentSummary.length})
                  </h4>
                  <ul className="space-y-1.5 text-sm">
                    {absentSummary.map((p) => (
                      <li key={p.id} className="flex items-center gap-2">
                        <span className="h-2 w-2 shrink-0 rounded-full bg-red-500" />
                        <span>{getParticipantName(p)}</span>
                        {p.role === "CHAIRMAN" && <span className="text-xs text-blue-600">(Председатель)</span>}
                        {p.role === "SECRETARY" && <span className="text-xs text-purple-600">(Секретарь)</span>}
                        {p.externalName && <span className="text-xs text-gray-500">(приглашенный)</span>}
                        {p.attendance === "EXCUSED" && <span className="text-xs text-gray-500">(уваж. причина)</span>}
                      </li>
                    ))}
                    {absentSummary.length === 0 && (
                      <li className="text-gray-500 dark:text-gray-400">—</li>
                    )}
                  </ul>
                  {unmarkedSummary.length > 0 && (
                    <>
                      <h4 className="mt-4 mb-2 text-xs font-medium uppercase tracking-wide text-amber-600 dark:text-amber-400">
                        Не отмечены ({unmarkedSummary.length})
                      </h4>
                      <ul className="space-y-1.5 text-sm">
                        {unmarkedSummary.map((p) => (
                          <li key={p.id} className="flex items-center gap-2">
                            <span className="h-2 w-2 shrink-0 rounded-full bg-amber-400" />
                            <span className="text-gray-500 dark:text-gray-400">{getParticipantName(p)}</span>
                            {p.externalName && <span className="text-xs text-gray-500">(приглашенный)</span>}
                          </li>
                        ))}
                      </ul>
                    </>
                  )}
                </div>
              </div>
            ) : (
              <div>
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  Статус посещаемости: пока неизвестен
                </p>
                <ul className="space-y-1.5 text-sm">
                  {meeting.participants.map((p) => (
                    <li key={p.id} className="flex items-center gap-2">
                      <span className="h-2 w-2 shrink-0 rounded-full bg-gray-400 dark:bg-gray-500" />
                      <span>{getParticipantName(p)}</span>
                      {p.role === "CHAIRMAN" && <span className="text-xs text-blue-600">(Председатель)</span>}
                      {p.role === "SECRETARY" && <span className="text-xs text-purple-600">(Секретарь)</span>}
                      {p.externalName && <span className="text-xs text-gray-500">(приглашенный)</span>}
                    </li>
                  ))}
                  {meeting.participants.length === 0 && (
                    <li className="text-gray-500 dark:text-gray-400">Нет участников</li>
                  )}
                </ul>
              </div>
            )}
          </div>

          {/* Что утверждено */}
          <div className="rounded-lg border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
            <h3 className="mb-4 font-semibold text-gray-900 dark:text-white">Утверждено</h3>
            <ul className="space-y-2 text-sm">
              <li className="flex items-center gap-2">
                {meeting.agendaDocument?.status === "COMPLETED" ? (
                  <span className="h-5 w-5 rounded-full bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400 flex items-center justify-center flex-shrink-0">
                    <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
                  </span>
                ) : (
                  <span className="h-5 w-5 rounded-full bg-gray-200 dark:bg-gray-600 flex-shrink-0" />
                )}
                <span>Повестка дня</span>
                {meeting.agendaDocument?.regNumber && (
                  <span className="text-gray-500 dark:text-gray-400">— {meeting.agendaDocument.regNumber}</span>
                )}
                {meeting.agendaDocument?.status === "COMPLETED" && (
                  <span className="text-green-600 dark:text-green-400 text-xs font-medium">утверждена</span>
                )}
              </li>
              <li className="flex items-center gap-2">
                {meeting.protocolDocument?.status === "COMPLETED" ? (
                  <span className="h-5 w-5 rounded-full bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400 flex items-center justify-center flex-shrink-0">
                    <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
                  </span>
                ) : (
                  <span className="h-5 w-5 rounded-full bg-gray-200 dark:bg-gray-600 flex-shrink-0" />
                )}
                <span>Протокол</span>
                {meeting.protocolDocument?.regNumber && (
                  <span className="text-gray-500 dark:text-gray-400">— {meeting.protocolDocument.regNumber}</span>
                )}
                {meeting.protocolDocument?.status === "COMPLETED" && (
                  <span className="text-green-600 dark:text-green-400 text-xs font-medium">утверждён</span>
                )}
              </li>
              {meeting.agendaItems.length > 0 && meeting.protocolDocument?.status === "COMPLETED" && (
                <>
                  <li className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-600 text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    Вопросы повестки
                  </li>
                  {meeting.agendaItems.map((item) => (
                    <li key={item.id} className="flex items-center gap-2 pl-7">
                      {item.isApproved === true ? (
                        <span className="h-4 w-4 rounded-full bg-green-100 text-green-600 dark:bg-green-900/30 flex items-center justify-center flex-shrink-0">
                          <svg className="h-2.5 w-2.5" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
                        </span>
                      ) : item.isApproved === false ? (
                        <span className="h-4 w-4 rounded-full bg-red-100 text-red-600 dark:bg-red-900/30 flex items-center justify-center flex-shrink-0">
                          <svg className="h-2.5 w-2.5" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
                        </span>
                      ) : (
                        <span className="h-4 w-4 rounded-full bg-gray-200 dark:bg-gray-600 flex-shrink-0" />
                      )}
                      <span className={item.isApproved === true ? "text-gray-900 dark:text-white" : item.isApproved === false ? "text-red-600 dark:text-red-400" : "text-gray-500 dark:text-gray-400"}>
                        {item.orderNumber}. {item.title}
                      </span>
                      {item.isApproved === true && <span className="text-green-600 dark:text-green-400 text-xs font-medium">принят</span>}
                      {item.isApproved === false && <span className="text-red-600 dark:text-red-400 text-xs font-medium">не принят</span>}
                      {item.isApproved == null && <span className="text-gray-400 dark:text-gray-500 text-xs">не голосовали</span>}
                    </li>
                  ))}
                </>
              )}
            </ul>
          </div>
        </div>
      )}

      {effectiveTab === "agenda" && (
        <div className="space-y-6">
          {/* Документ повестки */}
          {meeting.agendaDocument ? (
            <div className="rounded-lg border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                    Повестка дня {meeting.agendaDocument.regNumber}
                  </h3>
                  <span className={`mt-2 inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${agendaDisplayColor}`}>
                    {agendaDisplayStatus}
                  </span>
                </div>
                {meeting.groupChat && (
                  <a
                    href={`/dashboard/chat?chatId=${meeting.groupChat.id}`}
                    className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium ${(meeting.groupChat as { archivedAt?: Date | string | null }).archivedAt || meeting.status === "COMPLETED"
                      ? "border-gray-200 bg-gray-100 text-gray-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-400"
                      : "border-gray-300 bg-gray-50 text-gray-700 hover:bg-gray-100 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"}`}
                    title={(meeting.groupChat as { archivedAt?: Date | string | null }).archivedAt || meeting.status === "COMPLETED" ? "Чат закрыт после завершения заседания (только просмотр)" : undefined}
                  >
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                    </svg>
                    {(meeting.groupChat as { archivedAt?: Date | string | null }).archivedAt || meeting.status === "COMPLETED" ? "Чат заседания (архив)" : "Чат заседания"}
                  </a>
                )}
              </div>

              <div className="flex flex-wrap gap-2">
                {meeting.agendaDocument && (
                  <>
                    {(agendaDataChangedSinceLoad || agendaNeedsRegenerate) && canEditAgenda && canDeleteMeeting && !protocolApproved ? (
                      <button
                        type="button"
                        onClick={() => handleGenerateDocument("AGENDA", meeting.agendaDocument!.regNumber ?? undefined)}
                        disabled={isGenerating}
                        className="inline-flex items-center justify-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-medium text-amber-800 transition-colors hover:bg-amber-100 disabled:opacity-50 dark:border-amber-600 dark:bg-amber-900/30 dark:text-amber-200 dark:hover:bg-amber-900/50"
                        title="Пересоздать PDF по текущим пунктам повестки"
                      >
                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                        {isGenerating ? "Пересоздание…" : "Пересоздать документ"}
                      </button>
                    ) : (
                      <button
                        onClick={() => setPdfPreviewUrl(getDocumentViewUrl(meeting.agendaDocument!.id))}
                        className="inline-flex items-center justify-center gap-2 rounded-lg border border-blue-300 bg-blue-50 px-4 py-2 text-sm font-medium text-blue-700 transition-colors hover:bg-blue-100 dark:border-blue-700 dark:bg-blue-900/30 dark:text-blue-300 dark:hover:bg-blue-900/50"
                      >
                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                        </svg>
                        Повестка дня PDF
                      </button>
                    )}
                    {meeting.agendaDocument.status === "PENDING_APPROVAL" && !participantHasApprovedAgenda && !isChairman && (
                      <>
                        <button
                          type="button"
                          onClick={async () => {
                            try {
                              setAgendaParticipantApprovalSubmitting(true);
                              const res = await fetch(`/api/ppo-head/meetings/${resolvedParams.id}/documents/${meeting.agendaDocument!.id}/approve`, {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ action: "approve" }),
                              });
                              const data = await res.json().catch(() => ({}));
                              if (!res.ok) throw new Error(data.error || "Ошибка согласования");
                              alertSuccess("Повестка согласована");
                              loadMeeting();
                            } catch (e) {
                              alertError(e instanceof Error ? e.message : "Не удалось согласовать");
                            } finally {
                              setAgendaParticipantApprovalSubmitting(false);
                            }
                          }}
                          disabled={agendaParticipantApprovalSubmitting}
                          className="inline-flex items-center justify-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-green-700 disabled:opacity-50 dark:bg-green-600 dark:hover:bg-green-700"
                          title="Согласовать повестку дня"
                        >
                          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                          {agendaParticipantApprovalSubmitting ? "…" : "Согласовать"}
                        </button>
                        <button
                          type="button"
                          onClick={async () => {
                            try {
                              setAgendaParticipantApprovalSubmitting(true);
                              const res = await fetch(`/api/ppo-head/meetings/${resolvedParams.id}/documents/${meeting.agendaDocument!.id}/approve`, {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ action: "reject" }),
                              });
                              const data = await res.json().catch(() => ({}));
                              if (!res.ok) throw new Error(data.error || "Ошибка отклонения");
                              alertSuccess("Повестка отклонена");
                              loadMeeting();
                            } catch (e) {
                              alertError(e instanceof Error ? e.message : "Не удалось отклонить");
                            } finally {
                              setAgendaParticipantApprovalSubmitting(false);
                            }
                          }}
                          disabled={agendaParticipantApprovalSubmitting}
                          className="inline-flex items-center justify-center gap-2 rounded-lg border border-red-300 bg-red-50 px-4 py-2 text-sm font-medium text-red-700 transition-colors hover:bg-red-100 disabled:opacity-50 dark:border-red-700 dark:bg-red-900/30 dark:text-red-300 dark:hover:bg-red-900/50"
                          title="Отклонить повестку с примечаниями"
                        >
                          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                          Отклонить
                        </button>
                      </>
                    )}
                  </>
                )}
                {meeting.agendaDocument.status !== "COMPLETED" && (
                <p className="mb-2 text-xs text-gray-500 dark:text-gray-400">
                  Шаги: 1) Разослать — участники получат документ во входящие, push и email, создаётся групповой чат заседания. 2) Участники согласуют или отклоняют с примечаниями во входящих. 3) После согласования всеми — утвердите повестку. Либо утвердите без согласования (быстрый путь).
                </p>
                )}
                {!readOnly && (meeting.agendaDocument.status === "DRAFT" || meeting.agendaDocument.status === "PENDING_APPROVAL") && (
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Согласование:</span>
                    {meeting.agendaDocument.status === "DRAFT" && (
                      <>
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
                              alertSuccess(data.message || "Повестка отправлена на согласование");
                              loadMeeting();
                            } catch (error) {
                              alertError(error instanceof Error ? error.message : "Не удалось отправить на согласование");
                            } finally {
                              setIsSendingForApproval(false);
                            }
                          }}
                          disabled={isSendingForApproval}
                          className="inline-flex items-center justify-center gap-2 rounded-lg border border-orange-300 bg-orange-50 px-4 py-2 text-sm font-medium text-orange-700 transition-colors hover:bg-orange-100 disabled:opacity-50 dark:border-orange-700 dark:bg-orange-900/30 dark:text-orange-300 dark:hover:bg-orange-900/50"
                          title="Участники получат повестку во входящие, push и email; создаётся групповой чат заседания"
                        >
                          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                          </svg>
                          {isSendingForApproval ? "Отправка…" : "Разослать на согласование"}
                        </button>
                        {canDeleteMeeting && (
                        <button
                          onClick={async () => {
                            try {
                              setIsApproving(true);
                              const response = await fetch(`/api/ppo-head/meetings/${resolvedParams.id}/documents/${meeting.agendaDocument!.id}/direct-approve`, {
                                method: "POST",
                              });
                              if (!response.ok) {
                                const error = await response.json();
                                throw new Error(error.error || "Ошибка утверждения");
                              }
                              const data = await response.json();
                              alertSuccess(data.message || "Повестка утверждена");
                              loadMeeting();
                            } catch (error) {
                              alertError(error instanceof Error ? error.message : "Не удалось утвердить повестку");
                            } finally {
                              setIsApproving(false);
                            }
                          }}
                          disabled={isApproving}
                          className="inline-flex items-center justify-center gap-2 rounded-lg border border-green-300 bg-green-50 px-4 py-2 text-sm font-medium text-green-700 transition-colors hover:bg-green-100 disabled:opacity-50 dark:border-green-700 dark:bg-green-900/30 dark:text-green-300 dark:hover:bg-green-900/50"
                          title="Утвердить повестку без согласования участниками"
                        >
                          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                          {isApproving ? "Утверждение…" : "Утвердить без согласования"}
                        </button>
                        )}
                      </>
                    )}
                    {meeting.agendaDocument.status === "PENDING_APPROVAL" && (
                      <>
                        {meeting.agendaDocument.approvals && meeting.agendaDocument.approvals.length > 0 && (
                          <div className="w-full rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-600 dark:bg-gray-800/50">
                            <span className="text-xs font-medium text-gray-600 dark:text-gray-300">Обратная связь участников:</span>
                            <ul className="mt-1 space-y-1 text-sm">
                              {meeting.agendaDocument.approvals.map((a: { id: string; status: string; comment: string | null; approvedAt: string | null; user: { firstName: string | null; lastName: string | null; middleName: string | null } }) => (
                                <li key={a.id} className="flex flex-wrap items-baseline gap-2">
                                  <span className="font-medium text-gray-800 dark:text-gray-200">
                                    {[a.user?.lastName, a.user?.firstName, a.user?.middleName].filter(Boolean).join(" ")}
                                  </span>
                                  <span className={a.status === "APPROVED" ? "text-green-600 dark:text-green-400" : a.status === "REJECTED" ? "text-red-600 dark:text-red-400" : "text-amber-600 dark:text-amber-400"}>
                                    {a.status === "APPROVED" ? "согласовал" : a.status === "REJECTED" ? "отклонил" : "ожидает"}
                                  </span>
                                  {a.comment && <span className="text-gray-600 dark:text-gray-400">— {a.comment}</span>}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                        {canDeleteMeeting && meeting.agendaDocument.approvals?.every((a: { status: string }) => a.status === "APPROVED") && (
                          <button
                            onClick={async () => {
                              try {
                                setIsApproving(true);
                                const response = await fetch(`/api/ppo-head/meetings/${resolvedParams.id}/documents/${meeting.agendaDocument!.id}/final-approve`, {
                                  method: "POST",
                                  headers: { "Content-Type": "application/json" },
                                  body: JSON.stringify({}),
                                });
                                if (!response.ok) {
                                  const error = await response.json();
                                  throw new Error(error.error || "Ошибка утверждения");
                                }
                                const data = await response.json();
                                alertSuccess(data.message || "Повестка утверждена");
                                loadMeeting();
                              } catch (error) {
                                alertError(error instanceof Error ? error.message : "Не удалось утвердить повестку");
                              } finally {
                                setIsApproving(false);
                              }
                            }}
                            disabled={isApproving}
                            className="inline-flex items-center justify-center gap-2 rounded-lg border border-green-300 bg-green-50 px-4 py-2 text-sm font-medium text-green-700 transition-colors hover:bg-green-100 disabled:opacity-50 dark:border-green-700 dark:bg-green-900/30 dark:text-green-300 dark:hover:bg-green-900/50"
                            title="Утвердить повестку после согласования всеми участниками"
                          >
                            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                            {isApproving ? "Утверждение…" : "Утвердить повестку"}
                          </button>
                        )}
                      </>
                    )}
                  </div>
                )}
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
              {!readOnly && meeting.agendaItems.length > 0 && (
                <div className="mt-4 flex flex-col items-center gap-3 sm:flex-row sm:justify-center sm:gap-4">
                  <div className="w-full max-w-xs">
                    <label htmlFor="agenda-reg-number" className="block text-left text-xs font-medium text-gray-500 dark:text-gray-400">
                      Номер документа (необязательно)
                    </label>
                    <input
                      id="agenda-reg-number"
                      type="text"
                      value={agendaRegNumberOverride}
                      onChange={(e) => setAgendaRegNumberOverride(e.target.value)}
                      placeholder="Например: AG00001 или оставьте пустым"
                      className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => handleGenerateDocument("AGENDA", agendaRegNumberOverride)}
                    disabled={isGenerating}
                    className="rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isGenerating ? "Формирование…" : "Сформировать повестку дня"}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Пункты повестки */}
          <div className="rounded-lg border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                Пункты повестки дня ({meeting.agendaItems.length})
              </h3>
              {canAddAgendaItems && !protocolApproved && !showAddAgendaForm && (
                <button
                  type="button"
                  onClick={() => {
                    const currentUserId = session?.user?.id;
                    const defaultSpeaker = currentUserId ? speakerOptionsForNewAgenda.find((m) => m.id === currentUserId) : null;
                    setNewAgendaForm((prev) => ({
                      ...prev,
                      title: "",
                      description: "",
                      speakerId: defaultSpeaker ? defaultSpeaker.id : "",
                      speakerName: defaultSpeaker ? getElectedMemberName(defaultSpeaker) : "",
                      speakerPosition: defaultSpeaker ? (defaultSpeaker.jobTitle || defaultSpeaker.roleName || "") : "",
                      coSpeakers: [],
                      attachments: [],
                    }));
                    setShowAddAgendaForm(true);
                  }}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
                >
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  Добавить пункт
                </button>
              )}
            </div>
            {meeting.agendaItems.length === 0 && !showAddAgendaForm ? (
              <div className="py-8 text-center text-gray-500 dark:text-gray-400">
                Нет пунктов в повестке. {canAddAgendaItems && !protocolApproved && "Нажмите «Добавить пункт»."}
              </div>
            ) : (
              <div className="space-y-3">
                {meeting.agendaItems.map((item) => (
                  <div
                    key={item.id}
                    className="rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800/50"
                  >
                    {editingAgendaId === item.id && canDeleteMeeting && !participantHasApprovedAgenda ? (
                      <div className="space-y-3">
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                          Слушали (тема вопроса) *
                        </label>
                        <input
                          type="text"
                          value={agendaEditForm[item.id]?.title ?? item.title}
                          onChange={(e) =>
                            setAgendaEditForm((prev) => ({
                              ...prev,
                              [item.id]: { ...(prev[item.id] ?? { title: item.title, description: item.description || "", speakerId: item.speakerId || "", speakerName: item.speakerName || "", speakerPosition: item.speakerPosition || "", coSpeakers: parseCoSpeakersFromItem(item), attachments: parseAgendaAttachments(item) }), title: e.target.value },
                            }))
                          }
                          className="block w-full rounded-md border border-gray-300 px-3 py-2 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                          placeholder="О чём будет обсуждение..."
                        />
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                          Описание / материалы (опционально)
                        </label>
                        <textarea
                          value={agendaEditForm[item.id]?.description ?? item.description ?? ""}
                          onChange={(e) =>
                            setAgendaEditForm((prev) => ({
                              ...prev,
                              [item.id]: { ...(prev[item.id] ?? { title: item.title, description: item.description || "", speakerId: item.speakerId || "", speakerName: item.speakerName || "", speakerPosition: item.speakerPosition || "", coSpeakers: parseCoSpeakersFromItem(item), attachments: parseAgendaAttachments(item) }), description: e.target.value },
                            }))
                          }
                          rows={2}
                          className="block w-full rounded-md border border-gray-300 px-3 py-2 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                          placeholder="Дополнительная информация по вопросу..."
                        />
                        <div>
                          <input
                            type="file"
                            id={`agenda-edit-file-${item.id}`}
                            className="hidden"
                            aria-label={`Прикрепить файл к вопросу ${item.orderNumber}`}
                            accept=".pdf,.doc,.docx,.xls,.xlsx,.txt,.md,.csv,.ppt,.pptx,.odt,.ods,.odp,.rtf,.jpg,.jpeg,.png,.zip"
                            onChange={async (e) => {
                              const file = e.target.files?.[0];
                              const input = e.target as HTMLInputElement;
                              if (!file) return;
                              setUploadingAttachmentAgendaId(item.id);
                              try {
                                const fd = new FormData();
                                fd.append("file", file);
                                const res = await fetch("/api/ppo-head/meetings/agenda-attachment", { method: "POST", body: fd });
                                if (!res.ok) {
                                  const err = await res.json().catch(() => ({}));
                                  throw new Error(err.error || "Ошибка загрузки");
                                }
                                const data = await res.json();
                                const list = (agendaEditForm[item.id]?.attachments ?? parseAgendaAttachments(item)).concat([{ name: data.name, url: data.url, size: data.size }]);
                                setAgendaEditForm((prev) => ({ ...prev, [item.id]: { ...(prev[item.id] ?? { title: item.title, description: item.description || "", speakerId: item.speakerId || "", speakerName: item.speakerName || "", speakerPosition: item.speakerPosition || "", coSpeakers: parseCoSpeakersFromItem(item), attachments: parseAgendaAttachments(item) }), attachments: list } }));
                              } catch (err) {
                                alertError(err instanceof Error ? err.message : "Не удалось загрузить файл");
                              } finally {
                                setUploadingAttachmentAgendaId(null);
                                if (input) input.value = "";
                              }
                            }}
                          />
                          <button
                            type="button"
                            onClick={() => document.getElementById(`agenda-edit-file-${item.id}`)?.click()}
                            disabled={uploadingAttachmentAgendaId === item.id}
                            className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-700 shadow-sm hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600"
                          >
                            {uploadingAttachmentAgendaId === item.id ? "Загрузка…" : (
                              <>
                                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                                </svg>
                                Прикрепить файл
                              </>
                            )}
                          </button>
                          {((agendaEditForm[item.id]?.attachments ?? parseAgendaAttachments(item)).length > 0) && (
                            <ul className="mt-1.5 space-y-1">
                              {(agendaEditForm[item.id]?.attachments ?? parseAgendaAttachments(item)).map((att, i) => (
                                <li key={i} className="flex items-center gap-2 text-sm">
                                  <button type="button" onClick={() => setPdfPreviewUrl(att.url)} className="min-w-0 flex-1 text-left break-words text-blue-600 hover:underline dark:text-blue-400" title={att.name}>{att.name}</button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const list = (agendaEditForm[item.id]?.attachments ?? parseAgendaAttachments(item)).filter((_, j) => j !== i);
                                      setAgendaEditForm((prev) => ({ ...prev, [item.id]: { ...(prev[item.id] ?? { title: item.title, description: item.description || "", speakerId: item.speakerId || "", speakerName: item.speakerName || "", speakerPosition: item.speakerPosition || "", coSpeakers: parseCoSpeakersFromItem(item), attachments: parseAgendaAttachments(item) }), attachments: list } }));
                                    }}
                                    className="text-red-500 hover:text-red-700 p-0.5"
                                    title="Удалить"
                                  >
                                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                  </button>
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                          Докладывает * (только члены выборного органа)
                        </label>
                        <select
                          aria-label={`Докладчик по вопросу ${item.orderNumber}`}
                          value={agendaEditForm[item.id]?.speakerId ?? item.speakerId ?? ""}
                          onChange={(e) => {
                            const id = e.target.value;
                            const m = electedBody.find((x) => x.id === id);
                            const base = agendaEditForm[item.id] ?? { title: item.title, description: item.description || "", speakerId: item.speakerId || "", speakerName: item.speakerName || "", speakerPosition: item.speakerPosition || "", coSpeakers: parseCoSpeakersFromItem(item), attachments: parseAgendaAttachments(item) };
                            const coSpeakers = id ? (base.coSpeakers || []).filter((c) => c.userId !== id) : (base.coSpeakers || []);
                            setAgendaEditForm((prev) => ({
                              ...prev,
                              [item.id]: {
                                ...(prev[item.id] ?? base),
                                speakerId: id,
                                speakerName: m ? getElectedMemberName(m) : "",
                                speakerPosition: m ? (m.jobTitle || m.roleName || "") : "",
                                coSpeakers,
                              },
                            }));
                          }}
                          className={`block w-full rounded-md border border-gray-300 px-3 py-2 dark:border-gray-600 dark:bg-gray-700 ${(agendaEditForm[item.id]?.speakerId ?? item.speakerId ?? "") ? "dark:text-white" : "dark:text-gray-400"}`}
                        >
                          <option value="">— Выберите докладчика —</option>
                          {electedBody.map((m) => {
                            const coSpeakers = agendaEditForm[item.id]?.coSpeakers ?? parseCoSpeakersFromItem(item);
                            const isCoSpeaker = coSpeakers.some((c) => c.userId === m.id);
                            return (
                              <option key={m.id} value={m.id} disabled={isCoSpeaker}>
                                {getElectedMemberName(m)}
                                {m.jobTitle || m.roleName ? ` (${m.jobTitle || m.roleName})` : ""}
                                {isCoSpeaker ? " — уже со-докладчик" : ""}
                              </option>
                            );
                          })}
                        </select>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                          Со-докладчики (опционально)
                        </label>
                        <p className="mb-1.5 text-xs text-gray-500 dark:text-gray-400">
                          Можно несколько. Нажмите «+ Добавить ещё», чтобы выбрать.
                        </p>
                        <div ref={coSpeakerDropdownAgendaId === item.id ? coSpeakerDropdownRef : undefined} className="relative">
                          <div className="flex flex-wrap gap-2">
                            {(agendaEditForm[item.id]?.coSpeakers ?? parseCoSpeakersFromItem(item)).map((c, cIdx) => (
                              <span key={cIdx} className="inline-flex items-center gap-1 rounded-md bg-gray-200 dark:bg-gray-700 px-2 py-1 text-sm">
                                {c.name}{c.position ? ` (${c.position})` : ""}
                                <button
                                  type="button"
                                  onClick={() => {
                                    const list = (agendaEditForm[item.id]?.coSpeakers ?? parseCoSpeakersFromItem(item)).filter((_, j) => j !== cIdx);
                                    setAgendaEditForm((prev) => ({ ...prev, [item.id]: { ...(prev[item.id] ?? { title: item.title, description: item.description || "", speakerId: item.speakerId || "", speakerName: item.speakerName || "", speakerPosition: item.speakerPosition || "", coSpeakers: parseCoSpeakersFromItem(item), attachments: parseAgendaAttachments(item) }), coSpeakers: list } }));
                                  }}
                                  className="text-gray-500 hover:text-red-600 dark:hover:text-red-400"
                                  aria-label="Убрать со-докладчика"
                                >
                                  ×
                                </button>
                              </span>
                            ))}
                            <button
                              type="button"
                              onClick={() => setCoSpeakerDropdownAgendaId(coSpeakerDropdownAgendaId === item.id ? null : item.id)}
                              className="inline-flex items-center gap-1 rounded-md border border-gray-300 bg-white px-2 py-1 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                            >
                              + Добавить ещё
                            </button>
                          </div>
                          {coSpeakerDropdownAgendaId === item.id && (
                            <div className="absolute z-10 left-0 mt-1 max-h-56 w-72 overflow-y-auto rounded-lg border border-gray-200 bg-white py-1 shadow-lg dark:border-gray-600 dark:bg-gray-800">
                              {electedBody.length > 0 && (
                                <>
                                  <div className="px-3 py-1.5 text-xs font-medium text-gray-500 dark:text-gray-400 border-b border-gray-100 dark:border-gray-700">Члены выборного органа</div>
                                  {electedBody.map((m) => {
                                    const list = agendaEditForm[item.id]?.coSpeakers ?? parseCoSpeakersFromItem(item);
                                    const currentSpeakerId = agendaEditForm[item.id]?.speakerId ?? item.speakerId ?? "";
                                    const added = list.some((c) => c.userId === m.id);
                                    const isMainSpeaker = m.id === currentSpeakerId;
                                    const disabled = added || isMainSpeaker;
                                    return (
                                      <button
                                        key={m.id}
                                        type="button"
                                        disabled={disabled}
                                        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover-surface disabled:opacity-50"
                                        onClick={() => {
                                          const list = agendaEditForm[item.id]?.coSpeakers ?? parseCoSpeakersFromItem(item);
                                          const sid = agendaEditForm[item.id]?.speakerId ?? item.speakerId ?? "";
                                          if (list.some((c) => c.userId === m.id) || m.id === sid) return;
                                          setAgendaEditForm((prev) => ({ ...prev, [item.id]: { ...(prev[item.id] ?? { title: item.title, description: item.description || "", speakerId: item.speakerId || "", speakerName: item.speakerName || "", speakerPosition: item.speakerPosition || "", coSpeakers: parseCoSpeakersFromItem(item), attachments: parseAgendaAttachments(item) }), coSpeakers: [...list, { userId: m.id, name: getElectedMemberName(m), position: m.jobTitle || m.roleName || "" }] } }));
                                          setCoSpeakerDropdownAgendaId(null);
                                        }}
                                      >
                                        {getElectedMemberName(m)}
                                        {m.jobTitle || m.roleName ? ` (${m.jobTitle || m.roleName})` : ""}
                                        {isMainSpeaker ? " — докладчик" : ""}
                                      </button>
                                    );
                                  })}
                                </>
                              )}
                              {meeting?.participants?.filter((p) => p.externalName).length ? (
                                <>
                                  <div className="px-3 py-1.5 text-xs font-medium text-gray-500 dark:text-gray-400 border-t border-gray-100 dark:border-gray-700">Приглашённые</div>
                                  {meeting.participants.filter((p) => p.externalName).map((p) => {
                                    const list = agendaEditForm[item.id]?.coSpeakers ?? parseCoSpeakersFromItem(item);
                                    const added = list.some((c) => c.extId === p.id);
                                    const currentSpeakerName = agendaEditForm[item.id]?.speakerName ?? item.speakerName ?? "";
                                    const isMainSpeaker = p.externalName === currentSpeakerName;
                                    const disabled = added || isMainSpeaker;
                                    return (
                                      <button
                                        key={p.id}
                                        type="button"
                                        disabled={disabled}
                                        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover-surface disabled:opacity-50"
                                        onClick={() => {
                                          const list = agendaEditForm[item.id]?.coSpeakers ?? parseCoSpeakersFromItem(item);
                                          const sName = agendaEditForm[item.id]?.speakerName ?? item.speakerName ?? "";
                                          if (list.some((c) => c.extId === p.id) || p.externalName === sName) return;
                                          setAgendaEditForm((prev) => ({ ...prev, [item.id]: { ...(prev[item.id] ?? { title: item.title, description: item.description || "", speakerId: item.speakerId || "", speakerName: item.speakerName || "", speakerPosition: item.speakerPosition || "", coSpeakers: parseCoSpeakersFromItem(item), attachments: parseAgendaAttachments(item) }), coSpeakers: [...list, { extId: p.id, name: p.externalName || "", position: p.externalPosition || undefined }] } }));
                                          setCoSpeakerDropdownAgendaId(null);
                                        }}
                                      >
                                        {p.externalName}
                                        {p.externalPosition ? ` (${p.externalPosition})` : ""}
                                        {isMainSpeaker ? " — докладчик" : ""}
                                      </button>
                                    );
                                  })}
                                </>
                              ) : null}
                              {electedBody.length === 0 && !meeting?.participants?.filter((p) => p.externalName).length ? (
                                <p className="px-3 py-2 text-xs text-gray-500">Нет участников для выбора</p>
                              ) : null}
                            </div>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-2 pt-2">
                          <button
                            type="button"
                            onClick={() => saveAgendaItem(item.id)}
                            disabled={isSavingAgenda || !(agendaEditForm[item.id]?.title?.trim()) || !(agendaEditForm[item.id]?.speakerId)}
                            className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                          >
                            {isSavingAgenda ? "Сохранение…" : "Сохранить"}
                          </button>
                          <button
                            type="button"
                            onClick={cancelEditAgendaItem}
                            className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover-surface dark:border-gray-600 dark:text-gray-300"
                          >
                            Отмена
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex min-w-0 flex-1 items-start gap-3">
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-200 text-sm font-medium text-blue-800 dark:bg-blue-900/30 dark:text-blue-400">
                            {item.orderNumber}
                          </span>
                          <div className="min-w-0 flex-1">
                            <h4 className="font-medium text-gray-900 dark:text-white">{item.title}</h4>
                            {item.description && (
                              <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">{item.description}</p>
                            )}
                            {(item.speakerName || item.speaker) && (
                              <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                                <strong>Докладчик:</strong>{" "}
                                {item.speakerName || [item.speaker?.lastName, item.speaker?.firstName].filter(Boolean).join(" ")}
                                {item.speakerPosition && `, ${item.speakerPosition}`}
                              </p>
                            )}
                            {item.coSpeakerName && (
                              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                                <strong>Со-докладчик:</strong> {item.coSpeakerName}
                              </p>
                            )}
                            {parseAgendaAttachments(item).length > 0 && (
                              <div className="mt-2 rounded-md border border-gray-200 bg-gray-50 p-3 dark:border-gray-600 dark:bg-gray-800/50">
                                <p className="text-xs font-medium text-gray-700 dark:text-gray-300">Прикреплённые к вопросу документы:</p>
                                <ul className="mt-1 space-y-1 min-w-0">
                                  {parseAgendaAttachments(item).map((att, i) => (
                                    <li key={i} className="text-sm min-w-0">
                                      <button type="button" onClick={() => setPdfPreviewUrl(att.url)} className="w-full text-left break-words text-blue-600 hover:underline dark:text-blue-400" title={att.name}>
                                        {att.name}
                                      </button>
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}
                          </div>
                        </div>
                        {canEditAgenda && canDeleteMeeting && !participantHasApprovedAgenda && (
                          <div className="flex shrink-0 items-center gap-1">
                            <button
                              type="button"
                              onClick={() => startEditAgendaItem(item)}
                              className="rounded-lg border border-gray-300 p-1.5 text-gray-500 hover:bg-gray-100 hover:text-blue-600 dark:border-gray-600 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-blue-400"
                              title="Редактировать"
                            >
                              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                              </svg>
                            </button>
                            <button
                              type="button"
                              onClick={() => deleteAgendaItem(item.id)}
                              disabled={deletingAgendaId === item.id}
                              className="rounded-lg border border-gray-300 p-1.5 text-gray-500 hover:bg-red-50 hover:text-red-600 disabled:opacity-50 dark:border-gray-600 dark:text-gray-400 dark:hover:bg-red-900/20 dark:hover:text-red-400"
                              title="Удалить"
                            >
                              {deletingAgendaId === item.id ? (
                                <span className="text-xs">…</span>
                              ) : (
                                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                              )}
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
                {showAddAgendaForm && (
                  <div className="rounded-lg border-2 border-dashed border-gray-300 bg-gray-50/80 p-4 dark:border-gray-600 dark:bg-gray-800/50">
                    <h4 className="mb-3 text-sm font-medium text-gray-900 dark:text-white">Новый пункт повестки</h4>
                    <div className="space-y-3">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Слушали (тема вопроса) *</label>
                        <input
                          type="text"
                          value={newAgendaForm.title}
                          onChange={(e) => setNewAgendaForm((prev) => ({ ...prev, title: e.target.value }))}
                          className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                          placeholder="О чём будет обсуждение..."
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Описание / материалы (опционально)</label>
                        <textarea
                          value={newAgendaForm.description}
                          onChange={(e) => setNewAgendaForm((prev) => ({ ...prev, description: e.target.value }))}
                          rows={2}
                          className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                          placeholder="Дополнительная информация по вопросу..."
                        />
                        <div className="mt-2">
                          <input
                            type="file"
                            id="agenda-new-file"
                            className="hidden"
                            aria-label="Прикрепить файл к новому вопросу"
                            accept=".pdf,.doc,.docx,.xls,.xlsx,.txt,.md,.csv,.ppt,.pptx,.odt,.ods,.odp,.rtf,.jpg,.jpeg,.png,.zip"
                            onChange={async (e) => {
                              const file = e.target.files?.[0];
                              const input = e.target as HTMLInputElement;
                              if (!file) return;
                              setUploadingNewAgendaAttachment(true);
                              try {
                                const fd = new FormData();
                                fd.append("file", file);
                                const res = await fetch("/api/ppo-head/meetings/agenda-attachment", { method: "POST", body: fd });
                                if (!res.ok) {
                                  const err = await res.json().catch(() => ({}));
                                  throw new Error(err.error || "Ошибка загрузки");
                                }
                                const data = await res.json();
                                setNewAgendaForm((prev) => ({ ...prev, attachments: (prev.attachments || []).concat([{ name: data.name, url: data.url, size: data.size }]) }));
                              } catch (err) {
                                alertError(err instanceof Error ? err.message : "Не удалось загрузить файл");
                              } finally {
                                setUploadingNewAgendaAttachment(false);
                                if (input) input.value = "";
                              }
                            }}
                          />
                          <button
                            type="button"
                            onClick={() => document.getElementById("agenda-new-file")?.click()}
                            disabled={uploadingNewAgendaAttachment}
                            className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-700 shadow-sm hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600"
                          >
                            {uploadingNewAgendaAttachment ? "Загрузка…" : (
                              <>
                                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                                </svg>
                                Прикрепить файл
                              </>
                            )}
                          </button>
                          {(newAgendaForm.attachments?.length ?? 0) > 0 && (
                            <ul className="mt-1.5 space-y-1">
                              {(newAgendaForm.attachments || []).map((att, i) => (
                                <li key={i} className="flex items-center gap-2 text-sm">
                                  <button type="button" onClick={() => setPdfPreviewUrl(att.url)} className="min-w-0 flex-1 text-left break-words text-blue-600 hover:underline dark:text-blue-400" title={att.name}>{att.name}</button>
                                  <button
                                    type="button"
                                    onClick={() => setNewAgendaForm((prev) => ({ ...prev, attachments: (prev.attachments || []).filter((_, j) => j !== i) }))}
                                    className="text-red-500 hover:text-red-700 p-0.5"
                                    title="Удалить"
                                  >
                                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                  </button>
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Докладывает * (только члены выборного органа)</label>
                        <select
                          aria-label="Докладчик нового вопроса"
                          value={newAgendaForm.speakerId}
                          onChange={(e) => {
                            const id = e.target.value;
                            const m = speakerOptionsForNewAgenda.find((x) => x.id === id);
                            setNewAgendaForm((prev) => {
                              const coSpeakers = id ? (prev.coSpeakers || []).filter((c) => c.userId !== id) : (prev.coSpeakers || []);
                              return {
                                ...prev,
                                speakerId: id,
                                speakerName: m ? getElectedMemberName(m) : "",
                                speakerPosition: m ? (m.jobTitle || m.roleName || "") : "",
                                coSpeakers,
                              };
                            });
                          }}
                          className={`mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 dark:border-gray-600 dark:bg-gray-700 ${newAgendaForm.speakerId ? "dark:text-white" : "dark:text-gray-400"}`}
                        >
                          <option value="">— Выберите докладчика —</option>
                          {speakerOptionsForNewAgenda.map((m) => {
                            const isCoSpeaker = (newAgendaForm.coSpeakers || []).some((c) => c.userId === m.id);
                            return (
                              <option key={m.id} value={m.id} disabled={isCoSpeaker}>
                                {getElectedMemberName(m)}
                                {m.jobTitle || m.roleName ? ` (${m.jobTitle || m.roleName})` : ""}
                                {isCoSpeaker ? " — уже со-докладчик" : ""}
                              </option>
                            );
                          })}
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Со-докладчики (опционально)</label>
                        <p className="mb-1.5 text-xs text-gray-500 dark:text-gray-400">
                          Можно несколько. Нажмите «+ Добавить ещё», чтобы выбрать.
                        </p>
                        <div ref={coSpeakerDropdownNew ? coSpeakerDropdownRef : undefined} className="relative mt-1">
                          <div className="flex flex-wrap gap-2">
                            {(newAgendaForm.coSpeakers || []).map((c, cIdx) => (
                              <span key={cIdx} className="inline-flex items-center gap-1 rounded-md bg-gray-200 dark:bg-gray-700 px-2 py-1 text-sm">
                                {c.name}{c.position ? ` (${c.position})` : ""}
                                <button
                                  type="button"
                                  onClick={() => setNewAgendaForm((prev) => ({ ...prev, coSpeakers: (prev.coSpeakers || []).filter((_, j) => j !== cIdx) }))}
                                  className="text-gray-500 hover:text-red-600 dark:hover:text-red-400"
                                  aria-label="Убрать со-докладчика"
                                >
                                  ×
                                </button>
                              </span>
                            ))}
                            <button
                              type="button"
                              onClick={() => setCoSpeakerDropdownNew(!coSpeakerDropdownNew)}
                              className="inline-flex items-center gap-1 rounded-md border border-gray-300 bg-white px-2 py-1 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                            >
                              + Добавить ещё
                            </button>
                          </div>
                          {coSpeakerDropdownNew && (
                            <div className="absolute z-10 left-0 mt-1 max-h-56 w-72 overflow-y-auto rounded-lg border border-gray-200 bg-white py-1 shadow-lg dark:border-gray-600 dark:bg-gray-800">
                              {electedBody.length > 0 && (
                                <>
                                  <div className="px-3 py-1.5 text-xs font-medium text-gray-500 dark:text-gray-400 border-b border-gray-100 dark:border-gray-700">Члены выборного органа</div>
                                  {electedBody.map((m) => {
                                    const added = (newAgendaForm.coSpeakers || []).some((c) => c.userId === m.id);
                                    const isMainSpeaker = m.id === newAgendaForm.speakerId;
                                    const disabled = added || isMainSpeaker;
                                    return (
                                      <button
                                        key={m.id}
                                        type="button"
                                        disabled={disabled}
                                        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover-surface disabled:opacity-50"
                                        onClick={() => {
                                          if ((newAgendaForm.coSpeakers || []).some((c) => c.userId === m.id) || m.id === newAgendaForm.speakerId) return;
                                          setNewAgendaForm((prev) => ({ ...prev, coSpeakers: [...(prev.coSpeakers || []), { userId: m.id, name: getElectedMemberName(m), position: m.jobTitle || m.roleName || "" }] }));
                                          setCoSpeakerDropdownNew(false);
                                        }}
                                      >
                                        {getElectedMemberName(m)}
                                        {m.jobTitle || m.roleName ? ` (${m.jobTitle || m.roleName})` : ""}
                                        {isMainSpeaker ? " — докладчик" : ""}
                                      </button>
                                    );
                                  })}
                                </>
                              )}
                              {meeting?.participants?.filter((p) => p.externalName).length ? (
                                <>
                                  <div className="px-3 py-1.5 text-xs font-medium text-gray-500 dark:text-gray-400 border-t border-gray-100 dark:border-gray-700">Приглашённые</div>
                                  {meeting.participants.filter((p) => p.externalName).map((p) => {
                                    const added = (newAgendaForm.coSpeakers || []).some((c) => c.extId === p.id);
                                    const isMainSpeaker = p.externalName === newAgendaForm.speakerName;
                                    const disabled = added || isMainSpeaker;
                                    return (
                                      <button
                                        key={p.id}
                                        type="button"
                                        disabled={disabled}
                                        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover-surface disabled:opacity-50"
                                        onClick={() => {
                                          if ((newAgendaForm.coSpeakers || []).some((c) => c.extId === p.id) || p.externalName === newAgendaForm.speakerName) return;
                                          setNewAgendaForm((prev) => ({ ...prev, coSpeakers: [...(prev.coSpeakers || []), { extId: p.id, name: p.externalName || "", position: p.externalPosition || undefined }] }));
                                          setCoSpeakerDropdownNew(false);
                                        }}
                                      >
                                        {p.externalName}
                                        {p.externalPosition ? ` (${p.externalPosition})` : ""}
                                        {isMainSpeaker ? " — докладчик" : ""}
                                      </button>
                                    );
                                  })}
                                </>
                              ) : null}
                              {electedBody.length === 0 && !meeting?.participants?.filter((p) => p.externalName).length ? (
                                <p className="px-3 py-2 text-xs text-gray-500">Нет участников для выбора</p>
                              ) : null}
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={addAgendaItem}
                          disabled={isAddingAgenda || !newAgendaForm.title.trim() || !newAgendaForm.speakerId}
                          className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                        >
                          {isAddingAgenda ? "Добавление…" : "Добавить"}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setShowAddAgendaForm(false);
                            setNewAgendaForm({ title: "", description: "", speakerId: "", speakerName: "", speakerPosition: "", coSpeakers: [], attachments: [] });
                            setCoSpeakerDropdownNew(false);
                          }}
                          className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover-surface dark:border-gray-600 dark:text-gray-300"
                        >
                          Отмена
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {effectiveTab === "protocol" && (
        <div className="space-y-4">
          {!canCreateProtocol ? (
            <>
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                  Протокол
                </h3>
              </div>
              <div className="rounded-lg border-2 border-dashed border-gray-300 bg-white p-8 text-center dark:border-gray-700 dark:bg-gray-800">
                <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <h3 className="mt-2 text-sm font-medium text-gray-900 dark:text-white">Протокол не создан</h3>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                  Сначала нужно утвердить повестку заседания
                </p>
              </div>
            </>
          ) : protocolTabRestrictedEmpty ? (
            <>
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                  Протокол
                </h3>
              </div>
              <div className="rounded-lg border-2 border-dashed border-gray-300 bg-white p-8 text-center dark:border-gray-700 dark:bg-gray-800">
                <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <h3 className="mt-2 text-sm font-medium text-gray-900 dark:text-white">Протокол не создан</h3>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                  Доступ к разделу имеют председатель и заместитель председателя
                </p>
              </div>
            </>
          ) : (
          <>
          {/* Документ протокола */}
          {meeting.protocolDocument && (
            <div className="rounded-lg border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
              {!hasQuorum && (
                <div className="mb-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-700 dark:bg-amber-900/20">
                  <svg className="h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                  <p className="text-sm text-amber-800 dark:text-amber-200">
                    По текущим данным кворум отсутствует (присутствуют {maxVotes} из {totalEligible}). Протокол был сформирован ранее. Если изменили состав присутствующих — отредактируйте данные на вкладке «Протокол».
                  </p>
                </div>
              )}
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                    Протокол {meeting.protocolDocument.regNumber}
                  </h3>
                  <span className={`mt-2 inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${DOC_STATUS_COLORS[meeting.protocolDocument.status] || DOC_STATUS_COLORS.DRAFT}`}>
                    {DOC_STATUS_LABELS[meeting.protocolDocument.status] || "Черновик"}
                  </span>
                </div>
                {meeting.groupChat && (
                  <a
                    href={`/dashboard/chat?chatId=${meeting.groupChat.id}`}
                    className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium ${(meeting.groupChat as { archivedAt?: Date | string | null }).archivedAt || meeting.status === "COMPLETED"
                      ? "border-gray-200 bg-gray-100 text-gray-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-400"
                      : "border-gray-300 bg-gray-50 text-gray-700 hover:bg-gray-100 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"}`}
                    title={(meeting.groupChat as { archivedAt?: Date | string | null }).archivedAt || meeting.status === "COMPLETED" ? "Чат закрыт после завершения заседания (только просмотр)" : undefined}
                  >
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                    </svg>
                    {(meeting.groupChat as { archivedAt?: Date | string | null }).archivedAt || meeting.status === "COMPLETED" ? "Чат заседания (архив)" : "Чат заседания"}
                  </a>
                )}
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => setPdfPreviewUrl(getDocumentViewUrl(meeting.protocolDocument.id))}
                  className="inline-flex items-center justify-center gap-2 rounded-lg border border-blue-300 bg-blue-50 px-4 py-2 text-sm font-medium text-blue-700 transition-colors hover:bg-blue-100 dark:border-blue-700 dark:bg-blue-900/30 dark:text-blue-300 dark:hover:bg-blue-900/50"
                >
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                  Протокол PDF
                </button>
                {(meeting.protocolDocument.status === "COMPLETED" || meeting.protocolDocument.status === "SIGNED") && (
                      <>
                        {!readOnly && canDeleteMeeting && meeting.protocolDocument.status !== "SIGNED" && (
                          <>
                            <input
                              ref={protocolSignedFileInputRef}
                              type="file"
                              accept=".pdf,image/jpeg,image/jpg,image/png"
                              className="hidden"
                              aria-label="Загрузить подписанный протокол (скан)"
                              onChange={async (e) => {
                                const file = e.target.files?.[0];
                                if (!file || !meeting.protocolDocument) return;
                                setUploadingSignedProtocol(true);
                                try {
                                  const fd = new FormData();
                                  fd.append("file", file);
                                  fd.append("documentId", meeting.protocolDocument.id);
                                  const res = await fetch("/api/documents/upload-signed", { method: "POST", body: fd });
                                  const data = await res.json().catch(() => ({}));
                                  if (!res.ok) throw new Error(data.error || "Ошибка загрузки");
                                  alertSuccess(data.message || "Подписанный протокол загружен");
                                  loadMeeting();
                                } catch (err) {
                                  alertError(err instanceof Error ? err.message : "Не удалось загрузить скан");
                                } finally {
                                  setUploadingSignedProtocol(false);
                                  e.target.value = "";
                                }
                              }}
                            />
                            <button
                              type="button"
                              onClick={() => protocolSignedFileInputRef.current?.click()}
                              disabled={uploadingSignedProtocol}
                              className="inline-flex items-center justify-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-medium text-amber-800 transition-colors hover:bg-amber-100 disabled:opacity-50 dark:border-amber-600 dark:bg-amber-900/30 dark:text-amber-200 dark:hover:bg-amber-900/50"
                              title="Шаг 8: распечатайте протокол, подпишите у председательствующего и секретаря, загрузите скан"
                            >
                              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                              </svg>
                              {uploadingSignedProtocol ? "Загрузка…" : "Загрузить подписанный протокол (скан)"}
                            </button>
                          </>
                        )}
                        {(meeting.protocolDocument as { signedFilePath?: string | null }).signedFilePath && (
                          <>
                            {(canDeleteMeeting || meeting.protocolDocument.status === "SIGNED") && (
                            <button
                              type="button"
                              onClick={() => setPdfPreviewUrl(`${getDocumentViewUrl(meeting.protocolDocument.id)}&signed=true`)}
                              className="inline-flex items-center justify-center gap-2 rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-800 transition-colors hover:bg-emerald-100 dark:border-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-200 dark:hover:bg-emerald-900/50"
                              title="Просмотр загруженного подписанного протокола (скан)"
                            >
                              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                              </svg>
                              Подписанный протокол
                            </button>
                            )}
                            {canDeleteMeeting && (
                            <button
                              type="button"
                              disabled={meeting.protocolDocument.status === "SIGNED"}
                              onClick={async () => {
                                if (meeting.protocolDocument.status === "SIGNED") return;
                                try {
                                  const res = await fetch(
                                    `/api/ppo-head/meetings/${resolvedParams.id}/documents/${meeting.protocolDocument.id}/mark-signed`,
                                    { method: "POST" }
                                  );
                                  if (!res.ok) {
                                    const err = await res.json().catch(() => ({}));
                                    throw new Error(err.error || "Ошибка");
                                  }
                                  const data = await res.json();
                                  alertSuccess(data.message || "Протокол отмечен как подписанный");
                                  loadMeeting();
                                } catch (e) {
                                  alertError(e instanceof Error ? e.message : "Не удалось отметить протокол как подписанный");
                                }
                              }}
                              className="inline-flex items-center justify-center gap-2 rounded-lg border border-red-300 bg-red-50 px-4 py-2 text-sm font-medium text-red-700 transition-colors hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-red-50 dark:border-red-700 dark:bg-red-900/30 dark:text-red-400 dark:hover:bg-red-900/50 dark:disabled:hover:bg-red-900/30"
                              title={meeting.protocolDocument.status === "SIGNED" ? "Протокол подписан" : "Открыть протокол и отметить как подписанный"}
                            >
                              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                              </svg>
                              {meeting.protocolDocument.status === "SIGNED" ? "Подписано" : "Подписать"}
                            </button>
                            )}
                          </>
                        )}
                      </>
                    )}
                {!readOnly && canDeleteMeeting && meeting.protocolDocument.status === "SIGNED" && (
                  <button
                    type="button"
                    disabled={sendingProtocolToInbox || protocolSentToInbox}
                    onClick={async () => {
                      setSendingProtocolToInbox(true);
                      try {
                        const res = await fetch(`/api/ppo-head/meetings/${resolvedParams.id}/notify-participants`, {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ type: "protocol_review" }),
                        });
                        const data = await res.json().catch(() => ({}));
                        if (!res.ok) throw new Error(data.error || "Ошибка рассылки");
                        alertSuccess(data.message || "Протокол разослан участникам во Входящие");
                        setProtocolSentToInbox(true);
                      } catch (e) {
                        alertError(e instanceof Error ? e.message : "Не удалось разослать протокол");
                      } finally {
                        setSendingProtocolToInbox(false);
                      }
                    }}
                    className="inline-flex items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover-surface disabled:opacity-50 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600"
                    title={protocolSentToInbox ? "Протокол уже разослан участникам" : "Создать копии протокола во Входящих у всех участников заседания и отправить уведомления"}
                  >
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                    {sendingProtocolToInbox ? "Отправка…" : protocolSentToInbox ? "Протокол разослан во Входящие" : "Разослать протокол во Входящие"}
                  </button>
                )}
                {!readOnly && meeting.protocolDocument.status === "PENDING_APPROVAL" && (
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <button
                        onClick={async () => {
                          try {
                            setIsApproving(true);
                            const response = await fetch(`/api/ppo-head/meetings/${resolvedParams.id}/documents/${meeting.protocolDocument!.id}/final-approve`, {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({}),
                            });
                            if (!response.ok) {
                              const error = await response.json();
                              throw new Error(error.error || "Ошибка утверждения");
                            }
                            const data = await response.json();
                            alertSuccess(data.message || "Протокол утверждён");
                            await loadMeeting(true);
                          } catch (error) {
                            alertError(error instanceof Error ? error.message : "Не удалось утвердить документ");
                          } finally {
                            setIsApproving(false);
                          }
                        }}
                        disabled={isApproving}
                        className="inline-flex items-center justify-center gap-2 rounded-lg border border-green-300 bg-green-50 px-4 py-2 text-sm font-medium text-green-700 transition-colors hover:bg-green-100 disabled:opacity-50 disabled:cursor-not-allowed dark:border-green-700 dark:bg-green-900/30 dark:text-green-300 dark:hover:bg-green-900/50"
                        title="Утвердить протокол после согласования участниками"
                      >
                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        {isApproving ? "Утверждение…" : "Утвердить протокол"}
                      </button>
                  </div>
                )}
              </div>
              <p className="mb-2 mt-2 text-xs text-gray-500 dark:text-gray-400" title="Согласование: участники подтверждают протокол в системе, затем вы утверждаете. После утверждения: распечатать, подписать у председательствующего и секретаря, загрузить скан. Рассылка — по кнопке ниже.">
                После утверждения: распечатать «Протокол PDF», подписать, загрузить скан, проверить «Подписанный протокол» и нажать кнопку «Подписать».
              </p>
              {protocolAttachmentsList.length > 0 && (
                <div className="mt-2 rounded-md border border-gray-200 bg-gray-50 p-3 dark:border-gray-600 dark:bg-gray-800/50">
                  <p className="mb-2 text-xs font-medium text-gray-700 dark:text-gray-300">Прикреплённые к протоколу документы:</p>
                  <ul className="space-y-1.5 text-xs min-w-0">
                    {protocolAttachmentsList.map((att, idx) => (
                      <li key={idx} className="min-w-0">
                        <button
                          type="button"
                          onClick={() => setPdfPreviewUrl(att.url)}
                          className="w-full text-left break-words text-blue-600 hover:underline dark:text-blue-400"
                        >
                          {att.name}
                        </button>
                        {(att.itemNum != null || att.itemTitle) && (
                          <span className="ml-1.5 text-gray-500 dark:text-gray-400">
                            {att.itemNum != null ? `(п. ${att.itemNum}` : "("}
                            {att.itemNum != null && att.itemTitle ? " " : ""}
                            {att.itemTitle ?? ""}
                            {att.itemNum != null || att.itemTitle ? ")" : ""}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* Форма заполнения протокола: только до утверждения; после утверждения блоки скрыты */}
          {meeting.agendaDocument && !readOnly && !protocolBlocksLocked && (
            <>
              <div className="rounded-lg bg-gray-50 p-4 dark:bg-gray-800">
                <h3 className="font-semibold text-gray-900 dark:text-white">Заполнение протокола</h3>
                {protocolBlocksLocked ? (
                  <p className="mt-1 text-sm text-amber-700 dark:text-amber-400 font-medium">
                    Протокол утверждён. Содержимое всех блоков отображается только для просмотра; редактирование отключено.
                  </p>
                ) : (
                  <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                    Заполните общие сведения и данные по каждому вопросу повестки дня. Внизу страницы — кнопки «Предпросмотр», «Сохранить в черновики» и «Утвердить».
                  </p>
                )}
              </div>

              {/* Общие сведения протокола (синхронизируются с повесткой) — сверху, по умолчанию свернут */}
              <div className="rounded-xl border-2 border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
                <button
                  type="button"
                  onClick={() => !protocolBlocksLocked && setProtocolGeneralCollapsed((c) => !c)}
                  disabled={protocolBlocksLocked}
                  className="flex w-full items-center justify-between p-4 text-left hover-surface rounded-t-xl disabled:opacity-90 disabled:cursor-default"
                  {...(protocolGeneralCollapsed && !protocolBlocksLocked ? { "aria-expanded": "false" } : { "aria-expanded": "true" })}
                >
                  <h4 className="text-base font-semibold text-gray-900 dark:text-white">Общие сведения протокола</h4>
                  <span className="text-sm text-gray-500 dark:text-gray-400 ml-2 shrink-0">
                    Повестка {meeting.agendaDocument.regNumber ?? "—"} от {new Date(meeting.scheduledDate).toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" })}
                  </span>
                  <svg
                    className={`h-5 w-5 shrink-0 text-gray-500 dark:text-gray-400 transition-transform ${protocolGeneralCollapsed ? "" : "rotate-180"}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    aria-hidden
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                {(!protocolGeneralCollapsed || protocolBlocksLocked) && (
                  <div className="border-t border-gray-200 dark:border-gray-700 p-6 pt-4">
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                      <div className="sm:col-span-2 lg:col-span-3">
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Повестка *</label>
                        <p className="mt-1 rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-300">
                          Повестка {meeting.agendaDocument.regNumber ?? "—"} от {new Date(meeting.scheduledDate).toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" })}
                        </p>
                      </div>
                      <div>
                        <label htmlFor="protocol-reg-number" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Номер документа</label>
                        <input id="protocol-reg-number" type="text" value={protocolRegNumberOverride} onChange={(e) => setProtocolRegNumberOverride(e.target.value)} placeholder="Автоматически (PR00001)" disabled={protocolBlocksLocked} className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white disabled:opacity-70 disabled:cursor-not-allowed" onFocus={(e) => e.target.select()} />
                        <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">Оставьте пустым — номер сгенерируется автоматически. Или введите свой.</p>
                      </div>
                      <div>
                        <label htmlFor="protocol-doc-date" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Дата документа</label>
                        <input id="protocol-doc-date" type="date" min={DATE_INPUT_MIN} max={DATE_INPUT_MAX} value={protocolDocDate} onChange={(e) => setProtocolDocDate(normalizeDateInputValue(e.target.value))} disabled={protocolBlocksLocked} className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white disabled:opacity-70 disabled:cursor-not-allowed" onFocus={(e) => e.target.select()} />
                      </div>
                      <div>
                        <label htmlFor="protocol-meeting-time" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Начало заседания</label>
                        <input id="protocol-meeting-time" type="time" value={protocolMeetingTime} onChange={(e) => setProtocolMeetingTime(e.target.value)} disabled={protocolBlocksLocked} className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white disabled:opacity-70 disabled:cursor-not-allowed" onFocus={(e) => e.target.select()} />
                      </div>
                      <div className="sm:col-span-2">
                        <label htmlFor="protocol-place" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Место проведения</label>
                        <input id="protocol-place" type="text" value={protocolPlace} onChange={(e) => setProtocolPlace(e.target.value)} placeholder="Например: Москва" disabled={protocolBlocksLocked} className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white disabled:opacity-70 disabled:cursor-not-allowed" onFocus={(e) => e.target.select()} />
                      </div>
                      <div className="sm:col-span-2">
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Приглашённые гости (необязательно)</label>
                        {guestsList.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-2">
                            {guestsList.map((guest, idx) => (
                              <span key={idx} className="inline-flex items-center gap-1 rounded-full border border-gray-300 bg-white px-3 py-1 text-sm text-gray-800 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200">
                                {guest}
                                <button type="button" onClick={() => removeGuest(idx)} disabled={protocolBlocksLocked} className="ml-0.5 rounded-full p-0.5 text-gray-400 hover:bg-gray-200 hover:text-gray-600 dark:hover:bg-gray-600 dark:hover:text-gray-300 disabled:opacity-50 disabled:cursor-not-allowed" aria-label={`Удалить ${guest}`}>
                                  <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                                </button>
                              </span>
                            ))}
                          </div>
                        )}
                        <div className="mt-2 flex gap-2">
                          <input
                            id="protocol-invited-guests"
                            type="text"
                            value={newGuestInput}
                            onChange={(e) => setNewGuestInput(e.target.value)}
                            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addGuest(); } }}
                            placeholder="ФИО гостя"
                            disabled={protocolBlocksLocked}
                            className="block flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white disabled:opacity-70 disabled:cursor-not-allowed"
                          />
                          <button type="button" onClick={addGuest} disabled={!newGuestInput.trim() || protocolBlocksLocked} className="inline-flex items-center gap-1 rounded-md bg-gray-100 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200 disabled:opacity-40 dark:bg-gray-600 dark:text-gray-200 dark:hover:bg-gray-500">
                            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                            Добавить
                          </button>
                        </div>
                      </div>
                    </div>
                    {!protocolBlocksLocked && (
                    <div className="mt-4">
                      <button type="button" onClick={saveProtocolProceduralAndElected} disabled={isSavingMeetingGeneral} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 dark:bg-blue-500 dark:hover:bg-blue-600">
                        {isSavingMeetingGeneral ? "Сохранение…" : "Сохранить общие сведения"}
                      </button>
                    </div>
                    )}
                  </div>
                )}
              </div>

              {/* Блок 1: Участники заседания (присутствие) — список из сотрудников (выборный орган) */}
              <div className="rounded-xl border-2 border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
                <h4 className="mb-2 text-base font-semibold text-gray-900 dark:text-white">
                  1. Участники заседания (присутствие)
                </h4>
                <p className="mb-2 text-sm text-gray-500 dark:text-gray-400">
                  Сотрудники (выборный орган) и приглашённые участники. Укажите для каждого: Присутствовал очно, Присутствовал онлайн или Отсутствовал.
                </p>
                <div className="mb-4 flex flex-wrap items-center gap-3 text-sm">
                  <span className="font-medium text-gray-700 dark:text-gray-300">Присутствуют: {maxVotes} из {totalEligible}</span>
                  <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${hasQuorum ? "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400" : "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400"}`}>
                    {hasQuorum ? "Кворум имеется" : "Кворум отсутствует"}
                  </span>
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    (необходимо не менее {Math.floor(totalEligible / 2) + 1} — 50% + 1)
                  </span>
                </div>
                {!protocolBlocksLocked && (
                <button
                  type="button"
                  onClick={syncParticipantsWithElectedBody}
                  disabled={isSyncingParticipants || electedBody.length === 0}
                  className="mb-4 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
                >
                  {isSyncingParticipants ? "Синхронизация…" : "Синхронизировать с выборным органом"}
                </button>
                )}
                <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-600">
                  <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-600">
                    <thead className="bg-gray-50 dark:bg-gray-700">
                      <tr>
                        <th className="px-4 py-2 text-left text-sm font-medium text-gray-700 dark:text-gray-300">ФИО (сотрудник / приглашённый)</th>
                        <th className="px-4 py-2 text-left text-sm font-medium text-gray-700 dark:text-gray-300">Присутствие</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 bg-white dark:divide-gray-600 dark:bg-gray-800">
                      {(() => {
                        const electedRows = electedBody.map((m) => {
                          const participant = meeting.participants.find(p => p.user?.id === m.id);
                          return { key: `elected-${m.id}`, label: getElectedMemberName(m), participant };
                        });
                        const externalRows = meeting.participants
                          .filter(p => p.externalName)
                          .map(p => ({ key: `ext-${p.id}`, label: getParticipantName(p) + (p.externalPosition ? ` (${p.externalPosition})` : ""), participant: p }));
                        const allRows = [...electedRows, ...externalRows];
                        if (allRows.length === 0) {
                          return (
                            <tr><td colSpan={2} className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">Загрузите выборный орган и нажмите «Синхронизировать» или добавьте приглашённых при создании заседания.</td></tr>
                          );
                        }
                        return allRows.map(({ key, label, participant }) => (
                          <tr key={key} className="dark:bg-gray-800">
                            <td className="px-4 py-2 text-sm text-gray-900 dark:text-white">{label}</td>
                            <td className="px-4 py-2">
                              {participant ? (
                                <select
                                  aria-label={`Присутствие: ${label}`}
                                  value={participant.attendance}
                                  disabled={protocolBlocksLocked}
                                  className={`rounded-md border px-2 py-1 text-sm dark:bg-gray-700 disabled:opacity-70 disabled:cursor-not-allowed ${!["PRESENT_OFFLINE", "PRESENT_ONLINE", "ABSENT"].includes(participant.attendance) ? "border-amber-400 bg-amber-50 dark:border-amber-600 dark:bg-amber-900/30 dark:text-gray-400" : "border-gray-300 dark:border-gray-600 dark:text-white"}`}
                                  onChange={async (e) => {
                                    const v = e.target.value as "PRESENT_OFFLINE" | "PRESENT_ONLINE" | "ABSENT";
                                    setMeeting(prev => {
                                      if (!prev) return prev;
                                      return {
                                        ...prev,
                                        participants: prev.participants.map(p =>
                                          p.id === participant.id ? { ...p, attendance: v } : p
                                        ),
                                      };
                                    });
                                    try {
                                      const res = await fetch(`/api/ppo-head/meetings/${resolvedParams.id}/participants/${participant.id}`, {
                                        method: "PATCH",
                                        headers: { "Content-Type": "application/json" },
                                        body: JSON.stringify({ attendance: v }),
                                      });
                                      if (!res.ok) {
                                        const data = await res.json().catch(() => ({}));
                                        alertError(data?.error ?? "Не удалось обновить присутствие");
                                        loadMeeting();
                                      }
                                    } catch (err) {
                                      alertError("Не удалось обновить присутствие");
                                      loadMeeting();
                                    }
                                  }}
                                >
                                  {!["PRESENT_OFFLINE", "PRESENT_ONLINE", "ABSENT"].includes(participant.attendance) && (
                                    <option value={participant.attendance}>— Укажите присутствие —</option>
                                  )}
                                  <option value="PRESENT_OFFLINE">Присутствовал очно</option>
                                  <option value="PRESENT_ONLINE">Присутствовал онлайн</option>
                                  <option value="ABSENT">Отсутствовал</option>
                                </select>
                              ) : (
                                <span className="text-sm text-gray-400">— добавьте через кнопку выше</span>
                              )}
                            </td>
                          </tr>
                        ));
                      })()}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Кворум */}
              <div className={`rounded-xl border-2 p-6 ${hasQuorum ? "border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-900/20" : "border-red-300 bg-red-50 dark:border-red-800 dark:bg-red-900/20"}`}>
                <div className="flex items-start gap-3">
                  <div className={`mt-0.5 flex-shrink-0 rounded-full p-1 ${hasQuorum ? "bg-green-200 text-green-700 dark:bg-green-800 dark:text-green-300" : "bg-red-200 text-red-700 dark:bg-red-800 dark:text-red-300"}`}>
                    {hasQuorum ? (
                      <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                    ) : (
                      <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                    )}
                  </div>
                  <div>
                    {hasQuorum ? (
                      <>
                        <p className="text-sm font-semibold text-green-800 dark:text-green-300">Кворум имеется. Заседание правомочно.</p>
                        <p className="mt-1 text-xs text-green-700 dark:text-green-400">
                          Согласно п. 5 ст. 14 Устава Профсоюза, заседание Профкома правомочно при присутствии не менее половины его членов. Присутствуют {maxVotes} из {totalEligible} членов ({Math.round(maxVotes / totalEligible * 100)}%). Для принятия решения необходимо {Math.floor(totalEligible / 2) + 1} голосов (50% + 1).
                        </p>
                      </>
                    ) : (
                      <>
                        <p className="text-sm font-semibold text-red-800 dark:text-red-300">Кворум отсутствует. Заседание неправомочно.</p>
                        <p className="mt-1 text-xs text-red-700 dark:text-red-400">
                          Согласно п. 5 ст. 14 Устава Профсоюза, для правомочности заседания необходимо присутствие не менее половины членов Профкома. Присутствуют {maxVotes} из {totalEligible} ({totalEligible > 0 ? Math.round(maxVotes / totalEligible * 100) : 0}%), требуется минимум {Math.floor(totalEligible / 2) + 1}. Протокол не может быть сформирован без кворума. Отметьте присутствие участников в таблице выше.
                        </p>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* Блок 2: Об избрании председательствующего */}
              <div className={`rounded-xl border-2 border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800 ${!hasQuorum ? "opacity-50 pointer-events-none" : ""}`}>
                <h4 className="mb-4 text-base font-semibold text-gray-900 dark:text-white">2. Об избрании председательствующего на заседании Профкома</h4>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">СЛУШАЛИ:</label>
                    <p className="mt-1 rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm italic text-gray-700 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-300">Об избрании председательствующего на заседании Профкома.</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Докладывал (ФИО)</label>
                    <select aria-label="Докладывал (об избрании председательствующего)" value={protocolProcedural.chairmanReportUserId} onChange={(e) => setProtocolProcedural(p => ({ ...p, chairmanReportUserId: e.target.value }))} disabled={protocolBlocksLocked} className={`mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 disabled:opacity-70 disabled:cursor-not-allowed ${protocolProcedural.chairmanReportUserId ? "dark:text-white" : "dark:text-gray-400"}`}>
                      <option value="">— Выбрать —</option>
                      {presentElectedBody.map(m => (<option key={m.id} value={m.id}>{getElectedMemberName(m)}</option>))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">ПОСТАНОВИЛИ: Избрать председательствующим на собрании</label>
                    <select aria-label="Председательствующий на собрании" value={presidingOfficerUserId} onChange={(e) => setPresidingOfficerUserId(e.target.value)} disabled={protocolBlocksLocked} className={`mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 disabled:opacity-70 disabled:cursor-not-allowed ${presidingOfficerUserId ? "dark:text-white" : "dark:text-gray-400"}`}>
                      <option value="">— Выбрать из присутствующих —</option>
                      {presentElectedBody.map(m => (<option key={m.id} value={m.id}>{getElectedMemberName(m)}</option>))}
                    </select>
                  </div>
                  <div className="rounded-lg bg-gray-50 p-4 dark:bg-gray-900">
                    <div className="flex items-center justify-between mb-3">
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Голосование:</label>
                      <span className="text-xs text-gray-500 dark:text-gray-400">Макс: {maxVotes} участников</span>
                    </div>
                    <div className="grid grid-cols-3 gap-4">
                      <div>
                        <label htmlFor="chairman-votes-for" className="block text-xs text-gray-500 mb-1">За:</label>
                        <input id="chairman-votes-for" type="number" min={0} max={maxVotes} aria-label="Голосов за (председательствующий)" value={protocolProcedural.chairmanVotesFor ?? ""} disabled={protocolBlocksLocked} onChange={(e) => { const v = e.target.value; if (v === "") { setProtocolProcedural(p => ({ ...p, chairmanVotesFor: 0 })); return; } const num = parseInt(v, 10) || 0; setProtocolProcedural(p => { const c = clampProceduralVotes(p.chairmanVotesFor, p.chairmanVotesAgainst, p.chairmanVotesAbstained, "for", num); return { ...p, chairmanVotesFor: c.for, chairmanVotesAgainst: c.against, chairmanVotesAbstained: c.abstained }; }); }} onBlur={(e) => { if (e.target.value === "") setProtocolProcedural(p => ({ ...p, chairmanVotesFor: 0 })); }} onFocus={(e) => e.target.select()} className="block w-full rounded-md border border-green-300 bg-green-50 px-3 py-2 text-center font-medium text-green-700 dark:border-green-700 dark:bg-green-900/30 dark:text-green-400 disabled:opacity-70 disabled:cursor-not-allowed" />
                      </div>
                      <div>
                        <label htmlFor="chairman-votes-against" className="block text-xs text-gray-500 mb-1">Против:</label>
                        <input id="chairman-votes-against" type="number" min={0} max={maxVotes} aria-label="Голосов против (председательствующий)" value={protocolProcedural.chairmanVotesAgainst ?? ""} disabled={protocolBlocksLocked} onChange={(e) => { const v = e.target.value; if (v === "") { setProtocolProcedural(p => ({ ...p, chairmanVotesAgainst: 0 })); return; } const num = parseInt(v, 10) || 0; setProtocolProcedural(p => { const c = clampProceduralVotes(p.chairmanVotesFor, p.chairmanVotesAgainst, p.chairmanVotesAbstained, "against", num); return { ...p, chairmanVotesFor: c.for, chairmanVotesAgainst: c.against, chairmanVotesAbstained: c.abstained }; }); }} onBlur={(e) => { if (e.target.value === "") setProtocolProcedural(p => ({ ...p, chairmanVotesAgainst: 0 })); }} onFocus={(e) => e.target.select()} className="block w-full rounded-md border border-red-300 bg-red-50 px-3 py-2 text-center font-medium text-red-700 dark:border-red-700 dark:bg-red-900/30 dark:text-red-400 disabled:opacity-70 disabled:cursor-not-allowed" />
                      </div>
                      <div>
                        <label htmlFor="chairman-votes-abstained" className="block text-xs text-gray-500 mb-1">Воздержались:</label>
                        <input id="chairman-votes-abstained" type="number" min={0} max={maxVotes} aria-label="Воздержались (председательствующий)" value={protocolProcedural.chairmanVotesAbstained ?? ""} disabled={protocolBlocksLocked} onChange={(e) => { const v = e.target.value; if (v === "") { setProtocolProcedural(p => ({ ...p, chairmanVotesAbstained: 0 })); return; } const num = parseInt(v, 10) || 0; setProtocolProcedural(p => { const c = clampProceduralVotes(p.chairmanVotesFor, p.chairmanVotesAgainst, p.chairmanVotesAbstained, "abstained", num); return { ...p, chairmanVotesFor: c.for, chairmanVotesAgainst: c.against, chairmanVotesAbstained: c.abstained }; }); }} onBlur={(e) => { if (e.target.value === "") setProtocolProcedural(p => ({ ...p, chairmanVotesAbstained: 0 })); }} onFocus={(e) => e.target.select()} className="block w-full rounded-md border border-gray-300 bg-gray-100 px-3 py-2 text-center font-medium dark:border-gray-600 dark:bg-gray-700 disabled:opacity-70 disabled:cursor-not-allowed" />
                      </div>
                    </div>
                    <div className="mt-3 flex items-center justify-between text-xs">
                      <span className="font-medium text-gray-600 dark:text-gray-400">
                        Всего: {protocolProcedural.chairmanVotesFor + protocolProcedural.chairmanVotesAgainst + protocolProcedural.chairmanVotesAbstained} / {maxVotes}
                      </span>
                    </div>
                    <div className="mt-3">
                      <span className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Решение по голосованию</span>
                      <span className={`block text-sm font-medium ${getVoteDecisionText(protocolProcedural.chairmanVotesFor, protocolProcedural.chairmanVotesAgainst, protocolProcedural.chairmanVotesAbstained).color}`}>{getVoteDecisionText(protocolProcedural.chairmanVotesFor, protocolProcedural.chairmanVotesAgainst, protocolProcedural.chairmanVotesAbstained).text}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Блок 3: Об избрании секретаря */}
              <div className={`rounded-xl border-2 border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800 ${!hasQuorum ? "opacity-50 pointer-events-none" : ""}`}>
                <h4 className="mb-4 text-base font-semibold text-gray-900 dark:text-white">3. Об избрании секретаря на заседании Профкома</h4>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">СЛУШАЛИ:</label>
                    <p className="mt-1 rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm italic text-gray-700 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-300">Об избрании секретаря на заседании Профкома.</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Докладывал (ФИО)</label>
                    <select aria-label="Докладывал (об избрании секретаря)" value={protocolProcedural.secretaryReportUserId} onChange={(e) => setProtocolProcedural(p => ({ ...p, secretaryReportUserId: e.target.value }))} disabled={protocolBlocksLocked} className={`mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 disabled:opacity-70 disabled:cursor-not-allowed ${protocolProcedural.secretaryReportUserId ? "dark:text-white" : "dark:text-gray-400"}`}>
                      <option value="">— Выбрать —</option>
                      {presentElectedBody.map(m => (<option key={m.id} value={m.id}>{getElectedMemberName(m)}</option>))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">ПОСТАНОВИЛИ: Избрать секретарем на собрании</label>
                    <select aria-label="Секретарь на собрании" value={secretaryUserId} onChange={(e) => setSecretaryUserId(e.target.value)} disabled={protocolBlocksLocked} className={`mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 disabled:opacity-70 disabled:cursor-not-allowed ${secretaryUserId ? "dark:text-white" : "dark:text-gray-400"}`}>
                      <option value="">— Выбрать из присутствующих —</option>
                      {presentElectedBody.map(m => (<option key={m.id} value={m.id}>{getElectedMemberName(m)}</option>))}
                    </select>
                  </div>
                  <div className="rounded-lg bg-gray-50 p-4 dark:bg-gray-900">
                    <div className="flex items-center justify-between mb-3">
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Голосование:</label>
                      <span className="text-xs text-gray-500 dark:text-gray-400">Макс: {maxVotes} участников</span>
                    </div>
                    <div className="grid grid-cols-3 gap-4">
                      <div>
                        <label htmlFor="secretary-votes-for" className="block text-xs text-gray-500 mb-1">За:</label>
                        <input id="secretary-votes-for" type="number" min={0} max={maxVotes} aria-label="Голосов за (секретарь)" value={protocolProcedural.secretaryVotesFor ?? ""} disabled={protocolBlocksLocked} onChange={(e) => { const v = e.target.value; if (v === "") { setProtocolProcedural(p => ({ ...p, secretaryVotesFor: 0 })); return; } const num = parseInt(v, 10) || 0; setProtocolProcedural(p => { const c = clampProceduralVotes(p.secretaryVotesFor, p.secretaryVotesAgainst, p.secretaryVotesAbstained, "for", num); return { ...p, secretaryVotesFor: c.for, secretaryVotesAgainst: c.against, secretaryVotesAbstained: c.abstained }; }); }} onBlur={(e) => { if (e.target.value === "") setProtocolProcedural(p => ({ ...p, secretaryVotesFor: 0 })); }} onFocus={(e) => e.target.select()} className="block w-full rounded-md border border-green-300 bg-green-50 px-3 py-2 text-center font-medium text-green-700 dark:border-green-700 dark:bg-green-900/30 dark:text-green-400 disabled:opacity-70 disabled:cursor-not-allowed" />
                      </div>
                      <div>
                        <label htmlFor="secretary-votes-against" className="block text-xs text-gray-500 mb-1">Против:</label>
                        <input id="secretary-votes-against" type="number" min={0} max={maxVotes} aria-label="Голосов против (секретарь)" value={protocolProcedural.secretaryVotesAgainst ?? ""} disabled={protocolBlocksLocked} onChange={(e) => { const v = e.target.value; if (v === "") { setProtocolProcedural(p => ({ ...p, secretaryVotesAgainst: 0 })); return; } const num = parseInt(v, 10) || 0; setProtocolProcedural(p => { const c = clampProceduralVotes(p.secretaryVotesFor, p.secretaryVotesAgainst, p.secretaryVotesAbstained, "against", num); return { ...p, secretaryVotesFor: c.for, secretaryVotesAgainst: c.against, secretaryVotesAbstained: c.abstained }; }); }} onBlur={(e) => { if (e.target.value === "") setProtocolProcedural(p => ({ ...p, secretaryVotesAgainst: 0 })); }} onFocus={(e) => e.target.select()} className="block w-full rounded-md border border-red-300 bg-red-50 px-3 py-2 text-center font-medium text-red-700 dark:border-red-700 dark:bg-red-900/30 dark:text-red-400 disabled:opacity-70 disabled:cursor-not-allowed" />
                      </div>
                      <div>
                        <label htmlFor="secretary-votes-abstained" className="block text-xs text-gray-500 mb-1">Воздержались:</label>
                        <input id="secretary-votes-abstained" type="number" min={0} max={maxVotes} aria-label="Воздержались (секретарь)" value={protocolProcedural.secretaryVotesAbstained ?? ""} disabled={protocolBlocksLocked} onChange={(e) => { const v = e.target.value; if (v === "") { setProtocolProcedural(p => ({ ...p, secretaryVotesAbstained: 0 })); return; } const num = parseInt(v, 10) || 0; setProtocolProcedural(p => { const c = clampProceduralVotes(p.secretaryVotesFor, p.secretaryVotesAgainst, p.secretaryVotesAbstained, "abstained", num); return { ...p, secretaryVotesFor: c.for, secretaryVotesAgainst: c.against, secretaryVotesAbstained: c.abstained }; }); }} onBlur={(e) => { if (e.target.value === "") setProtocolProcedural(p => ({ ...p, secretaryVotesAbstained: 0 })); }} onFocus={(e) => e.target.select()} className="block w-full rounded-md border border-gray-300 bg-gray-100 px-3 py-2 text-center font-medium dark:border-gray-600 dark:bg-gray-700 disabled:opacity-70 disabled:cursor-not-allowed" />
                      </div>
                    </div>
                    <div className="mt-3 flex items-center justify-between text-xs">
                      <span className="font-medium text-gray-600 dark:text-gray-400">
                        Всего: {protocolProcedural.secretaryVotesFor + protocolProcedural.secretaryVotesAgainst + protocolProcedural.secretaryVotesAbstained} / {maxVotes}
                      </span>
                    </div>
                    <div className="mt-3">
                      <span className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Решение по голосованию</span>
                      <span className={`block text-sm font-medium ${getVoteDecisionText(protocolProcedural.secretaryVotesFor, protocolProcedural.secretaryVotesAgainst, protocolProcedural.secretaryVotesAbstained).color}`}>{getVoteDecisionText(protocolProcedural.secretaryVotesFor, protocolProcedural.secretaryVotesAgainst, protocolProcedural.secretaryVotesAbstained).text}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Блок 4: О подсчете голосов */}
              <div className={`rounded-xl border-2 border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800 ${!hasQuorum ? "opacity-50 pointer-events-none" : ""}`}>
                <h4 className="mb-4 text-base font-semibold text-gray-900 dark:text-white">4. О подсчете голосов на заседании Профкома</h4>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">СЛУШАЛИ:</label>
                    <p className="mt-1 rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm italic text-gray-700 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-300">О подсчете голосов на заседании Профкома.</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Докладывал (ФИО)</label>
                    <select aria-label="Докладывал (о подсчёте голосов)" value={protocolProcedural.voteCounterReportUserId} onChange={(e) => setProtocolProcedural(p => ({ ...p, voteCounterReportUserId: e.target.value }))} disabled={protocolBlocksLocked} className={`mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 disabled:opacity-70 disabled:cursor-not-allowed ${protocolProcedural.voteCounterReportUserId ? "dark:text-white" : "dark:text-gray-400"}`}>
                      <option value="">— Выбрать —</option>
                      {presentElectedBody.map(m => (<option key={m.id} value={m.id}>{getElectedMemberName(m)}</option>))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">ПОСТАНОВИЛИ: Назначить ответственного за подсчет голосов (можно несколько)</label>
                    <div className="mt-2 space-y-1">
                      {presentElectedBody.map(m => {
                        const checked = voteCounterUserIds.includes(m.id);
                        return (
                          <label key={m.id} className={`flex items-center gap-2.5 rounded-lg border px-3 py-2 text-sm transition-colors ${protocolBlocksLocked ? "cursor-default" : "cursor-pointer"} ${checked ? "border-blue-300 bg-blue-50 dark:border-blue-700 dark:bg-blue-900/30" : "border-gray-200 hover-surface dark:border-gray-600"}`}>
                            <input type="checkbox" checked={checked} onChange={(e) => setVoteCounterUserIds(prev => e.target.checked ? [...prev, m.id] : prev.filter(id => id !== m.id))} disabled={protocolBlocksLocked} className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 dark:border-gray-600 disabled:opacity-70 disabled:cursor-not-allowed" />
                            <span className="text-gray-900 dark:text-white">{getElectedMemberName(m)}</span>
                            {(m.jobTitle || m.roleName) && <span className="text-xs text-gray-500 dark:text-gray-400">({m.jobTitle || m.roleName})</span>}
                          </label>
                        );
                      })}
                      {presentElectedBody.length === 0 && (
                        <p className="text-sm text-amber-600 dark:text-amber-400">Сначала отметьте присутствие участников в таблице выше</p>
                      )}
                    </div>
                  </div>
                  <div className="rounded-lg bg-gray-50 p-4 dark:bg-gray-900">
                    <div className="flex items-center justify-between mb-3">
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Голосование:</label>
                      <span className="text-xs text-gray-500 dark:text-gray-400">Макс: {maxVotes} участников</span>
                    </div>
                    <div className="grid grid-cols-3 gap-4">
                      <div>
                        <label htmlFor="vote-counter-votes-for" className="block text-xs text-gray-500 mb-1">За:</label>
                        <input id="vote-counter-votes-for" type="number" min={0} max={maxVotes} aria-label="Голосов за (подсчёт голосов)" value={protocolProcedural.voteCounterVotesFor ?? ""} disabled={protocolBlocksLocked} onChange={(e) => { const v = e.target.value; if (v === "") { setProtocolProcedural(p => ({ ...p, voteCounterVotesFor: 0 })); return; } const num = parseInt(v, 10) || 0; setProtocolProcedural(p => { const c = clampProceduralVotes(p.voteCounterVotesFor, p.voteCounterVotesAgainst, p.voteCounterVotesAbstained, "for", num); return { ...p, voteCounterVotesFor: c.for, voteCounterVotesAgainst: c.against, voteCounterVotesAbstained: c.abstained }; }); }} onBlur={(e) => { if (e.target.value === "") setProtocolProcedural(p => ({ ...p, voteCounterVotesFor: 0 })); }} onFocus={(e) => e.target.select()} className="block w-full rounded-md border border-green-300 bg-green-50 px-3 py-2 text-center font-medium text-green-700 dark:border-green-700 dark:bg-green-900/30 dark:text-green-400 disabled:opacity-70 disabled:cursor-not-allowed" />
                      </div>
                      <div>
                        <label htmlFor="vote-counter-votes-against" className="block text-xs text-gray-500 mb-1">Против:</label>
                        <input id="vote-counter-votes-against" type="number" min={0} max={maxVotes} aria-label="Голосов против (подсчёт голосов)" value={protocolProcedural.voteCounterVotesAgainst ?? ""} disabled={protocolBlocksLocked} onChange={(e) => { const v = e.target.value; if (v === "") { setProtocolProcedural(p => ({ ...p, voteCounterVotesAgainst: 0 })); return; } const num = parseInt(v, 10) || 0; setProtocolProcedural(p => { const c = clampProceduralVotes(p.voteCounterVotesFor, p.voteCounterVotesAgainst, p.voteCounterVotesAbstained, "against", num); return { ...p, voteCounterVotesFor: c.for, voteCounterVotesAgainst: c.against, voteCounterVotesAbstained: c.abstained }; }); }} onBlur={(e) => { if (e.target.value === "") setProtocolProcedural(p => ({ ...p, voteCounterVotesAgainst: 0 })); }} onFocus={(e) => e.target.select()} className="block w-full rounded-md border border-red-300 bg-red-50 px-3 py-2 text-center font-medium text-red-700 dark:border-red-700 dark:bg-red-900/30 dark:text-red-400 disabled:opacity-70 disabled:cursor-not-allowed" />
                      </div>
                      <div>
                        <label htmlFor="vote-counter-votes-abstained" className="block text-xs text-gray-500 mb-1">Воздержались:</label>
                        <input id="vote-counter-votes-abstained" type="number" min={0} max={maxVotes} aria-label="Воздержались (подсчёт голосов)" value={protocolProcedural.voteCounterVotesAbstained ?? ""} disabled={protocolBlocksLocked} onChange={(e) => { const v = e.target.value; if (v === "") { setProtocolProcedural(p => ({ ...p, voteCounterVotesAbstained: 0 })); return; } const num = parseInt(v, 10) || 0; setProtocolProcedural(p => { const c = clampProceduralVotes(p.voteCounterVotesFor, p.voteCounterVotesAgainst, p.voteCounterVotesAbstained, "abstained", num); return { ...p, voteCounterVotesFor: c.for, voteCounterVotesAgainst: c.against, voteCounterVotesAbstained: c.abstained }; }); }} onBlur={(e) => { if (e.target.value === "") setProtocolProcedural(p => ({ ...p, voteCounterVotesAbstained: 0 })); }} onFocus={(e) => e.target.select()} className="block w-full rounded-md border border-gray-300 bg-gray-100 px-3 py-2 text-center font-medium dark:border-gray-600 dark:bg-gray-700 disabled:opacity-70 disabled:cursor-not-allowed" />
                      </div>
                    </div>
                    <div className="mt-3 flex items-center justify-between text-xs">
                      <span className="font-medium text-gray-600 dark:text-gray-400">
                        Всего: {protocolProcedural.voteCounterVotesFor + protocolProcedural.voteCounterVotesAgainst + protocolProcedural.voteCounterVotesAbstained} / {maxVotes}
                      </span>
                    </div>
                    <div className="mt-3">
                      <span className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Решение по голосованию</span>
                      <span className={`block text-sm font-medium ${getVoteDecisionText(protocolProcedural.voteCounterVotesFor, protocolProcedural.voteCounterVotesAgainst, protocolProcedural.voteCounterVotesAbstained).color}`}>{getVoteDecisionText(protocolProcedural.voteCounterVotesFor, protocolProcedural.voteCounterVotesAgainst, protocolProcedural.voteCounterVotesAbstained).text}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Блок 5: Утверждение повестки дня */}
              <div className={`rounded-xl border-2 border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800 ${!hasQuorum ? "opacity-50 pointer-events-none" : ""}`}>
                <h4 className="mb-4 text-base font-semibold text-gray-900 dark:text-white">5. Утверждение повестки дня заседания профсоюзного комитета</h4>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">СЛУШАЛИ:</label>
                    <p className="mt-1 rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm italic text-gray-700 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-300">О повестке дня заседания профсоюзного комитета.</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Докладывал (председательствующий)</label>
                    <p className="mt-1 rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-300">
                      {presidingOfficerUserId ? getElectedMemberName(presentElectedBody.find(m => m.id === presidingOfficerUserId) || electedBody.find(m => m.id === presidingOfficerUserId) || {}) : "— Выберите председательствующего выше —"}
                    </p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">ПОСТАНОВИЛИ: Утвердить повестку дня заседания Профкома</label>
                    <p className="mt-1 mb-2 text-xs text-gray-500 dark:text-gray-400">Отметьте пункты, включаемые в утверждаемую повестку. Неотмеченные пункты в протоколе отображаются с припиской «(не актуально)».</p>
                    {meeting.agendaItems.length > 0 ? (
                      <div className="mt-2 space-y-1">
                        {meeting.agendaItems.map((item) => {
                          const approvedIds = protocolProcedural.agendaApprovedItemIds ?? meeting.agendaItems.map(i => i.id);
                          const checked = approvedIds.includes(item.id);
                          return (
                            <label
                              key={item.id}
                              className={`flex items-center gap-2.5 rounded-lg border px-3 py-2 text-sm transition-colors ${protocolBlocksLocked ? "cursor-default" : "cursor-pointer"} ${checked ? "border-blue-300 bg-blue-50 dark:border-blue-700 dark:bg-blue-900/30" : "border-gray-200 hover-surface dark:border-gray-600"}`}
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                disabled={protocolBlocksLocked}
                                onChange={() => {
                                  const current = protocolProcedural.agendaApprovedItemIds ?? meeting.agendaItems.map(i => i.id);
                                  if (checked) {
                                    setProtocolProcedural(p => ({ ...p, agendaApprovedItemIds: current.filter(id => id !== item.id) }));
                                  } else {
                                    setProtocolProcedural(p => ({ ...p, agendaApprovedItemIds: [...new Set([...(p.agendaApprovedItemIds ?? meeting.agendaItems.map(i => i.id)), item.id])] }));
                                  }
                                }}
                                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 dark:border-gray-600 disabled:opacity-70 disabled:cursor-not-allowed"
                              />
                              <span className="text-gray-900 dark:text-white font-medium">Вопрос {item.orderNumber}. {item.title}</span>
                            </label>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="mt-1 text-sm text-amber-600 dark:text-amber-400">Нет пунктов. Добавьте на вкладке «Повестка».</p>
                    )}
                  </div>
                  <div className="rounded-lg bg-gray-50 p-4 dark:bg-gray-900">
                    <div className="flex items-center justify-between mb-3">
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Голосование:</label>
                      <span className="text-xs text-gray-500 dark:text-gray-400">Макс: {maxVotes} участников</span>
                    </div>
                    <div className="grid grid-cols-3 gap-4">
                      <div>
                        <label htmlFor="agenda-approval-votes-for" className="block text-xs text-gray-500 mb-1">За:</label>
                        <input id="agenda-approval-votes-for" type="number" min={0} max={maxVotes} aria-label="Голосов за (утверждение повестки)" value={protocolProcedural.agendaApprovalVotesFor ?? ""} disabled={protocolBlocksLocked} onChange={(e) => { const v = e.target.value; if (v === "") { setProtocolProcedural(p => ({ ...p, agendaApprovalVotesFor: 0 })); return; } const num = parseInt(v, 10) || 0; setProtocolProcedural(p => { const c = clampProceduralVotes(p.agendaApprovalVotesFor, p.agendaApprovalVotesAgainst, p.agendaApprovalVotesAbstained, "for", num); return { ...p, agendaApprovalVotesFor: c.for, agendaApprovalVotesAgainst: c.against, agendaApprovalVotesAbstained: c.abstained }; }); }} onBlur={(e) => { if (e.target.value === "") setProtocolProcedural(p => ({ ...p, agendaApprovalVotesFor: 0 })); }} onFocus={(e) => e.target.select()} className="block w-full rounded-md border border-green-300 bg-green-50 px-3 py-2 text-center font-medium text-green-700 dark:border-green-700 dark:bg-green-900/30 dark:text-green-400 disabled:opacity-70 disabled:cursor-not-allowed" />
                      </div>
                      <div>
                        <label htmlFor="agenda-approval-votes-against" className="block text-xs text-gray-500 mb-1">Против:</label>
                        <input id="agenda-approval-votes-against" type="number" min={0} max={maxVotes} aria-label="Голосов против (утверждение повестки)" value={protocolProcedural.agendaApprovalVotesAgainst ?? ""} disabled={protocolBlocksLocked} onChange={(e) => { const v = e.target.value; if (v === "") { setProtocolProcedural(p => ({ ...p, agendaApprovalVotesAgainst: 0 })); return; } const num = parseInt(v, 10) || 0; setProtocolProcedural(p => { const c = clampProceduralVotes(p.agendaApprovalVotesFor, p.agendaApprovalVotesAgainst, p.agendaApprovalVotesAbstained, "against", num); return { ...p, agendaApprovalVotesFor: c.for, agendaApprovalVotesAgainst: c.against, agendaApprovalVotesAbstained: c.abstained }; }); }} onBlur={(e) => { if (e.target.value === "") setProtocolProcedural(p => ({ ...p, agendaApprovalVotesAgainst: 0 })); }} onFocus={(e) => e.target.select()} className="block w-full rounded-md border border-red-300 bg-red-50 px-3 py-2 text-center font-medium text-red-700 dark:border-red-700 dark:bg-red-900/30 dark:text-red-400 disabled:opacity-70 disabled:cursor-not-allowed" />
                      </div>
                      <div>
                        <label htmlFor="agenda-approval-votes-abstained" className="block text-xs text-gray-500 mb-1">Воздержались:</label>
                        <input id="agenda-approval-votes-abstained" type="number" min={0} max={maxVotes} aria-label="Воздержались (утверждение повестки)" value={protocolProcedural.agendaApprovalVotesAbstained ?? ""} disabled={protocolBlocksLocked} onChange={(e) => { const v = e.target.value; if (v === "") { setProtocolProcedural(p => ({ ...p, agendaApprovalVotesAbstained: 0 })); return; } const num = parseInt(v, 10) || 0; setProtocolProcedural(p => { const c = clampProceduralVotes(p.agendaApprovalVotesFor, p.agendaApprovalVotesAgainst, p.agendaApprovalVotesAbstained, "abstained", num); return { ...p, agendaApprovalVotesFor: c.for, agendaApprovalVotesAgainst: c.against, agendaApprovalVotesAbstained: c.abstained }; }); }} onBlur={(e) => { if (e.target.value === "") setProtocolProcedural(p => ({ ...p, agendaApprovalVotesAbstained: 0 })); }} onFocus={(e) => e.target.select()} className="block w-full rounded-md border border-gray-300 bg-gray-100 px-3 py-2 text-center font-medium dark:border-gray-600 dark:bg-gray-700 disabled:opacity-70 disabled:cursor-not-allowed" />
                      </div>
                    </div>
                    <div className="mt-3 flex items-center justify-between text-xs">
                      <span className="font-medium text-gray-600 dark:text-gray-400">
                        Всего: {protocolProcedural.agendaApprovalVotesFor + protocolProcedural.agendaApprovalVotesAgainst + protocolProcedural.agendaApprovalVotesAbstained} / {maxVotes}
                      </span>
                    </div>
                    <div className="mt-3">
                      <span className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Решение по голосованию</span>
                      <span className={`block text-sm font-medium ${getVoteDecisionText(protocolProcedural.agendaApprovalVotesFor, protocolProcedural.agendaApprovalVotesAgainst, protocolProcedural.agendaApprovalVotesAbstained).color}`}>{getVoteDecisionText(protocolProcedural.agendaApprovalVotesFor, protocolProcedural.agendaApprovalVotesAgainst, protocolProcedural.agendaApprovalVotesAbstained).text}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Блок 6: Вопросы повестки дня */}
              <div className={`rounded-xl border-2 border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800 ${!hasQuorum ? "opacity-50 pointer-events-none" : ""}`}>
                <h4 className="mb-2 text-base font-semibold text-gray-900 dark:text-white">
                  6. Рассмотрение вопросов повестки дня
                </h4>
                <p className="mb-4 text-sm text-gray-500 dark:text-gray-400">
                  Заполните протокольные данные по каждому вопросу: Слушали, Докладывал, Постановили и результаты голосования.
                </p>
                {meeting.agendaItems.length === 0 ? (
                  <p className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
                    Нет пунктов в повестке. Добавьте пункты на вкладке «Повестка».
                  </p>
                ) : (
                  <div className="space-y-4">
          {meeting.agendaItems.map((item) => {
            const approvedIds = protocolProcedural.agendaApprovedItemIds ?? meeting.agendaItems.map((i) => i.id);
            const isApproved = approvedIds.includes(item.id);
            return (
            <div
              key={item.id}
              className={`rounded-lg border p-5 transition-colors ${
                isApproved
                  ? "border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-800/50"
                  : "border-gray-200 bg-gray-100 opacity-60 pointer-events-none dark:border-gray-600 dark:bg-gray-800/30"
              }`}
            >
              <h5 className={`mb-3 text-sm font-semibold ${isApproved ? "text-blue-700 dark:text-blue-400" : "text-gray-500 dark:text-gray-400"}`}>
                Вопрос {item.orderNumber}. {item.title}
                {!isApproved && <span className="ml-2 text-xs font-normal text-gray-500 dark:text-gray-400">(не актуально)</span>}
              </h5>

              <div className="space-y-4">
                {/* СЛУШАЛИ */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Слушали:
                  </label>
                  <textarea
                    value={protocolData[item.id]?.heardText || ""}
                    onChange={(e) => updateProtocolItem(item.id, "heardText", e.target.value)}
                    disabled={protocolBlocksLocked}
                    rows={2}
                    className="block w-full rounded-md border border-gray-300 px-3 py-2 dark:border-gray-600 dark:bg-gray-700 disabled:opacity-70 disabled:cursor-not-allowed"
                    placeholder={item.title}
                  />
                </div>

                {/* ДОКЛАДЫВАЛ — только члены выборного органа (как при создании повестки) */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Докладывал: * (только присутствующие члены)
                  </label>
                  <select
                    aria-label={`Докладывал по вопросу ${item.orderNumber}`}
                    value={protocolData[item.id]?.speakerId || item.speakerId || ""}
                    disabled={protocolBlocksLocked}
                    onChange={(e) => {
                      const memberId = e.target.value;
                      const m = presentElectedBody.find((x) => x.id === memberId) || electedBody.find((x) => x.id === memberId);
                      updateProtocolItem(item.id, "speakerId", memberId);
                      if (m) {
                        updateProtocolItem(item.id, "speakerName", getElectedMemberName(m));
                        updateProtocolItem(item.id, "speakerPosition", m.jobTitle || m.roleName || "");
                      }
                    }}
                    className={`block w-full rounded-md border border-gray-300 px-3 py-2 dark:border-gray-600 dark:bg-gray-700 disabled:opacity-70 disabled:cursor-not-allowed ${(protocolData[item.id]?.speakerId || item.speakerId) ? "dark:text-white" : "dark:text-gray-400"}`}
                  >
                    <option value="">— Выберите докладчика —</option>
                    {presentElectedBody.map((m) => (
                      <option key={m.id} value={m.id}>
                        {getElectedMemberName(m)}
                        {m.jobTitle || m.roleName ? ` (${m.jobTitle || m.roleName})` : ""}
                      </option>
                    ))}
                  </select>
                  {(protocolData[item.id]?.speakerName || item.speakerName) && (
                    <p className="mt-1 text-xs text-green-600 dark:text-green-400">
                      Докладчик: {protocolData[item.id]?.speakerName || item.speakerName}
                      {(protocolData[item.id]?.speakerPosition ?? item.speakerPosition) && `, ${protocolData[item.id]?.speakerPosition ?? item.speakerPosition}`}
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
                    disabled={protocolBlocksLocked}
                    rows={3}
                    className="block w-full rounded-md border border-gray-300 px-3 py-2 dark:border-gray-600 dark:bg-gray-700 disabled:opacity-70 disabled:cursor-not-allowed"
                    placeholder="Текст постановления..."
                  />
                </div>

                {/* Прикрепить документ к постановлению */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Прикрепить документ
                  </label>
                  <input
                    id={`protocol-resolution-file-${item.id}`}
                    type="file"
                    className="hidden"
                    accept=".pdf,.doc,.docx,.xls,.xlsx,.txt,.md,.csv,.ppt,.pptx,.odt,.ods,.odp,.rtf,.jpg,.jpeg,.png,.zip"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      const input = e.target;
                      if (!file) return;
                      setUploadingResolutionAttachmentId(item.id);
                      try {
                        const fd = new FormData();
                        fd.append("file", file);
                        const res = await fetch("/api/ppo-head/meetings/agenda-attachment", { method: "POST", body: fd });
                        if (!res.ok) {
                          const err = await res.json().catch(() => ({}));
                          throw new Error(err.error || "Ошибка загрузки");
                        }
                        const data = await res.json();
                        const current = (protocolData[item.id]?.attachments || []) as AgendaAttachment[];
                        updateProtocolItem(item.id, "attachments", current.concat([{ name: data.name, url: data.url, size: data.size }]));
                      } catch (err) {
                        alertError(err instanceof Error ? err.message : "Не удалось загрузить файл");
                      } finally {
                        setUploadingResolutionAttachmentId(null);
                        if (input) input.value = "";
                      }
                    }}
                  />
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => document.getElementById(`protocol-resolution-file-${item.id}`)?.click()}
                      disabled={protocolBlocksLocked || uploadingResolutionAttachmentId === item.id}
                      className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-700 shadow-sm hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600 disabled:opacity-70 disabled:cursor-not-allowed"
                    >
                      {uploadingResolutionAttachmentId === item.id ? (
                        "Загрузка…"
                      ) : (
                        <>
                          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                          </svg>
                          Прикрепить файл
                        </>
                      )}
                    </button>
                    {((protocolData[item.id]?.attachments || []) as AgendaAttachment[]).length > 0 && (
                      <div className="mt-2 rounded-md border border-gray-200 bg-gray-50 p-3 dark:border-gray-600 dark:bg-gray-800/50">
                        <p className="text-xs font-medium text-gray-700 dark:text-gray-300">Прикреплённые к вопросу документы:</p>
                        <ul className="mt-1 flex flex-wrap gap-2 min-w-0">
                          {((protocolData[item.id]?.attachments || []) as AgendaAttachment[]).map((att, i) => (
                          <li key={i} className="flex items-center gap-1.5 min-w-0 flex-1 rounded border border-gray-200 bg-gray-50 px-2 py-1 text-sm dark:border-gray-600 dark:bg-gray-800">
                            <button
                              type="button"
                              onClick={() => setPdfPreviewUrl(att.url)}
                              className="min-w-0 flex-1 text-left break-words text-blue-600 hover:underline dark:text-blue-400"
                              title={att.name}
                            >
                              {att.name}
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                const list = ((protocolData[item.id]?.attachments || []) as AgendaAttachment[]).filter((_, j) => j !== i);
                                updateProtocolItem(item.id, "attachments", list);
                              }}
                              disabled={protocolBlocksLocked}
                              className="rounded p-0.5 text-red-500 hover:bg-red-50 hover:text-red-700 dark:hover:text-red-400 dark:hover:bg-red-900/30 disabled:opacity-50"
                              title="Удалить"
                            >
                              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            </button>
                          </li>
                        ))}
                        </ul>
                      </div>
                    )}
                  </div>
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
                      <label htmlFor={`agenda-item-${item.id}-votes-for`} className="block text-xs text-gray-500 mb-1">За:</label>
                      <input
                        id={`agenda-item-${item.id}-votes-for`}
                        type="number"
                        min="0"
                        max={maxVotes}
                        aria-label={`Голосов за, вопрос ${item.orderNumber}`}
                        value={protocolData[item.id]?.votesFor ?? ""}
                        disabled={protocolBlocksLocked}
                        onChange={(e) => {
                          const raw = e.target.value;
                          updateProtocolItem(item.id, "votesFor", raw === "" ? "" : parseInt(raw, 10) || 0);
                        }}
                        onBlur={(e) => { if (e.target.value === "") updateProtocolItem(item.id, "votesFor", 0); }}
                        onFocus={(e) => e.target.select()}
                        className="block w-full rounded-md border border-green-300 bg-green-50 px-3 py-2 text-center font-medium text-green-700 dark:border-green-700 dark:bg-green-900/30 dark:text-green-400 disabled:opacity-70 disabled:cursor-not-allowed"
                      />
                    </div>
                    <div>
                      <label htmlFor={`agenda-item-${item.id}-votes-against`} className="block text-xs text-gray-500 mb-1">Против:</label>
                      <input
                        id={`agenda-item-${item.id}-votes-against`}
                        type="number"
                        min="0"
                        max={maxVotes}
                        aria-label={`Голосов против, вопрос ${item.orderNumber}`}
                        value={protocolData[item.id]?.votesAgainst ?? ""}
                        disabled={protocolBlocksLocked}
                        onChange={(e) => {
                          const raw = e.target.value;
                          updateProtocolItem(item.id, "votesAgainst", raw === "" ? "" : parseInt(raw, 10) || 0);
                        }}
                        onBlur={(e) => { if (e.target.value === "") updateProtocolItem(item.id, "votesAgainst", 0); }}
                        onFocus={(e) => e.target.select()}
                        className="block w-full rounded-md border border-red-300 bg-red-50 px-3 py-2 text-center font-medium text-red-700 dark:border-red-700 dark:bg-red-900/30 dark:text-red-400 disabled:opacity-70 disabled:cursor-not-allowed"
                      />
                    </div>
                    <div>
                      <label htmlFor={`agenda-item-${item.id}-votes-abstained`} className="block text-xs text-gray-500 mb-1">Воздержались:</label>
                      <input
                        id={`agenda-item-${item.id}-votes-abstained`}
                        type="number"
                        min="0"
                        max={maxVotes}
                        aria-label={`Воздержались, вопрос ${item.orderNumber}`}
                        value={protocolData[item.id]?.votesAbstained ?? ""}
                        disabled={protocolBlocksLocked}
                        onChange={(e) => {
                          const raw = e.target.value;
                          updateProtocolItem(item.id, "votesAbstained", raw === "" ? "" : parseInt(raw, 10) || 0);
                        }}
                        onBlur={(e) => { if (e.target.value === "") updateProtocolItem(item.id, "votesAbstained", 0); }}
                        onFocus={(e) => e.target.select()}
                        className="block w-full rounded-md border border-gray-300 bg-gray-100 px-3 py-2 text-center font-medium dark:border-gray-600 dark:bg-gray-700 disabled:opacity-70 disabled:cursor-not-allowed"
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
                  {(() => {
                    const vf = protocolData[item.id]?.votesFor || 0;
                    const va = protocolData[item.id]?.votesAgainst || 0;
                    const vab = protocolData[item.id]?.votesAbstained || 0;
                    const decision = getVoteDecisionText(vf, va, vab);
                    return (
                      <div className="mt-3">
                        <span className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Решение по голосованию</span>
                        <span className={`block text-sm font-medium ${decision.color}`}>{decision.text}</span>
                      </div>
                    );
                  })()}
                </div>

              </div>
            </div>
          );
          })}
                  </div>
                )}
              </div>

              {/* Внизу: предпросмотр, сохранить в черновики, утвердить */}
              <div className="mt-8 rounded-xl border-2 border-gray-200 bg-gray-50 p-6 dark:border-gray-700 dark:bg-gray-800/50">
                <h4 className="mb-4 text-sm font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-400">
                  Действия с протоколом
                </h4>
                
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <button
                    onClick={() => {
                    setActiveTab("agenda");
                    router.replace(`${pathname}?tab=agenda`);
                  }}
                    className="rounded-lg border border-gray-300 px-4 py-2 text-sm hover:bg-gray-100 dark:border-gray-600 dark:hover:bg-gray-700"
                  >
                    ← Назад к повестке
                  </button>
                  {!readOnly && !protocolBlocksLocked && (
                  <div className="space-y-3">
                    {!hasQuorum && (
                      <div className="flex items-center gap-2 rounded-lg border border-red-300 bg-red-50 px-4 py-3 dark:border-red-700 dark:bg-red-900/20">
                        <svg className="h-5 w-5 flex-shrink-0 text-red-600 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                        </svg>
                        <p className="text-sm font-medium text-red-700 dark:text-red-300">
                          Формирование протокола невозможно — кворум отсутствует. Для принятия решений необходимо присутствие не менее {Math.floor(totalEligible / 2) + 1} из {totalEligible} членов Профкома.
                        </p>
                      </div>
                    )}
                    <div className="flex flex-wrap items-center gap-3">
                    <button
                      onClick={async () => {
                        await saveProtocolData();
                        try {
                          setIsGenerating(true);
                          const body: Record<string, unknown> = { documentType: "PROTOCOL", protocolProceduralData: protocolProcedural };
                          if (protocolRegNumberOverride.trim()) body.regNumber = protocolRegNumberOverride.trim();
                          if (protocolMeetingTime?.trim()) body.meetingTime = protocolMeetingTime.trim();
                          if (protocolDocDate) body.meetingDate = protocolDocDate;
                          if (protocolPlace != null) body.meetingPlace = protocolPlace;
                          if (invitedGuests != null) body.invitedGuests = invitedGuests;
                          if (voteCounterUserIds?.length) body.voteCounterUserIds = voteCounterUserIds;
                          if (presidingOfficerUserId) body.presidingOfficerUserId = presidingOfficerUserId;
                          if (secretaryUserId) body.secretaryUserId = secretaryUserId;
                          const res = await fetch(`/api/ppo-head/meetings/${resolvedParams.id}/generate-document`, {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify(body),
                          });
                          if (!res.ok) throw new Error((await res.json()).error);
                          const data = await res.json();
                          if (data.meeting) setMeeting(data.meeting);
                          if (data.document?.id) setPdfPreviewUrl(getDocumentViewUrl(data.document.id));
                        } catch (e) {
                          alertError(e instanceof Error ? e.message : "Ошибка предпросмотра");
                        } finally {
                          setIsGenerating(false);
                        }
                      }}
                      disabled={isSaving || isGenerating || !hasQuorum}
                      className="inline-flex items-center gap-2 rounded-lg border border-blue-300 bg-blue-50 px-4 py-2.5 text-sm font-medium text-blue-700 hover:bg-blue-100 disabled:opacity-50 dark:border-blue-700 dark:bg-blue-900/30 dark:text-blue-300 dark:hover:bg-blue-900/50"
                    >
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </svg>
                      {isGenerating ? "Формирование..." : "Предпросмотр"}
                    </button>
                    <button
                      onClick={async () => {
                        await saveProtocolData();
                        try {
                          setIsGenerating(true);
                          const body: Record<string, unknown> = { documentType: "PROTOCOL", protocolProceduralData: protocolProcedural };
                          if (protocolRegNumberOverride.trim()) body.regNumber = protocolRegNumberOverride.trim();
                          if (protocolMeetingTime?.trim()) body.meetingTime = protocolMeetingTime.trim();
                          if (protocolDocDate) body.meetingDate = protocolDocDate;
                          if (protocolPlace != null) body.meetingPlace = protocolPlace;
                          if (invitedGuests != null) body.invitedGuests = invitedGuests;
                          if (voteCounterUserIds?.length) body.voteCounterUserIds = voteCounterUserIds;
                          if (presidingOfficerUserId) body.presidingOfficerUserId = presidingOfficerUserId;
                          if (secretaryUserId) body.secretaryUserId = secretaryUserId;
                          const res = await fetch(`/api/ppo-head/meetings/${resolvedParams.id}/generate-document`, {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify(body),
                          });
                          if (!res.ok) throw new Error((await res.json()).error);
                          const data = await res.json();
                          if (data.meeting) setMeeting(data.meeting);
                          alertSuccess(data.message || "Протокол сохранён в черновики");
                        } catch (e) {
                          alertError(e instanceof Error ? e.message : "Не удалось сохранить");
                        } finally {
                          setIsGenerating(false);
                        }
                      }}
                      disabled={isSaving || isGenerating || !hasQuorum}
                      className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600"
                    >
                      {isSaving || isGenerating ? "Сохранение..." : "Сохранить в черновики"}
                    </button>
                    <button
                      onClick={async () => {
                        await saveProtocolData();
                        try {
                          setIsGenerating(true);
                          const body: Record<string, unknown> = { documentType: "PROTOCOL", approve: true, protocolProceduralData: protocolProcedural };
                          if (protocolRegNumberOverride.trim()) body.regNumber = protocolRegNumberOverride.trim();
                          if (protocolMeetingTime?.trim()) body.meetingTime = protocolMeetingTime.trim();
                          if (protocolDocDate) body.meetingDate = protocolDocDate;
                          if (protocolPlace != null) body.meetingPlace = protocolPlace;
                          if (invitedGuests != null) body.invitedGuests = invitedGuests;
                          if (voteCounterUserIds?.length) body.voteCounterUserIds = voteCounterUserIds;
                          if (presidingOfficerUserId) body.presidingOfficerUserId = presidingOfficerUserId;
                          if (secretaryUserId) body.secretaryUserId = secretaryUserId;
                          const res = await fetch(`/api/ppo-head/meetings/${resolvedParams.id}/generate-document`, {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify(body),
                          });
                          if (!res.ok) throw new Error((await res.json()).error);
                          const data = await res.json();
                          if (data.meeting) setMeeting(data.meeting);
                          alertSuccess(data.message || "Протокол утверждён. Можно отправлять в печать.");
                        } catch (e) {
                          alertError(e instanceof Error ? e.message : "Не удалось утвердить");
                        } finally {
                          setIsGenerating(false);
                        }
                      }}
                      disabled={isSaving || isGenerating || !canApproveProtocol}
                      className="inline-flex items-center gap-2 rounded-lg border border-green-600 bg-green-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
                    >
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      {isGenerating ? "Утверждение..." : "Утвердить"}
                    </button>
                    </div>
                  </div>
                  )}
                </div>
                {!readOnly && (
                <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
                  Предпросмотр — сформирует документ и откроет его в окне. Сохранить в черновики — создаёт/обновляет черновик. Утвердить — документ создаётся и утверждается, после этого можно отправлять в печать.
                </p>
                )}
              </div>
            </>
          )}
          </>
          )}
        </div>
      )}

      {effectiveTab === "resolutions" && (() => {
        const protocolSigned = meeting.protocolDocument?.status === "SIGNED";
        const resolutionApprovedIds = protocolProcedural.agendaApprovedItemIds ?? meeting.agendaItems.map((i: { id: string }) => i.id);
        const resolutionApprovedItems = protocolSigned
          ? meeting.agendaItems.filter((item: { id: string }) => resolutionApprovedIds.includes(item.id))
          : [];
        return (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                Постановления ({meeting.resolutions.length})
              </h3>
            </div>
            {protocolSigned && !readOnly && canDeleteMeeting && meeting.protocolDocument && resolutionApprovedItems.length > 0 && meeting.resolutions.length === 0 && (
              <div className="flex items-center gap-2">
                <button
                  onClick={async () => {
                    try {
                      setIsCreatingResolutions(true);
                      const res = await fetch(`/api/ppo-head/meetings/${resolvedParams.id}/resolutions/create`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ agendaApprovedItemIds: resolutionApprovedIds }),
                      });
                      const data = await res.json();
                      if (!res.ok) throw new Error(data.error || "Ошибка создания постановлений");
                      if (data.meeting) setMeeting(data.meeting);
                      alertSuccess(data.message || "Постановления созданы");
                    } catch (e: any) {
                      alertError(e.message || "Не удалось создать постановления");
                    } finally {
                      setIsCreatingResolutions(false);
                    }
                  }}
                  disabled={isCreatingResolutions}
                  className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  {isCreatingResolutions ? "Создание…" : "Создать постановление"}
                </button>
              </div>
            )}
          </div>

          {!protocolSigned ? (
            <div className="rounded-lg border-2 border-dashed border-gray-300 bg-white p-8 text-center dark:border-gray-700 dark:bg-gray-800">
              <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <h3 className="mt-2 text-sm font-medium text-gray-900 dark:text-white">Нет постановлений</h3>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                Список вопросов для постановлений формируется только после подписания протокола заседания.
              </p>
            </div>
          ) : meeting.agendaItems.length > 0 ? (
            resolutionApprovedItems.length === 0 ? (
              <div className="rounded-lg border-2 border-dashed border-gray-300 bg-white p-6 text-center dark:border-gray-700 dark:bg-gray-800">
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Утвердите пункты повестки в протоколе (блок 5 «Утверждение повестки дня»), чтобы здесь отображались вопросы для постановлений.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {(() => {
                  const getResolutionForItem = (itemId: string) =>
                    meeting.resolutions.find((r: any) => (r.metadata as { agendaItemId?: string } | null)?.agendaItemId === itemId);
                  return (
                <>
                <input
                  ref={resolutionSignedFileInputRef}
                  type="file"
                  accept=".pdf,image/jpeg,image/jpg,image/png"
                  className="hidden"
                  aria-label="Загрузить подписанное постановление"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    const docId = resolutionIdForSignedUpload;
                    if (!file || !docId) return;
                    setUploadingSignedResolutionId(docId);
                    setResolutionIdForSignedUpload(null);
                    try {
                      const fd = new FormData();
                      fd.append("file", file);
                      fd.append("documentId", docId);
                      const res = await fetch("/api/documents/upload-signed", { method: "POST", body: fd });
                      const data = await res.json().catch(() => ({}));
                      if (!res.ok) throw new Error(data.error || "Ошибка загрузки");
                      alertSuccess(data.message || "Подписанное постановление загружено");
                      loadMeeting();
                    } catch (err) {
                      alertError(err instanceof Error ? err.message : "Не удалось загрузить скан");
                    } finally {
                      setUploadingSignedResolutionId(null);
                      e.target.value = "";
                    }
                  }}
                />
                {resolutionApprovedItems.map((item: { id: string; orderNumber: number; title: string }) => {
                  const resolution = getResolutionForItem(item.id);
                  return (
                    <div
                      key={item.id}
                      className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800"
                    >
                      <h4 className="text-sm font-semibold text-gray-900 dark:text-white">
                        Вопрос {item.orderNumber}. {item.title}
                      </h4>
                      {resolution ? (
                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          {resolution.regNumber && (
                            <span className="text-xs text-gray-500 dark:text-gray-400">№ {resolution.regNumber}</span>
                          )}
                          {!readOnly && canDeleteMeeting ? (
                            <button
                              type="button"
                              onClick={() => setPdfPreviewUrl(getDocumentViewUrl(resolution.id))}
                              className="inline-flex items-center justify-center gap-2 rounded-lg border border-blue-300 bg-blue-50 px-4 py-2 text-sm font-medium text-blue-700 transition-colors hover:bg-blue-100 dark:border-blue-700 dark:bg-blue-900/30 dark:text-blue-300 dark:hover:bg-blue-900/50"
                            >
                              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                              </svg>
                              Постановление PDF
                            </button>
                          ) : resolution.status !== "SIGNED" ? (
                            <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                              Постановление по этому вопросу ещё не подписано.
                            </p>
                          ) : null}
                          {!readOnly && canDeleteMeeting && resolution.status !== "SIGNED" && (
                            <button
                              type="button"
                              onClick={() => {
                                setResolutionIdForSignedUpload(resolution.id);
                                resolutionSignedFileInputRef.current?.click();
                              }}
                              disabled={uploadingSignedResolutionId === resolution.id}
                              className="inline-flex items-center justify-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-medium text-amber-800 transition-colors hover:bg-amber-100 disabled:opacity-50 dark:border-amber-600 dark:bg-amber-900/30 dark:text-amber-200 dark:hover:bg-amber-900/50"
                              title="Загрузить скан подписанного постановления"
                            >
                              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                              </svg>
                              {uploadingSignedResolutionId === resolution.id ? "Загрузка…" : "Загрузить подписанное постановление"}
                            </button>
                          )}
                          {(resolution as { signedFilePath?: string | null }).signedFilePath && (
                            <>
                              <button
                                type="button"
                                onClick={() => setPdfPreviewUrl(`${getDocumentViewUrl(resolution.id)}&signed=true`)}
                                className="inline-flex items-center justify-center gap-2 rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-800 transition-colors hover:bg-emerald-100 dark:border-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-200 dark:hover:bg-emerald-900/50"
                                title="Просмотр загруженного подписанного постановления (скан)"
                              >
                                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                </svg>
                                Подписанное постановление
                              </button>
                              {!readOnly && canDeleteMeeting && (
                                <button
                                  type="button"
                                  disabled={resolution.status === "SIGNED"}
                                  onClick={async () => {
                                    if (resolution.status === "SIGNED") return;
                                    try {
                                      const res = await fetch(
                                        `/api/ppo-head/meetings/${resolvedParams.id}/documents/${resolution.id}/mark-signed`,
                                        { method: "POST" }
                                      );
                                      if (!res.ok) {
                                        const err = await res.json().catch(() => ({}));
                                        throw new Error(err.error || "Ошибка");
                                      }
                                      const data = await res.json();
                                      alertSuccess(data.message || "Постановление отмечено как подписанное");
                                      loadMeeting();
                                    } catch (e) {
                                      alertError(e instanceof Error ? e.message : "Не удалось отметить постановление как подписанное");
                                    }
                                  }}
                                  className="inline-flex items-center justify-center gap-2 rounded-lg border border-red-300 bg-red-50 px-4 py-2 text-sm font-medium text-red-700 transition-colors hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-red-50 dark:border-red-700 dark:bg-red-900/30 dark:text-red-400 dark:hover:bg-red-900/50 dark:disabled:hover:bg-red-900/30"
                                  title={resolution.status === "SIGNED" ? "Постановление подписано" : "Отметить постановление как подписанное"}
                                >
                                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                                  </svg>
                                  {resolution.status === "SIGNED" ? "Подписано" : "Подписать"}
                                </button>
                              )}
                            </>
                          )}
                        </div>
                      ) : (
                        <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                          Постановление по этому вопросу ещё не создано.
                          {!readOnly && canDeleteMeeting && " Нажмите «Создать постановление» выше."}
                        </p>
                      )}
                    </div>
                  );
                })}
                </>
                  );
                })()}
              </div>
            )
          ) : (
            <div className="rounded-lg border-2 border-dashed border-gray-300 bg-white p-8 text-center dark:border-gray-700 dark:bg-gray-800">
              <h3 className="text-sm font-medium text-gray-900 dark:text-white">Нет пунктов повестки</h3>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                Добавьте вопросы в повестку дня заседания, затем сформируйте протокол и создайте постановления.
              </p>
            </div>
          )}

          {meeting.agendaItems.length === 0 && meeting.resolutions.length === 0 && (
            <div className="rounded-lg border-2 border-dashed border-gray-300 bg-white p-8 text-center dark:border-gray-700 dark:bg-gray-800">
              <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <h3 className="mt-2 text-sm font-medium text-gray-900 dark:text-white">Нет постановлений</h3>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                {!protocolSigned
                  ? "Список вопросов формируется только после подписания протокола."
                  : "Добавьте вопросы в повестку дня заседания, затем сформируйте протокол и создайте постановления."}
              </p>
            </div>
          )}
        </div>
      );
    })()}

      {effectiveTab === "extracts" && (() => {
        const protocolSignedExtract = meeting.protocolDocument?.status === "SIGNED";
        const pd = meeting.protocolProceduralData as { agendaApprovedItemIds?: string[] } | null | undefined;
        const extractApprovedIds = (Array.isArray(pd?.agendaApprovedItemIds) ? pd.agendaApprovedItemIds : null) ?? protocolProcedural.agendaApprovedItemIds ?? meeting.agendaItems.map((i: AgendaItem) => i.id);
        const extractApprovedItems = protocolSignedExtract
          ? meeting.agendaItems.filter((item: AgendaItem) => extractApprovedIds.includes(item.id))
          : [];
        return (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                Выписки ({meeting.extracts.length})
              </h3>
            </div>
            {protocolSignedExtract && !readOnly && canDeleteMeeting && meeting.protocolDocument && extractApprovedItems.length > 0 && (
              <button
                onClick={async () => {
                  if (extractSelectedItemIds.length === 0) {
                    alertError("Выберите вопросы для выписки.");
                    return;
                  }
                  try {
                    setIsCreatingExtract(true);
                    const res = await fetch(`/api/ppo-head/meetings/${resolvedParams.id}/extracts/create`, {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        agendaItemIds: extractSelectedItemIds,
                        location: meeting.location ?? null,
                        meetingTime: meeting.scheduledTime ?? null,
                        invitedGuests: meeting.invitedGuests ?? null,
                      }),
                    });
                    const data = await res.json();
                    if (!res.ok) throw new Error(data.error || "Ошибка создания выписки");
                    alertSuccess(data.message || "Выписка создана");
                    setExtractSelectedItemIds([]);
                    await loadMeeting(true);
                  } catch (e: unknown) {
                    alertError(e instanceof Error ? e.message : "Не удалось создать выписку");
                  } finally {
                    setIsCreatingExtract(false);
                  }
                }}
                disabled={isCreatingExtract}
                className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                {isCreatingExtract ? "Создание…" : "Создать выписку"}
              </button>
            )}
          </div>

          {!protocolSignedExtract ? (
            <div className="rounded-lg border-2 border-dashed border-gray-300 bg-white p-8 text-center dark:border-gray-700 dark:bg-gray-800">
              <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <h3 className="mt-2 text-sm font-medium text-gray-900 dark:text-white">Нет выписок</h3>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                Список вопросов для выписки формируется только после подписания протокола заседания.
              </p>
            </div>
          ) : meeting.agendaItems.length > 0 ? (
            extractApprovedItems.length === 0 ? (
              <div className="rounded-lg border-2 border-dashed border-gray-300 bg-white p-6 text-center dark:border-gray-700 dark:bg-gray-800">
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Утвердите пункты повестки в протоколе (блок 5 «Утверждение повестки дня»), чтобы здесь отображались вопросы для выписок.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {(!readOnly && canDeleteMeeting) && (
                  <div className="rounded-xl border-2 border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
                    <h4 className="mb-3 text-sm font-semibold text-gray-900 dark:text-white">
                      Утверждённые вопросы повестки для выписки
                    </h4>
                    <p className="mb-3 text-xs text-gray-500 dark:text-gray-400">
                      Список формируется из пунктов, утверждённых в протоколе (блок 5). Отметьте галочкой пункты, которые войдут в выписку.
                    </p>
                    <div className="space-y-1">
                      {extractApprovedItems.map((item: AgendaItem) => {
                        const checked = extractSelectedItemIds.includes(item.id);
                        return (
                          <label
                            key={item.id}
                            className={`flex items-center gap-2.5 rounded-lg border px-3 py-2 text-sm transition-colors cursor-pointer ${checked ? "border-blue-300 bg-blue-50 dark:border-blue-700 dark:bg-blue-900/30" : "border-gray-200 hover-surface dark:border-gray-600"}`}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => {
                                if (checked) {
                                  setExtractSelectedItemIds((prev) => prev.filter((id) => id !== item.id));
                                } else {
                                  setExtractSelectedItemIds((prev) => [...prev, item.id]);
                                }
                              }}
                              className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 dark:border-gray-600"
                            />
                            <span className="text-gray-900 dark:text-white font-medium">
                              Вопрос {item.orderNumber}. {item.title}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                )}
                {meeting.extracts.length > 0 && (
                  <>
                    <input
                      ref={extractSignedFileInputRef}
                      type="file"
                      accept=".pdf,image/jpeg,image/jpg,image/png"
                      className="hidden"
                      aria-label="Загрузить подписанную выписку"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        const docId = extractIdForSignedUpload;
                        if (!file || !docId) return;
                        setUploadingSignedExtractId(docId);
                        setExtractIdForSignedUpload(null);
                        try {
                          const fd = new FormData();
                          fd.append("file", file);
                          fd.append("documentId", docId);
                          const res = await fetch("/api/documents/upload-signed", { method: "POST", body: fd });
                          const data = await res.json().catch(() => ({}));
                          if (!res.ok) throw new Error(data.error || "Ошибка загрузки");
                          alertSuccess(data.message || "Подписанная выписка загружена");
                          loadMeeting();
                        } catch (err) {
                          alertError(err instanceof Error ? err.message : "Не удалось загрузить скан");
                        } finally {
                          setUploadingSignedExtractId(null);
                          e.target.value = "";
                        }
                      }}
                    />
                    <div className="flex flex-col items-stretch gap-2">
                      {([...(meeting.extracts || [])] as { id: string; regNumber?: string; title?: string; status?: string; signedFilePath?: string | null; metadata?: { agendaItemIds?: string[] } | null; createdAt?: string }[])
                        .sort((a, b) => {
                          const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
                          const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
                          return ta - tb;
                        })
                        .map((extract) => {
                          const agendaIds = extract.metadata?.agendaItemIds;
                          const items = Array.isArray(agendaIds)
                            ? (agendaIds as string[])
                                .map((id: string) => meeting.agendaItems.find((a: AgendaItem) => a.id === id))
                                .filter((a): a is AgendaItem => !!a)
                                .sort((a, b) => a.orderNumber - b.orderNumber)
                            : [];
                          const questionLabels = items.map((a: AgendaItem) => `Вопрос ${a.orderNumber}`).join(", ");
                          const buttonLabel = questionLabels ? `Выписка: ${questionLabels}` : "Выписка";
                          const hasSigned = !!(extract as { signedFilePath?: string | null }).signedFilePath;
                          const extractStatus = (extract as { status?: string }).status;
                          const isExtractSigned = extractStatus === "SIGNED";
                          return (
                            <div key={extract.id} className="flex flex-wrap items-center gap-2">
                              {isChairmanOrDeputyParticipant && !isExtractSigned && (
                              <button
                                type="button"
                                onClick={() => setPdfPreviewUrl(getDocumentViewUrl(extract.id))}
                                className="inline-flex items-center justify-center gap-2 rounded-lg border border-blue-300 bg-blue-50 px-4 py-2 text-sm font-medium text-blue-700 transition-colors hover:bg-blue-100 dark:border-blue-700 dark:bg-blue-900/30 dark:text-blue-300 dark:hover:bg-blue-900/50"
                              >
                                <svg className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                </svg>
                                {buttonLabel}
                              </button>
                              )}
                              {!readOnly && isChairmanOrDeputyParticipant && !isExtractSigned && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setExtractIdForSignedUpload(extract.id);
                                    extractSignedFileInputRef.current?.click();
                                  }}
                                  disabled={uploadingSignedExtractId === extract.id}
                                  className="inline-flex items-center justify-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-medium text-amber-800 transition-colors hover:bg-amber-100 disabled:opacity-50 dark:border-amber-600 dark:bg-amber-900/30 dark:text-amber-200 dark:hover:bg-amber-900/50"
                                  title="Загрузить скан подписанной выписки"
                                >
                                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                                  </svg>
                                  {uploadingSignedExtractId === extract.id ? "Загрузка…" : "Загрузить подписанную выписку"}
                                </button>
                              )}
                              {hasSigned && isChairmanOrDeputyParticipant && (
                                <button
                                  type="button"
                                  onClick={() => setPdfPreviewUrl(`${getDocumentViewUrl(extract.id)}&signed=true`)}
                                  className="inline-flex items-center justify-center gap-2 rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-800 transition-colors hover:bg-emerald-100 dark:border-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-200 dark:hover:bg-emerald-900/50"
                                  title="Просмотр загруженной подписанной выписки (скан)"
                                >
                                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                  </svg>
                                  {questionLabels ? `Подписанная выписка: ${questionLabels}` : "Подписанная выписка"}
                                </button>
                              )}
                              {hasSigned && !readOnly && isChairmanOrDeputyParticipant && (
                                <button
                                  type="button"
                                  disabled={isExtractSigned}
                                  onClick={async () => {
                                    if (isExtractSigned) return;
                                    try {
                                      const res = await fetch(
                                        `/api/ppo-head/meetings/${resolvedParams.id}/documents/${extract.id}/mark-signed`,
                                        { method: "POST" }
                                      );
                                      if (!res.ok) {
                                        const err = await res.json().catch(() => ({}));
                                        throw new Error(err.error || "Ошибка");
                                      }
                                      const data = await res.json();
                                      alertSuccess(data.message || "Выписка отмечена как подписанная");
                                      loadMeeting();
                                    } catch (e) {
                                      alertError(e instanceof Error ? e.message : "Не удалось отметить выписку как подписанную");
                                    }
                                  }}
                                  className="inline-flex items-center justify-center gap-2 rounded-lg border border-red-300 bg-red-50 px-4 py-2 text-sm font-medium text-red-700 transition-colors hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-red-50 dark:border-red-700 dark:bg-red-900/30 dark:text-red-400 dark:hover:bg-red-900/50 dark:disabled:hover:bg-red-900/30"
                                  title={isExtractSigned ? "Выписка подписана" : "Отметить выписку как подписанную"}
                                >
                                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                                  </svg>
                                  {isExtractSigned ? "Подписано" : "Подписать"}
                                </button>
                              )}
                              {isExtractSigned && !readOnly && isChairmanOrDeputyParticipant && (
                                <button
                                  type="button"
                                  disabled={sendingExtractId === extract.id}
                                  onClick={() => {
                                    setExtractIdForSendModal(extract.id);
                                    setSelectedUserIdsForExtract([]);
                                  }}
                                  className="inline-flex items-center justify-center gap-2 rounded-lg border border-blue-300 bg-blue-50 px-4 py-2 text-sm font-medium text-blue-700 transition-colors hover:bg-blue-100 disabled:opacity-50 dark:border-blue-700 dark:bg-blue-900/30 dark:text-blue-300 dark:hover:bg-blue-900/50"
                                  title="Разослать выписку участникам во Входящие"
                                >
                                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                                  </svg>
                                  {sendingExtractId === extract.id ? "Отправка…" : "Разослать выписку"}
                                </button>
                              )}
                              {!readOnly && isChairmanOrDeputyParticipant && (
                                <button
                                  type="button"
                                  disabled={deletingExtractId === extract.id}
                                  onClick={async () => {
                                    const ok = await confirm(
                                      "Удалить эту выписку? Действие нельзя отменить.",
                                      "Удаление выписки"
                                    );
                                    if (!ok) return;
                                    setDeletingExtractId(extract.id);
                                    try {
                                      const res = await fetch(
                                        `/api/ppo-head/meetings/${resolvedParams.id}/extracts/${extract.id}`,
                                        { method: "DELETE" }
                                      );
                                      const data = await res.json().catch(() => ({}));
                                      if (!res.ok) throw new Error(data.error || "Ошибка удаления");
                                      alertSuccess(data.message || "Выписка удалена");
                                      loadMeeting();
                                    } catch (e) {
                                      alertError(e instanceof Error ? e.message : "Не удалось удалить выписку");
                                    } finally {
                                      setDeletingExtractId(null);
                                    }
                                  }}
                                  className="inline-flex items-center justify-center gap-2 rounded-lg border border-gray-300 bg-gray-50 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100 disabled:opacity-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
                                  title="Удалить выписку"
                                >
                                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                  </svg>
                                  {deletingExtractId === extract.id ? "Удаление…" : "Удалить"}
                                </button>
                              )}
                            </div>
                          );
                        })}
                    </div>
                  </>
                )}
              </div>
            )
          ) : (
            <div className="rounded-lg border-2 border-dashed border-gray-300 bg-white p-8 text-center dark:border-gray-700 dark:bg-gray-800">
              <h3 className="text-sm font-medium text-gray-900 dark:text-white">Нет пунктов повестки</h3>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                Добавьте вопросы в повестку дня заседания, затем сформируйте протокол и создайте выписки.
              </p>
            </div>
          )}

          {meeting.agendaItems.length === 0 && meeting.extracts.length === 0 && (
            <div className="rounded-lg border-2 border-dashed border-gray-300 bg-white p-8 text-center dark:border-gray-700 dark:bg-gray-800">
              <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <h3 className="mt-2 text-sm font-medium text-gray-900 dark:text-white">Нет выписок</h3>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                {!protocolSignedExtract
                  ? "Список вопросов формируется только после подписания протокола."
                  : "Добавьте вопросы в повестку дня заседания, затем сформируйте протокол и создайте выписки."}
              </p>
            </div>
          )}
        </div>
        );
      })()}

      {/* Модальное окно выбора получателя выписки */}
      <Modal
        isOpen={!!extractIdForSendModal}
        onClose={() => {
          setExtractIdForSendModal(null);
          setSelectedUserIdsForExtract([]);
        }}
        className="max-w-md w-full"
        isFullscreen={false}
      >
        <ModalHeader>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            Разослать выписку
          </h3>
        </ModalHeader>
        <ModalBody className="p-4">
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
            Выберите одного или нескольких членов профсоюза — выписка будет отправлена им во Входящие. Список формируется из раздела «Члены профсоюза».
          </p>
          {members.length > 0 && (
            <div className="flex items-center justify-between gap-2 mb-2">
              {selectedUserIdsForExtract.length > 0 && (
                <span className="text-sm text-blue-600 dark:text-blue-400">
                  Выбрано: {selectedUserIdsForExtract.length}
                </span>
              )}
              <button
                type="button"
                onClick={() => {
                  const allSelected = selectedUserIdsForExtract.length === members.length;
                  setSelectedUserIdsForExtract(allSelected ? [] : members.map((m: { id: string }) => m.id));
                }}
                className="text-sm font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
              >
                {selectedUserIdsForExtract.length === members.length ? "Снять выбор" : "Выбрать всех"}
              </button>
            </div>
          )}
          <div className="max-h-64 overflow-y-auto rounded-lg border border-gray-200 dark:border-gray-700 divide-y divide-gray-200 dark:divide-gray-700">
            {members.length === 0 ? (
              <div className="px-3 py-4 text-sm text-gray-500 dark:text-gray-400">
                Список членов пуст. Добавьте членов профсоюза в разделе «Члены профсоюза».
              </div>
            ) : (
              members.map((m: { id: string; lastName?: string | null; firstName?: string | null; middleName?: string | null }) => {
                const isSelected = selectedUserIdsForExtract.includes(m.id);
                const alreadySent = extractAlreadySentToUserIds.includes(m.id);
                const name = [m.lastName, m.firstName, m.middleName].filter(Boolean).join(" ") || "—";
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => {
                      setSelectedUserIdsForExtract((prev) =>
                        isSelected ? prev.filter((id) => id !== m.id) : [...prev, m.id]
                      );
                    }}
                    className={`w-full text-left px-3 py-2.5 text-sm transition-colors flex items-center gap-2 ${
                      isSelected
                        ? "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200"
                        : "hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-900 dark:text-gray-100"
                    }`}
                  >
                    <span
                      className={`shrink-0 w-4 h-4 rounded border flex items-center justify-center ${
                        isSelected
                          ? "bg-blue-600 border-blue-600 text-white"
                          : "border-gray-400 dark:border-gray-500"
                      }`}
                    >
                      {isSelected && (
                        <svg className="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      {name}
                      {alreadySent && (
                        <span className="ml-1 text-red-600 dark:text-red-400 whitespace-nowrap">(отправлено)</span>
                      )}
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </ModalBody>
        <ModalFooter className="flex justify-end gap-2">
          <button
            type="button"
            onClick={() => {
              setExtractIdForSendModal(null);
              setSelectedUserIdsForExtract([]);
            }}
            className="rounded-lg border border-gray-300 px-4 py-2 text-gray-700 hover-surface dark:border-gray-600 dark:text-gray-300"
          >
            Отмена
          </button>
          <button
            type="button"
            disabled={selectedUserIdsForExtract.length === 0 || sendingExtractId === extractIdForSendModal}
            onClick={async () => {
              if (!extractIdForSendModal || selectedUserIdsForExtract.length === 0) return;
              setSendingExtractId(extractIdForSendModal);
              try {
                const res = await fetch(`/api/ppo-head/meetings/${resolvedParams.id}/notify-participants`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    type: "extract_review",
                    documentId: extractIdForSendModal,
                    recipientUserIds: selectedUserIdsForExtract,
                  }),
                });
                const data = await res.json().catch(() => ({}));
                if (!res.ok) throw new Error(data.error || "Ошибка рассылки");
                alertSuccess(data.message || "Выписка разослана во Входящие");
                setExtractIdForSendModal(null);
                setSelectedUserIdsForExtract([]);
                loadMeeting();
              } catch (e) {
                alertError(e instanceof Error ? e.message : "Не удалось разослать выписку");
              } finally {
                setSendingExtractId(null);
              }
            }}
            className="rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {sendingExtractId === extractIdForSendModal ? "Отправка…" : "Разослать"}
          </button>
        </ModalFooter>
      </Modal>

      {/* Модальное окно для превью PDF */}
      <Modal
        isOpen={!!pdfPreviewUrl}
        onClose={() => setPdfPreviewUrl(null)}
        className="max-w-6xl w-full"
        isFullscreen={false}
      >
        <ModalHeader>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            Просмотр документа
          </h3>
        </ModalHeader>
        <ModalBody className="p-4">
          {pdfPreviewUrl && (
            <div className="w-full h-[80vh] border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden bg-gray-100 dark:bg-gray-900">
              <iframe
                src={`${pdfPreviewUrl}#toolbar=1&navpanes=1&scrollbar=1`}
                className="w-full h-full min-h-[600px]"
                title="PDF Preview"
              />
            </div>
          )}
        </ModalBody>
        <ModalFooter className="flex justify-end">
          <button
            type="button"
            onClick={() => setPdfPreviewUrl(null)}
            className="rounded-lg border border-gray-300 px-4 py-2 text-gray-700 hover-surface dark:border-gray-600 dark:text-gray-300"
          >
            Закрыть
          </button>
        </ModalFooter>
      </Modal>
    </div>
  )}
    </MembershipGate>
  );
}
