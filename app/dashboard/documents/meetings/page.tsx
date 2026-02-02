"use client";

import { useState, useEffect, useRef } from "react";
import { useSession } from "next-auth/react";
import { useSearchParams, useRouter } from "next/navigation";
import { alertSuccess, alertError, confirm } from "@/lib/alert";
import Link from "next/link";
import { Modal } from "@/components/ui/modal";

interface Meeting {
  id: string;
  type: string;
  status: string;
  format: string;
  number: string;
  title: string;
  scheduledDate: string;
  scheduledTime: string | null;
  location: string | null;
  createdBy: {
    id: string;
    firstName: string | null;
    lastName: string | null;
  };
  agendaDocument: {
    id: string;
    regNumber: string | null;
    status: string;
    filePath: string | null;
  } | null;
  protocolDocument: {
    id: string;
    regNumber: string | null;
    status: string;
    filePath: string | null;
  } | null;
  _count: {
    participants: number;
    agendaItems: number;
    resolutions: number;
    extracts: number;
  };
}

const MEETING_STATUS_LABELS: Record<string, string> = {
  DRAFT: "Черновик",
  SCHEDULED: "Запланировано",
  IN_PROGRESS: "Идёт заседание",
  VOTING: "Голосование",
  COMPLETED: "Завершено",
  CANCELLED: "Отменено",
};

const MEETING_TYPE_LABELS: Record<string, string> = {
  COMMITTEE: "Заседание профкома",
  BUREAU: "Заседание профбюро",
  GROUP: "Собрание профгруппы",
  YOUTH_COUNCIL: "Молодёжный совет",
  PRESIDIUM: "Президиум",
  GENERAL: "Общее собрание",
};

const MEETING_STATUS_COLORS: Record<string, string> = {
  DRAFT: "bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-300",
  SCHEDULED: "bg-blue-200 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  IN_PROGRESS: "bg-yellow-200 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
  VOTING: "bg-purple-200 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400",
  COMPLETED: "bg-green-200 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  CANCELLED: "bg-red-200 text-red-800 dark:bg-red-900/30 dark:text-red-400",
};

const TAB_FROM_URL = ["all", "agenda", "protocol", "resolutions", "extracts"] as const;
type TabKey = (typeof TAB_FROM_URL)[number];

export default function MeetingsPage() {
  const { data: session } = useSession();
  const searchParams = useSearchParams();
  const tabParam = searchParams.get("tab");
  const initialTab: TabKey = TAB_FROM_URL.includes(tabParam as TabKey) ? (tabParam as TabKey) : "all";

  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [activeTab, setActiveTab] = useState<TabKey>(initialTab);
  const [deletingMeetingId, setDeletingMeetingId] = useState<string | null>(null);
  const [showProtocolFromAgendaModal, setShowProtocolFromAgendaModal] = useState(false);
  const [createdMeetingId, setCreatedMeetingId] = useState<string | null>(null);
  const [postCreateStep, setPostCreateStep] = useState<"choose" | "generating" | null>(null);
  const router = useRouter();

  // Синхронизация таба с URL при переходе по пунктам меню
  useEffect(() => {
    const t = TAB_FROM_URL.includes(tabParam as TabKey) ? (tabParam as TabKey) : "all";
    setActiveTab(t);
  }, [tabParam]);

  const [formData, setFormData] = useState({
    type: "COMMITTEE",
    format: "OFFLINE",
    title: "",
    scheduledDate: "",
    scheduledTime: "",
    location: "",
    onlineLink: "",
    // Участники: члены выборного органа (председатель = текущий пользователь; зам + члены профкома)
    participantIds: [] as string[],
    externalParticipants: [] as Array<{ name: string; position: string; userId?: string }>,
    // Пункты повестки
    agendaItems: [{ title: "", description: "", speakerId: "", speakerName: "", speakerPosition: "", coSpeakerId: "", coSpeakerName: "", coSpeakers: [] as Array<{ userId?: string; extIndex?: number; name: string; position?: string }>, attachments: [] as Array<{ name: string; url: string; size?: number }> }],
  });

  // Члены выборного органа (для состава заседания)
  const [electedBodyMembers, setElectedBodyMembers] = useState<Array<{
    id: string;
    firstName: string | null;
    lastName: string | null;
    middleName: string | null;
    jobTitle: string | null;
    roleName: string;
  }>>([]);
  const [loadingElectedBody, setLoadingElectedBody] = useState(false);
  const [uploadingAgendaIndex, setUploadingAgendaIndex] = useState<number | null>(null);
  const [participantsDropdownOpen, setParticipantsDropdownOpen] = useState(false);
  const [externalInviteDropdownOpen, setExternalInviteDropdownOpen] = useState(false);
  const [coSpeakerDropdownIndex, setCoSpeakerDropdownIndex] = useState<number | null>(null);
  const participantsDropdownRef = useRef<HTMLDivElement>(null);
  const externalInviteDropdownRef = useRef<HTMLDivElement>(null);
  const coSpeakerDropdownRef = useRef<HTMLDivElement>(null);
  // Все члены профсоюза (для докладчика и приглашённых)
  const [members, setMembers] = useState<Array<{
    id: string;
    firstName: string | null;
    lastName: string | null;
    middleName: string | null;
    jobTitle: string | null;
  }>>([]);
  const [_loadingMembers, setLoadingMembers] = useState(false);

  useEffect(() => {
    loadMeetings();
  }, []);

  useEffect(() => {
    if (showCreateForm) {
      loadElectedBodyMembers();
      if (members.length === 0) loadMembers();
    }
  }, [showCreateForm, members.length]);

  // Автоподстановка состава: все замы и все члены профкома по умолчанию (по уставу)
  const chairmanId = session?.user?.id ?? "";
  const isDeputyRole = (roleName: string) => /зам|заместитель/i.test(roleName);
  const isMemberRole = (roleName: string) => /член|профком/i.test(roleName) || roleName.trim() !== "";
  useEffect(() => {
    if (!showCreateForm || !chairmanId || electedBodyMembers.length === 0) return;
    setFormData((prev) => {
      if (prev.participantIds.length > 0) return prev;
      const deputyIds = electedBodyMembers.filter((m) => m.id !== chairmanId && isDeputyRole(m.roleName)).map((m) => m.id);
      const memberIds = electedBodyMembers.filter((m) => m.id !== chairmanId && !deputyIds.includes(m.id) && isMemberRole(m.roleName)).map((m) => m.id);
      const defaultIds = [...new Set([...deputyIds, ...memberIds])];
      return { ...prev, participantIds: defaultIds };
    });
  }, [showCreateForm, chairmanId, electedBodyMembers]);

  useEffect(() => {
    const closeAllDropdowns = () => {
      setParticipantsDropdownOpen(false);
      setExternalInviteDropdownOpen(false);
      setCoSpeakerDropdownIndex(null);
    };
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (participantsDropdownRef.current && !participantsDropdownRef.current.contains(target)) setParticipantsDropdownOpen(false);
      if (externalInviteDropdownRef.current && !externalInviteDropdownRef.current.contains(target)) setExternalInviteDropdownOpen(false);
      if (coSpeakerDropdownRef.current && !coSpeakerDropdownRef.current.contains(target)) setCoSpeakerDropdownIndex(null);
    };
    const handleScroll = () => closeAllDropdowns();
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("scroll", handleScroll, true);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("scroll", handleScroll, true);
    };
  }, []);

  const loadElectedBodyMembers = async () => {
    try {
      setLoadingElectedBody(true);
      const response = await fetch("/api/ppo-head/elected-body-members");
      if (response.ok) {
        const data = await response.json();
        setElectedBodyMembers(data.members || []);
      }
    } catch (error) {
      console.error("Ошибка загрузки выборного органа:", error);
    } finally {
      setLoadingElectedBody(false);
    }
  };

  const loadMembers = async () => {
    try {
      setLoadingMembers(true);
      const response = await fetch("/api/ppo-head/members?status=approved");
      if (response.ok) {
        const data = await response.json();
        setMembers(data.members || []);
      }
    } catch (error) {
      console.error("Ошибка загрузки членов:", error);
    } finally {
      setLoadingMembers(false);
    }
  };

  const getMemberFullName = (member: { lastName?: string | null; firstName?: string | null; middleName?: string | null }) => {
    return [member.lastName, member.firstName, member.middleName].filter(Boolean).join(" ");
  };

  const addExternalParticipant = () => {
    setFormData(prev => ({
      ...prev,
      externalParticipants: [...prev.externalParticipants, { name: "", position: "" }],
    }));
  };

  const updateExternalParticipant = (index: number, field: "name" | "position", value: string) => {
    setFormData(prev => ({
      ...prev,
      externalParticipants: prev.externalParticipants.map((p, i) =>
        i === index ? { ...p, [field]: value } : p
      ),
    }));
  };

  const removeExternalParticipant = (index: number) => {
    setFormData(prev => ({
      ...prev,
      externalParticipants: prev.externalParticipants.filter((_, i) => i !== index),
    }));
  };

  const loadMeetings = async () => {
    try {
      setIsLoading(true);
      const response = await fetch("/api/ppo-head/meetings");
      if (response.ok) {
        const data = await response.json();
        setMeetings(data.meetings || []);
      }
    } catch (error) {
      console.error("Ошибка загрузки заседаний:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateMeeting = async () => {
    if (!formData.scheduledDate) {
      alertError("Укажите дату заседания");
      return;
    }

    // Состав заседания: минимум 3 человека (председатель + зам. председателя + член профкома)
    if (formData.participantIds.length < 2) {
      alertError("Состав заседания: минимум 3 человека (председатель + зам. председателя + член профкома). Добавьте участников в блоке «Состав заседания».");
      return;
    }
    const hasDeputy = formData.participantIds.some((id) => {
      const m = electedBodyMembers.find((e) => e.id === id);
      return m && isDeputyRole(m.roleName);
    });
    const hasMember = formData.participantIds.some((id) => {
      const m = electedBodyMembers.find((e) => e.id === id);
      return m && !isDeputyRole(m.roleName) && isMemberRole(m.roleName);
    });
    if (!hasDeputy) {
      alertError("В составе заседания должен быть хотя бы один зам. председателя. Добавьте участника в блоке «Зам. председателя» или назначьте роль в разделе Управление сотрудниками.");
      return;
    }
    if (!hasMember) {
      alertError("В составе заседания должен быть хотя бы один член профкома. Добавьте участника в блоке «Члены профкома» или назначьте роль в разделе Управление сотрудниками.");
      return;
    }

    const validAgendaItems = formData.agendaItems.filter(item => item.title.trim());
    
    if (validAgendaItems.length === 0) {
      alertError("Добавьте хотя бы один вопрос в повестку");
      return;
    }

    // Проверяем, что у каждого пункта повестки есть докладчик
    const itemsWithoutSpeaker = validAgendaItems.filter(
      item => !item.speakerId && !item.speakerName?.trim()
    );
    
    if (itemsWithoutSpeaker.length > 0) {
      alertError(`Укажите докладчика для всех пунктов повестки (${itemsWithoutSpeaker.length} пункт(ов) без докладчика)`);
      return;
    }

    try {
      setIsCreating(true);
      const response = await fetch("/api/ppo-head/meetings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: formData.type,
          format: formData.format,
          title: formData.title,
          scheduledDate: formData.scheduledDate,
          scheduledTime: formData.scheduledTime || null,
          location: formData.location || null,
          onlineLink: formData.onlineLink || null,
          participantIds: formData.participantIds,
          externalParticipants: formData.externalParticipants.filter(p => p.name.trim()).map(({ name, position }) => ({ name, position })),
          agendaItems: validAgendaItems.map(item => {
            const coSpeakers = (item as AgendaItemForm).coSpeakers ?? [];
            const firstUser = coSpeakers.find(c => c.userId);
            const names = coSpeakers.map(c => c.name).filter(Boolean).join(", ");
            return {
              title: item.title.trim(),
              description: item.description?.trim() || null,
              speakerId: item.speakerId || null,
              speakerName: item.speakerName?.trim() || null,
              speakerPosition: item.speakerPosition?.trim() || null,
              coSpeakerId: firstUser?.userId || null,
              coSpeakerName: names || null,
              attachments: item.attachments?.length ? item.attachments : undefined,
            };
          }),
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        const errorMessage = errorData.error || "Ошибка создания";
        const errorDetails = errorData.details ? `\n\nДетали: ${errorData.details}` : "";
        throw new Error(errorMessage + errorDetails);
      }

      const data = await response.json();
      const meetingId = data?.meeting?.id;
      if (meetingId) {
        setCreatedMeetingId(meetingId);
        setPostCreateStep("choose");
      } else {
        alertSuccess("Документ создан!");
        setShowCreateForm(false);
        resetFormAndClose();
        loadMeetings();
      }
    } catch (error) {
      alertError(error instanceof Error ? error.message : "Не удалось создать заседание");
    } finally {
      setIsCreating(false);
    }
  };

  const resetFormAndClose = () => {
    setShowCreateForm(false);
    setCreatedMeetingId(null);
    setPostCreateStep(null);
    setFormData({
      type: "COMMITTEE",
      format: "OFFLINE",
      title: "",
      scheduledDate: "",
      scheduledTime: "",
      location: "",
      onlineLink: "",
      participantIds: [],
      externalParticipants: [],
      agendaItems: [{ title: "", description: "", speakerId: "", speakerName: "", speakerPosition: "", coSpeakerId: "", coSpeakerName: "", coSpeakers: [], attachments: [] }],
    });
  };

  const handleGenerateAgenda = async () => {
    if (!createdMeetingId) return;
    setPostCreateStep("generating");
    try {
      const res = await fetch(`/api/ppo-head/meetings/${createdMeetingId}/generate-document`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentType: "AGENDA" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const message = (data && typeof data.error === "string" ? data.error : null) || (data?.details ? `${data.error || "Ошибка"}: ${data.details}` : null) || "Ошибка генерации документа";
        throw new Error(message);
      }
      alertSuccess("Повестка дня сформирована");
      loadMeetings();
      resetFormAndClose();
    } catch (e) {
      alertError(e instanceof Error ? e.message : "Не удалось сформировать повестку");
      setPostCreateStep("choose");
    }
  };

  const addAgendaItem = () => {
    setFormData(prev => ({
      ...prev,
      agendaItems: [...prev.agendaItems, { title: "", description: "", speakerId: "", speakerName: "", speakerPosition: "", coSpeakerId: "", coSpeakerName: "", coSpeakers: [], attachments: [] }],
    }));
  };

  const removeAgendaItem = (index: number) => {
    setFormData(prev => ({
      ...prev,
      agendaItems: prev.agendaItems.filter((_, i) => i !== index),
    }));
  };

  type CoSpeakerEntry = { userId?: string; extIndex?: number; name: string; position?: string };
  type AgendaItemForm = { title: string; description: string; speakerId: string; speakerName: string; speakerPosition: string; coSpeakerId: string; coSpeakerName: string; coSpeakers: CoSpeakerEntry[]; attachments: Array<{ name: string; url: string; size?: number }> };
  const updateAgendaItem = (index: number, field: "title" | "description" | "speakerId" | "speakerName" | "speakerPosition" | "coSpeakers" | "attachments", value: string | Array<{ name: string; url: string; size?: number }> | CoSpeakerEntry[]) => {
    setFormData(prev => ({
      ...prev,
      agendaItems: prev.agendaItems.map((item, i): AgendaItemForm => {
        if (i !== index) return item as AgendaItemForm;
        if (field === "speakerId" && typeof value === "string") {
          const member = electedBodyMembers.find(m => m.id === value);
          return {
            ...item,
            speakerId: value,
            speakerName: member ? getMemberFullName(member) : "",
            speakerPosition: member ? (member.jobTitle || member.roleName || "") : "",
          };
        }
        if (field === "speakerName" && typeof value === "string") return { ...item, speakerName: value, speakerId: "", speakerPosition: "" };
        if (field === "speakerPosition" && typeof value === "string") return { ...item, speakerPosition: value };
        if (field === "coSpeakers") return { ...item, coSpeakers: value as CoSpeakerEntry[] };
        if (field === "attachments") return { ...item, attachments: value as Array<{ name: string; url: string; size?: number }> };
        if (field === "title" || field === "description") return { ...item, [field]: value as string };
        return item as AgendaItemForm;
      }),
    }));
  };

  const addCoSpeaker = (itemIndex: number, entry: CoSpeakerEntry) => {
    setFormData(prev => ({
      ...prev,
      agendaItems: prev.agendaItems.map((item, i) => {
        if (i !== itemIndex) return item;
        const list = (item as AgendaItemForm).coSpeakers ?? [];
        const already = list.some(c => (c.userId && c.userId === entry.userId) || (entry.extIndex !== undefined && c.extIndex === entry.extIndex));
        if (already) return item;
        return { ...item, coSpeakers: [...list, entry] };
      }),
    }));
    setCoSpeakerDropdownIndex(null);
  };

  const removeCoSpeaker = (itemIndex: number, coSpeakerIndex: number) => {
    setFormData(prev => ({
      ...prev,
      agendaItems: prev.agendaItems.map((item, i) => {
        if (i !== itemIndex) return item;
        const list = (item as AgendaItemForm).coSpeakers ?? [];
        return { ...item, coSpeakers: list.filter((_, idx) => idx !== coSpeakerIndex) };
      }),
    }));
  };

  /** Докладчик — только члены выборного органа (председатель, замы, члены профкома) */
  const setSpeakerFromSelect = (index: number, value: string) => {
    if (!value) {
      updateAgendaItem(index, "speakerId", "");
      updateAgendaItem(index, "speakerName", "");
      updateAgendaItem(index, "speakerPosition", "");
      return;
    }
    const id = value.startsWith("user:") ? value.slice(5) : value;
    const member = electedBodyMembers.find(m => m.id === id);
    if (member) {
      setFormData(prev => ({
        ...prev,
        agendaItems: prev.agendaItems.map((item, i) =>
          i !== index ? item : {
            ...item,
            speakerId: id,
            speakerName: getMemberFullName(member),
            speakerPosition: member.jobTitle || member.roleName || "",
          }
        ),
      }));
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
            Заседания профкома
          </h1>
          <p className="mt-2 text-gray-600 dark:text-gray-400">
            Управление заседаниями, повестками и протоколами
          </p>
        </div>
        {activeTab === "protocol" ? (
          <button
            onClick={() => setShowProtocolFromAgendaModal(true)}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            Новый протокол
          </button>
        ) : (
          <button
            onClick={() => setShowCreateForm(true)}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Новый документ
          </button>
        )}
      </div>

      {/* Табы */}
      <div className="border-b border-gray-200 dark:border-gray-700">
        <nav className="-mb-px flex space-x-8">
          <button
            onClick={() => setActiveTab("all")}
            className={`whitespace-nowrap border-b-2 py-4 px-1 text-sm font-medium transition-colors ${
              activeTab === "all"
                ? "border-blue-500 text-blue-600 dark:text-blue-400"
                : "border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
            }`}
          >
            Все документы
            {meetings.length > 0 && (
              <span className="ml-2 rounded-full bg-blue-100 px-2 py-0.5 text-xs text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                {meetings.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab("agenda")}
            className={`whitespace-nowrap border-b-2 py-4 px-1 text-sm font-medium transition-colors ${
              activeTab === "agenda"
                ? "border-blue-500 text-blue-600 dark:text-blue-400"
                : "border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
            }`}
          >
            Повестки заседания
            {meetings.filter(m => m.agendaDocument || (m._count?.agendaItems ?? 0) > 0).length > 0 && (
              <span className="ml-2 rounded-full bg-blue-100 px-2 py-0.5 text-xs text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                {meetings.filter(m => m.agendaDocument || (m._count?.agendaItems ?? 0) > 0).length}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab("protocol")}
            className={`whitespace-nowrap border-b-2 py-4 px-1 text-sm font-medium transition-colors ${
              activeTab === "protocol"
                ? "border-blue-500 text-blue-600 dark:text-blue-400"
                : "border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
            }`}
          >
            Протоколы
            {meetings.filter(m => m.protocolDocument).length > 0 && (
              <span className="ml-2 rounded-full bg-blue-100 px-2 py-0.5 text-xs text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                {meetings.filter(m => m.protocolDocument).length}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab("resolutions")}
            className={`whitespace-nowrap border-b-2 py-4 px-1 text-sm font-medium transition-colors ${
              activeTab === "resolutions"
                ? "border-blue-500 text-blue-600 dark:text-blue-400"
                : "border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
            }`}
          >
            Постановления
            {meetings.reduce((sum, m) => sum + (m._count?.resolutions || 0), 0) > 0 && (
              <span className="ml-2 rounded-full bg-blue-100 px-2 py-0.5 text-xs text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                {meetings.reduce((sum, m) => sum + (m._count?.resolutions || 0), 0)}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab("extracts")}
            className={`whitespace-nowrap border-b-2 py-4 px-1 text-sm font-medium transition-colors ${
              activeTab === "extracts"
                ? "border-blue-500 text-blue-600 dark:text-blue-400"
                : "border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
            }`}
          >
            Выписки
            {meetings.reduce((sum, m) => sum + (m._count?.extracts || 0), 0) > 0 && (
              <span className="ml-2 rounded-full bg-blue-100 px-2 py-0.5 text-xs text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                {meetings.reduce((sum, m) => sum + (m._count?.extracts || 0), 0)}
              </span>
            )}
          </button>
        </nav>
      </div>

      {/* Алгоритм проведения заседания — свёрнут по умолчанию */}
      <details className="group rounded-lg border border-gray-200 bg-gray-50/80 dark:border-gray-700 dark:bg-gray-800/50">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-3 text-left text-sm font-medium text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200">
          <span>Алгоритм проведения заседания (согласно требованиям)</span>
          <svg className="h-4 w-4 shrink-0 transition-transform group-open:rotate-180" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </summary>
        <div className="border-t border-gray-200 px-4 py-3 dark:border-gray-700">
          <ol className="list-decimal list-inside space-y-1.5 text-sm text-gray-600 dark:text-gray-400">
            <li><strong>Шаг 1:</strong> Создайте заседание с повесткой дня</li>
            <li><strong>Шаг 2:</strong> Сформируйте документ «Повестка дня» (статус: Черновик)</li>
            <li><strong>Шаг 3:</strong> Отправьте повестку на согласование участникам</li>
            <li><strong>Шаг 4:</strong> Утвердите повестку председателем (статус: Утверждено)</li>
            <li><strong>Шаг 5:</strong> Проведите заседание (очно или онлайн)</li>
            <li><strong>Шаг 6:</strong> Создайте «Протокол» с результатами голосования</li>
            <li><strong>Шаг 7:</strong> Отправьте протокол на согласование</li>
            <li><strong>Шаг 8:</strong> Утвердите протокол председателем</li>
            <li><strong>Шаг 9:</strong> Сформируйте «Постановление» на основании протокола</li>
            <li><strong>Шаг 10:</strong> При необходимости создайте «Выписку из протокола»</li>
          </ol>
          <p className="mt-2 text-xs text-gray-500 dark:text-gray-500">Документооборот: Черновик → На согласовании → Утверждено</p>
        </div>
      </details>

      {/* Модальное окно: выбрать повестку для создания протокола */}
      <Modal
        isOpen={showProtocolFromAgendaModal}
        onClose={() => setShowProtocolFromAgendaModal(false)}
        className="max-w-2xl w-full"
      >
        <div className="p-6">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Новый протокол</h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Выберите заседание с уже сформированной повесткой, для которого нужно создать протокол.
          </p>
          {(() => {
            const withAgendaNoProtocol = meetings.filter(m => m.agendaDocument && !m.protocolDocument);
            if (withAgendaNoProtocol.length === 0) {
              return (
                <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
                  Нет заседаний с повесткой без протокола. Сначала создайте заседание и сформируйте повестку дня.
                </p>
              );
            }
            return (
              <ul className="mt-4 space-y-2 max-h-[60vh] overflow-y-auto">
                {withAgendaNoProtocol.map((m) => (
                  <li key={m.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setShowProtocolFromAgendaModal(false);
                        router.push(`/dashboard/documents/meetings/${m.id}?tab=protocol`);
                      }}
                      className="w-full rounded-lg border border-gray-200 bg-white px-4 py-3 text-left transition-colors hover:border-blue-300 hover:bg-blue-50 dark:border-gray-700 dark:bg-gray-800 dark:hover:border-blue-700 dark:hover:bg-blue-950/30"
                    >
                      <span className="font-medium text-gray-900 dark:text-white">
                        {MEETING_TYPE_LABELS[m.type] || m.type} №{m.number}
                      </span>
                      {m.title && m.title !== `Заседание профкома №${m.number}` && (
                        <span className="ml-2 text-gray-500 dark:text-gray-400">· {m.title}</span>
                      )}
                      <span className="mt-1 block text-xs text-gray-500 dark:text-gray-400">
                        Повестка: {m.agendaDocument?.regNumber ?? "—"} · {new Date(m.scheduledDate).toLocaleDateString("ru-RU")}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            );
          })()}
        </div>
      </Modal>

      {/* Модальное окно создания заседания */}
      <Modal
        isOpen={showCreateForm}
        onClose={resetFormAndClose}
        className="max-w-2xl w-full sm:max-w-3xl"
      >
        <div className="flex flex-col max-h-[85vh] min-h-0">
          {postCreateStep === "choose" ? (
            <>
              <div className="p-6">
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Заседание создано</h2>
                <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                  Сформировать документ «Повестка дня» сейчас или сохранить как черновик и сделать это позже?
                </p>
                <div className="mt-6 flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={handleGenerateAgenda}
                    className="rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
                  >
                    Сформировать повестку дня
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      alertSuccess("Сохранено как черновик");
                      loadMeetings();
                      resetFormAndClose();
                    }}
                    className="rounded-lg border border-gray-300 px-4 py-2 hover:bg-gray-50 dark:border-gray-600 dark:hover:bg-gray-700"
                  >
                    Сохранить как черновик
                  </button>
                </div>
              </div>
            </>
          ) : postCreateStep === "generating" ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" aria-hidden />
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Формирование повестки дня…</p>
            </div>
          ) : (
            <>
          <div className="flex-1 min-h-0 overflow-y-auto p-6">
          <h2 className="mb-4 text-xl font-semibold text-gray-900 dark:text-white">Новое заседание</h2>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label htmlFor="meeting-type" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Тип заседания
              </label>
              <select
                id="meeting-type"
                aria-label="Тип заседания"
                value={formData.type}
                onChange={(e) => setFormData(prev => ({ ...prev, type: e.target.value }))}
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 dark:border-gray-600 dark:bg-gray-700"
              >
                {Object.entries(MEETING_TYPE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="meeting-format" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Формат
              </label>
              <select
                id="meeting-format"
                aria-label="Формат заседания"
                value={formData.format}
                onChange={(e) => setFormData(prev => ({ ...prev, format: e.target.value }))}
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 dark:border-gray-600 dark:bg-gray-700"
              >
                <option value="OFFLINE">Очное</option>
                <option value="ONLINE">Онлайн</option>
                <option value="HYBRID">Смешанное</option>
              </select>
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Название/тема (опционально)
              </label>
              <input
                type="text"
                value={formData.title}
                onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 dark:border-gray-600 dark:bg-gray-700"
                placeholder="Например: Итоги квартала"
              />
            </div>

            <div>
              <label htmlFor="meeting-date" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Дата заседания *
              </label>
              <input
                id="meeting-date"
                type="date"
                aria-label="Дата заседания"
                value={formData.scheduledDate}
                onChange={(e) => setFormData(prev => ({ ...prev, scheduledDate: e.target.value }))}
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 dark:border-gray-600 dark:bg-gray-700"
              />
            </div>

            <div>
              <label htmlFor="meeting-time" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Время начала
              </label>
              <input
                id="meeting-time"
                type="time"
                aria-label="Время начала заседания"
                value={formData.scheduledTime}
                onChange={(e) => setFormData(prev => ({ ...prev, scheduledTime: e.target.value }))}
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 dark:border-gray-600 dark:bg-gray-700"
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Место проведения
              </label>
              <input
                type="text"
                value={formData.location}
                onChange={(e) => setFormData(prev => ({ ...prev, location: e.target.value }))}
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 dark:border-gray-600 dark:bg-gray-700"
                placeholder="Например: Кабинет профкома, офис 305"
              />
            </div>

            {(formData.format === "ONLINE" || formData.format === "HYBRID") && (
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Ссылка для онлайн-участия
                </label>
                <input
                  type="url"
                  value={formData.onlineLink}
                  onChange={(e) => setFormData(prev => ({ ...prev, onlineLink: e.target.value }))}
                  className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 dark:border-gray-600 dark:bg-gray-700"
                  placeholder="https://meet.google.com/..."
                />
              </div>
            )}
          </div>

          {/* Состав заседания: минимум 3 человека — председатель, зам. председателя, член профкома */}
          <div className="mt-6 rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800/50">
            <h3 className="mb-4 font-semibold text-gray-900 dark:text-white flex items-center gap-2">
              <svg className="h-5 w-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              Состав заседания (минимум 3 человека)
            </h3>

            <div className="space-y-4">
              {/* Председатель — автоматически */}
              <div className="flex items-center gap-2 p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                <span className="text-xs font-medium text-blue-800 dark:text-blue-300 px-2 py-0.5 bg-blue-200 dark:bg-blue-800 rounded">
                  Председатель
                </span>
                <span className="text-sm text-gray-700 dark:text-gray-300">
                  {session?.user?.name || "Вы"} (автоматически)
                </span>
              </div>

              {/* Зам. председателя — автоматически все по роли из Управления сотрудниками */}
              <div className="relative">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Зам. председателя
                </label>
                {loadingElectedBody ? (
                  <p className="text-sm text-gray-500">Загрузка...</p>
                ) : electedBodyMembers.filter((m) => isDeputyRole(m.roleName)).length === 0 && electedBodyMembers.length > 0 ? (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-900/20">
                    <p className="text-sm text-amber-800 dark:text-amber-200">
                      Роль «Зам. председателя» не назначена. Добавьте роль и сотрудника в разделе Управление сотрудниками.
                    </p>
                    <Link href="/dashboard/staff" className="mt-2 inline-flex items-center gap-1.5 text-sm font-medium text-blue-600 dark:text-blue-400">
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                      Добавить роль
                    </Link>
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-2 mt-1">
                    {formData.participantIds
                      .filter((id) => electedBodyMembers.find((m) => m.id === id && isDeputyRole(m.roleName)))
                      .map((id) => {
                        const m = electedBodyMembers.find((e) => e.id === id);
                        return m ? (
                          <span key={id} className="inline-flex items-center rounded-md bg-gray-200 dark:bg-gray-700 px-2 py-1 text-sm">
                            {getMemberFullName(m)}
                          </span>
                        ) : null;
                      })}
                  </div>
                )}
              </div>

              {/* Члены профкома — автоматически все по роли из Управления сотрудниками */}
              <div className="relative">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Члены профкома / участники (из раздела «Управление сотрудниками»)
                </label>
                {loadingElectedBody ? (
                  <p className="text-sm text-gray-500">Загрузка...</p>
                ) : electedBodyMembers.length === 0 ? (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-900/20">
                    <p className="text-sm text-amber-800 dark:text-amber-200">
                      Нет сотрудников в разделе «Управление сотрудниками». Добавьте роли и сотрудников — оттуда подтягиваются ФИО в повестку и протокол.
                    </p>
                    <Link href="/dashboard/staff" className="mt-3 inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                      Добавить роль / сотрудника
                    </Link>
                  </div>
                ) : (
                  <>
                    <div className="flex flex-wrap gap-2">
                      {formData.participantIds
                        .filter((id) => !electedBodyMembers.find((m) => m.id === id && isDeputyRole(m.roleName)))
                        .map((id) => {
                          const m = electedBodyMembers.find((e) => e.id === id);
                          return m ? (
                            <span key={id} className="inline-flex items-center rounded-md bg-gray-200 dark:bg-gray-700 px-2 py-1 text-sm">
                              {getMemberFullName(m)}
                            </span>
                          ) : null;
                        })}
                    </div>
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                      Выбрано: {formData.participantIds.length} участников (вместе с председателем — {formData.participantIds.length + 1})
                    </p>
                  </>
                )}
              </div>

              {/* Приглашённые / внешние — любой член профсоюза организации, кроме состава выборного органа */}
              <div ref={externalInviteDropdownRef} className="relative">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Приглашённые / внешние участники (члены профсоюза, не из состава выборного органа)
                </label>
                <div className="space-y-2">
                  {formData.externalParticipants.map((p, index) => (
                    <div key={index} className="flex gap-2">
                      <input type="text" value={p.name} onChange={(e) => updateExternalParticipant(index, "name", e.target.value)} className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700" placeholder="ФИО" />
                      <input type="text" value={p.position} onChange={(e) => updateExternalParticipant(index, "position", e.target.value)} className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700" placeholder="Должность" />
                      <button type="button" onClick={() => removeExternalParticipant(index)} className="text-red-500 hover:text-red-700 p-2" aria-label="Удалить внешнего участника">
                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                      </button>
                    </div>
                  ))}
                </div>
                <div className="relative mt-2">
                  <button type="button" onClick={() => setExternalInviteDropdownOpen((v) => !v)} className="inline-flex items-center gap-1 rounded-md border border-gray-300 bg-white px-2 py-1 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white">
                    + Добавить внешнего участника
                  </button>
                  {externalInviteDropdownOpen && (
                    <div className="absolute z-10 left-0 mt-1 max-h-56 w-72 overflow-y-auto rounded-lg border border-gray-200 bg-white py-1 shadow-lg dark:border-gray-600 dark:bg-gray-800">
                      {members
                        .filter((m) => !electedBodyMembers.some((e) => e.id === m.id) && !formData.externalParticipants.some((p) => p.userId === m.id))
                        .map((member) => (
                          <button key={member.id} type="button" className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-gray-50 dark:hover:bg-gray-700" onClick={() => { setFormData((p) => ({ ...p, externalParticipants: [...p.externalParticipants, { name: getMemberFullName(member), position: member.jobTitle || "", userId: member.id }] })); setExternalInviteDropdownOpen(false); }}>
                            <div className="min-w-0 flex-1">
                              <div className="font-medium text-gray-900 dark:text-white truncate">{getMemberFullName(member)}</div>
                              {member.jobTitle && <div className="text-xs text-gray-500 dark:text-gray-400 truncate">{member.jobTitle}</div>}
                            </div>
                          </button>
                        ))}
                      {members.filter((m) => !electedBodyMembers.some((e) => e.id === m.id) && !formData.externalParticipants.some((p) => p.userId === m.id)).length === 0 && (
                        <p className="px-3 py-2 text-xs text-gray-500">Нет членов профсоюза для приглашения (кроме состава выборного органа) или все уже добавлены</p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Пункты повестки */}
          <div className="mt-6">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Пункты повестки дня *
            </label>
            <div className="space-y-4">
              {formData.agendaItems.map((item, index) => (
                <div key={index} className="rounded-lg border border-gray-200 p-4 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                  <div className="flex items-start gap-3">
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-600 text-sm font-bold text-white flex-shrink-0">
                      {index + 1}
                    </span>
                    <div className="flex-1 space-y-3">
                      {/* Название вопроса */}
                      <div>
                        <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                          Слушали (тема вопроса) *
                        </label>
                        <input
                          type="text"
                          value={item.title}
                          onChange={(e) => updateAgendaItem(index, "title", e.target.value)}
                          className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700"
                          placeholder="О чём будет обсуждение..."
                        />
                      </div>
                      
                      {/* Докладывает — только члены выборного органа (председатель, замы, члены профкома), без приглашённых */}
                      <div>
                        <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                          Докладывает *
                        </label>
                        <select
                          aria-label={`Докладывает по вопросу ${index + 1}`}
                          value={item.speakerId ? `user:${item.speakerId}` : ""}
                          onChange={(e) => setSpeakerFromSelect(index, e.target.value)}
                          className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700"
                        >
                          <option value="">Выберите докладчика...</option>
                          {electedBodyMembers.length > 0 && (
                            <optgroup label="Члены выборного органа (председатель, замы, члены профкома)">
                              {electedBodyMembers.map(m => (
                                <option key={m.id} value={`user:${m.id}`}>
                                  {getMemberFullName(m)}{m.jobTitle || m.roleName ? ` (${m.jobTitle || m.roleName})` : ""}
                                </option>
                              ))}
                            </optgroup>
                          )}
                        </select>
                        {(item.speakerPosition || (item.speakerId && electedBodyMembers.find(m => m.id === item.speakerId)?.jobTitle)) && (
                          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                            Должность в PDF: {item.speakerPosition || electedBodyMembers.find(m => m.id === item.speakerId)?.jobTitle || electedBodyMembers.find(m => m.id === item.speakerId)?.roleName || ""}
                          </p>
                        )}
                      </div>
                      {/* Со-докладчики — члены выборного органа или приглашённые, можно несколько (Добавить ещё) */}
                      <div ref={coSpeakerDropdownIndex === index ? coSpeakerDropdownRef : undefined} className="relative">
                        <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                          Со-докладчики (опционально)
                        </label>
                        <div className="flex flex-wrap gap-2">
                          {((item as AgendaItemForm).coSpeakers ?? []).map((c, cIdx) => (
                            <span key={cIdx} className="inline-flex items-center gap-1 rounded-md bg-gray-200 dark:bg-gray-700 px-2 py-1 text-sm">
                              {c.name}{c.position ? ` (${c.position})` : ""}
                              <button type="button" onClick={() => removeCoSpeaker(index, cIdx)} className="text-gray-500 hover:text-red-600" aria-label="Убрать со-докладчика">×</button>
                            </span>
                          ))}
                          <button
                            type="button"
                            onClick={() => setCoSpeakerDropdownIndex(coSpeakerDropdownIndex === index ? null : index)}
                            className="inline-flex items-center gap-1 rounded-md border border-gray-300 bg-white px-2 py-1 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                          >
                            + Добавить ещё
                          </button>
                        </div>
                        {coSpeakerDropdownIndex === index && (
                          <div className="absolute z-10 left-0 mt-1 max-h-56 w-72 overflow-y-auto rounded-lg border border-gray-200 bg-white py-1 shadow-lg dark:border-gray-600 dark:bg-gray-800">
                            {electedBodyMembers.length > 0 && (
                              <>
                                <div className="px-3 py-1.5 text-xs font-medium text-gray-500 dark:text-gray-400 border-b border-gray-100 dark:border-gray-700">Члены выборного органа</div>
                                {electedBodyMembers.map(m => {
                                  const coSpeakers = (item as AgendaItemForm).coSpeakers ?? [];
                                  const added = coSpeakers.some(c => c.userId === m.id);
                                  return (
                                    <button
                                      key={m.id}
                                      type="button"
                                      disabled={added}
                                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50"
                                      onClick={() => addCoSpeaker(index, { userId: m.id, name: getMemberFullName(m), position: m.jobTitle || m.roleName })}
                                    >
                                      {getMemberFullName(m)}{m.jobTitle || m.roleName ? ` (${m.jobTitle || m.roleName})` : ""}
                                    </button>
                                  );
                                })}
                              </>
                            )}
                            {formData.externalParticipants.some(p => p.name.trim()) && (
                              <>
                                <div className="border-t border-gray-200 dark:border-gray-600 px-2 py-1 text-xs font-medium text-gray-500 dark:text-gray-400">Приглашённые / внешние</div>
                                {formData.externalParticipants.map((ext, idx) => {
                                  if (!ext.name.trim()) return null;
                                  const coSpeakers = (item as AgendaItemForm).coSpeakers ?? [];
                                  const added = coSpeakers.some(c => c.extIndex === idx);
                                  return (
                                    <button
                                      key={idx}
                                      type="button"
                                      disabled={added}
                                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50"
                                      onClick={() => addCoSpeaker(index, { extIndex: idx, name: ext.name.trim(), position: ext.position?.trim() })}
                                    >
                                      {ext.name.trim()}{ext.position?.trim() ? ` (${ext.position.trim()})` : ""}
                                    </button>
                                  );
                                })}
                              </>
                            )}
                            {electedBodyMembers.length === 0 && !formData.externalParticipants.some(p => p.name.trim()) && (
                              <p className="px-3 py-2 text-xs text-gray-500">Добавьте участников в состав заседания или приглашённых</p>
                            )}
                          </div>
                        )}
                      </div>
                      
                      {/* Описание / материалы */}
                      <div>
                        <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                          Описание / материалы (опционально)
                        </label>
                        <textarea
                          value={item.description}
                          onChange={(e) => updateAgendaItem(index, "description", e.target.value)}
                          rows={2}
                          className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700"
                          placeholder="Дополнительная информация по вопросу..."
                        />
                        <div className="mt-2">
                          <input
                            type="file"
                            id={`agenda-file-${index}`}
                            className="hidden"
                            aria-label={`Прикрепить файл к вопросу ${index + 1}`}
                            accept=".pdf,.doc,.docx,.xls,.xlsx,.txt,.md,.csv,.ppt,.pptx,.odt,.ods,.odp,.rtf,.jpg,.jpeg,.png,.zip"
                            onChange={async (e) => {
                              const file = e.target.files?.[0];
                              const input = e.target as HTMLInputElement;
                              if (!file) return;
                              setUploadingAgendaIndex(index);
                              try {
                                const fd = new FormData();
                                fd.append("file", file);
                                const res = await fetch("/api/ppo-head/meetings/agenda-attachment", { method: "POST", body: fd });
                                if (!res.ok) {
                                  const err = await res.json().catch(() => ({}));
                                  throw new Error(err.error || "Ошибка загрузки");
                                }
                                const data = await res.json();
                                const list = (item.attachments || []).concat([{ name: data.name, url: data.url, size: data.size }]);
                                updateAgendaItem(index, "attachments", list);
                              } catch (err) {
                                alertError(err instanceof Error ? err.message : "Не удалось загрузить файл");
                              } finally {
                                setUploadingAgendaIndex(null);
                                if (input) input.value = "";
                              }
                            }}
                          />
                          <button
                            type="button"
                            onClick={() => document.getElementById(`agenda-file-${index}`)?.click()}
                            disabled={uploadingAgendaIndex === index}
                            className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-700 shadow-sm hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600"
                          >
                            {uploadingAgendaIndex === index ? (
                              <>Загрузка...</>
                            ) : (
                              <>
                                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                                </svg>
                                Прикрепить файл
                              </>
                            )}
                          </button>
                          {(item.attachments?.length ?? 0) > 0 && (
                            <ul className="mt-1.5 space-y-1">
                              {(item.attachments || []).map((att, i) => (
                                <li key={i} className="flex items-center gap-2 text-sm">
                                  <a href={att.url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline dark:text-blue-400 truncate max-w-[200px]" title={att.name}>
                                    {att.name}
                                  </a>
                                  <button
                                    type="button"
                                    onClick={() => updateAgendaItem(index, "attachments", (item.attachments || []).filter((_, j) => j !== i))}
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
                    </div>
                    
                    {formData.agendaItems.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeAgendaItem(index)}
                        className="text-red-500 hover:text-red-700 p-1"
                        title="Удалить вопрос"
                      >
                        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={addAgendaItem}
              className="mt-3 flex items-center gap-1 text-sm font-medium text-blue-600 hover:text-blue-800 dark:text-blue-400"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Добавить вопрос в повестку
            </button>
          </div>

          </div>
          <div className="shrink-0 border-t border-gray-200 bg-gray-50 px-6 py-4 dark:border-gray-700 dark:bg-gray-800/80">
            <div className="flex flex-wrap gap-2">
              <button
                onClick={handleCreateMeeting}
                disabled={isCreating}
                className="rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {isCreating ? "Создание..." : "Создать документ"}
              </button>
              <button
                onClick={resetFormAndClose}
                className="rounded-lg border border-gray-300 px-4 py-2 hover:bg-gray-50 dark:border-gray-600 dark:hover:bg-gray-700"
              >
                Отмена
              </button>
            </div>
          </div>
            </>
          )}
        </div>
      </Modal>

      {/* Список заседаний */}
      {(() => {
        // Фильтрация по активному табу
        // «Повестки заседания»: заседания с уже сформированной повесткой или с пунктами повестки (черновики)
        const filteredMeetings = activeTab === "all" ? meetings :
          activeTab === "agenda" ? meetings.filter(m => m.agendaDocument || (m._count?.agendaItems ?? 0) > 0) :
          activeTab === "protocol" ? meetings.filter(m => m.protocolDocument) :
          activeTab === "resolutions" ? meetings.filter(m => (m._count?.resolutions || 0) > 0) :
          activeTab === "extracts" ? meetings.filter(m => (m._count?.extracts || 0) > 0) :
          meetings;

        if (filteredMeetings.length === 0 && !showCreateForm) {
          return (
            <div className="rounded-lg border-2 border-dashed border-gray-300 bg-white p-8 text-center dark:border-gray-700 dark:bg-gray-800">
              <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <h3 className="mt-2 text-sm font-medium text-gray-900 dark:text-white">Нет документов</h3>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                {activeTab === "all" ? "Начните с создания нового документа" :
                 activeTab === "agenda" ? "Нет документов с повестками заседания" :
                 activeTab === "protocol" ? "Нет документов с протоколами" :
                 activeTab === "resolutions" ? "Нет документов с постановлениями" :
                 "Нет документов с выписками"}
              </p>
              {activeTab === "all" && (
                <button
                  onClick={() => setShowCreateForm(true)}
                  className="mt-4 rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
                >
                  Новый документ
                </button>
              )}
            </div>
          );
        }

        const STEPS = [
          { key: "draft", label: "Черновик" },
          { key: "agenda", label: "Повестка" },
          { key: "protocol", label: "Протокол" },
          { key: "resolutions", label: "Постановления" },
          { key: "extracts", label: "Выписка" },
        ] as const;
        const getStepStatus = (meeting: Meeting, step: (typeof STEPS)[number]["key"]) => {
          switch (step) {
            case "draft": return "done";
            case "agenda": return meeting.agendaDocument ? "done" : "current";
            case "protocol": return meeting.protocolDocument ? "done" : (meeting.agendaDocument ? "current" : "pending");
            case "resolutions": return (meeting._count?.resolutions ?? 0) > 0 ? "done" : (meeting.protocolDocument ? "current" : "pending");
            case "extracts": return (meeting._count?.extracts ?? 0) > 0 ? "done" : ((meeting._count?.resolutions ?? 0) > 0 ? "current" : "pending");
            default: return "pending";
          }
        };

        return (
          <div className="space-y-3">
            {filteredMeetings.map((meeting) => (
              <article
                key={meeting.id}
                className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm transition-shadow hover:shadow dark:border-gray-700 dark:bg-gray-800 dark:hover:shadow-none"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <Link
                    href={`/dashboard/documents/meetings/${meeting.id}`}
                    className="group min-w-0 flex-1 rounded-lg -m-1 p-1 transition-colors hover:bg-gray-50 dark:hover:bg-gray-700/50"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-base font-semibold text-gray-900 transition-colors group-hover:text-blue-600 dark:text-white dark:group-hover:text-blue-400">
                        {MEETING_TYPE_LABELS[meeting.type] || meeting.type} №{meeting.number}
                      </h3>
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${MEETING_STATUS_COLORS[meeting.status]}`}>
                        {MEETING_STATUS_LABELS[meeting.status]}
                      </span>
                      <span className="text-sm text-gray-500 dark:text-gray-400">
                        {new Date(meeting.scheduledDate).toLocaleDateString("ru-RU", { day: "numeric", month: "short", year: "numeric" })}
                        {meeting.scheduledTime && ` · ${meeting.scheduledTime}`}
                      </span>
                    </div>
                    {meeting.title && meeting.title !== `Заседание профкома №${meeting.number}` && (
                      <p className="mt-0.5 text-sm text-gray-600 dark:text-gray-400">{meeting.title}</p>
                    )}
                    {/* Степпер */}
                    <div className="mt-3 flex flex-wrap items-center gap-1 sm:gap-0" role="list" aria-label="Этапы документа">
                      {STEPS.map((step, i) => {
                        const status = getStepStatus(meeting, step.key);
                        return (
                          <div key={step.key} className="flex items-center" role="listitem">
                            {i > 0 && (
                              <span className={`mx-0.5 h-px w-2 sm:w-4 ${status === "pending" ? "bg-gray-200 dark:bg-gray-600" : "bg-blue-400 dark:bg-blue-500"}`} aria-hidden />
                            )}
                            <span
                              className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                                status === "done"
                                  ? "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300"
                                  : status === "current"
                                    ? "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300"
                                    : "bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400"
                              }`}
                            >
                              {step.label}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </Link>
                  {(() => {
                    const pdfUrl = meeting.protocolDocument?.filePath || meeting.agendaDocument?.filePath || null;
                    const primaryLabel = pdfUrl
                      ? "Открыть PDF"
                      : meeting.agendaDocument
                        ? "Сформировать протокол"
                        : "Сформировать повестку";
                    const primaryTitle = primaryLabel;
                    return (
                      <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
                        {pdfUrl ? (
                          <a
                            href={pdfUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-blue-600 p-2 text-white hover:bg-blue-700 sm:px-3 sm:py-1.5 sm:pr-2"
                            title={primaryTitle}
                          >
                            <svg className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                            </svg>
                            <span className="hidden sm:inline">{primaryLabel}</span>
                          </a>
                        ) : (
                          <Link
                            href={`/dashboard/documents/meetings/${meeting.id}`}
                            className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-blue-600 p-2 text-white hover:bg-blue-700 sm:px-3 sm:py-1.5 sm:pr-2"
                            title={primaryTitle}
                          >
                            <svg className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                            <span className="hidden sm:inline">{primaryLabel}</span>
                          </Link>
                        )}
                        <button
                          type="button"
                          onClick={async () => {
                            const ok = await confirm(
                              "Удалить это заседание? Действие нельзя отменить.",
                              "Удаление заседания"
                            );
                            if (!ok) return;
                            setDeletingMeetingId(meeting.id);
                            try {
                              const res = await fetch(`/api/ppo-head/meetings/${meeting.id}`, { method: "DELETE" });
                              if (!res.ok) {
                                const err = await res.json().catch(() => ({}));
                                throw new Error(err.error || "Ошибка удаления");
                              }
                              alertSuccess("Заседание удалено");
                              setMeetings((prev) => prev.filter((m) => m.id !== meeting.id));
                            } catch (e) {
                              alertError(e instanceof Error ? e.message : "Не удалось удалить заседание");
                            } finally {
                              setDeletingMeetingId(null);
                            }
                          }}
                          disabled={deletingMeetingId === meeting.id}
                          className="inline-flex items-center justify-center rounded-lg border border-gray-300 p-2 text-gray-500 hover:bg-gray-100 hover:text-red-600 disabled:opacity-50 dark:border-gray-600 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-red-400 sm:p-1.5"
                          title="Удалить заседание"
                        >
                          {deletingMeetingId === meeting.id ? (
                            <span className="text-xs">…</span>
                          ) : (
                            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          )}
                        </button>
                      </div>
                    );
                  })()}
                </div>
              </article>
            ))}
          </div>
        );
      })()}
    </div>
  );
}
