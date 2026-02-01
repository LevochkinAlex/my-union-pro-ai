"use client";

import { useState, useEffect, useRef } from "react";
import { useSession } from "next-auth/react";
import { useSearchParams } from "next/navigation";
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
    // Участники: члены выборного органа (секретарь избирается на шаге протокола)
    participantIds: [] as string[],
    externalParticipants: [] as Array<{ name: string; position: string }>,
    // Пункты повестки
    agendaItems: [{ title: "", description: "", speakerId: "", speakerName: "", speakerPosition: "", coSpeakerId: "", coSpeakerName: "", attachments: [] as Array<{ name: string; url: string; size?: number }> }],
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
  const participantsDropdownRef = useRef<HTMLDivElement>(null);
  // Все члены профсоюза (для докладчика и приглашённых)
  const [members, setMembers] = useState<Array<{
    id: string;
    firstName: string | null;
    lastName: string | null;
    middleName: string | null;
    jobTitle: string | null;
  }>>([]);
  const [loadingMembers, setLoadingMembers] = useState(false);

  useEffect(() => {
    loadMeetings();
  }, []);

  useEffect(() => {
    if (showCreateForm) {
      loadElectedBodyMembers();
      if (members.length === 0) loadMembers();
    }
  }, [showCreateForm]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (participantsDropdownRef.current && !participantsDropdownRef.current.contains(e.target as Node)) {
        setParticipantsDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
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

  const getMemberFullName = (member: any) => {
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
          externalParticipants: formData.externalParticipants.filter(p => p.name.trim()),
          agendaItems: validAgendaItems.map(item => ({
            title: item.title.trim(),
            description: item.description?.trim() || null,
            speakerId: item.speakerId || null,
            speakerName: item.speakerName?.trim() || null,
            speakerPosition: item.speakerPosition?.trim() || null,
            coSpeakerId: item.coSpeakerId || null,
            coSpeakerName: item.coSpeakerName?.trim() || null,
            attachments: item.attachments?.length ? item.attachments : undefined,
          })),
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        const errorMessage = errorData.error || "Ошибка создания";
        const errorDetails = errorData.details ? `\n\nДетали: ${errorData.details}` : "";
        throw new Error(errorMessage + errorDetails);
      }

      alertSuccess("Документ создан!");
      setShowCreateForm(false);
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
        agendaItems: [{ title: "", description: "", speakerId: "", speakerName: "", speakerPosition: "", coSpeakerId: "", coSpeakerName: "", attachments: [] }],
      });
      loadMeetings();
    } catch (error) {
      alertError(error instanceof Error ? error.message : "Не удалось создать заседание");
    } finally {
      setIsCreating(false);
    }
  };

  const addAgendaItem = () => {
    setFormData(prev => ({
      ...prev,
      agendaItems: [...prev.agendaItems, { title: "", description: "", speakerId: "", speakerName: "", speakerPosition: "", coSpeakerId: "", coSpeakerName: "", attachments: [] }],
    }));
  };

  const removeAgendaItem = (index: number) => {
    setFormData(prev => ({
      ...prev,
      agendaItems: prev.agendaItems.filter((_, i) => i !== index),
    }));
  };

  type AgendaItemForm = { title: string; description: string; speakerId: string; speakerName: string; speakerPosition: string; coSpeakerId: string; coSpeakerName: string; attachments: Array<{ name: string; url: string; size?: number }> };
  const updateAgendaItem = (index: number, field: "title" | "description" | "speakerId" | "speakerName" | "speakerPosition" | "coSpeakerId" | "coSpeakerName" | "attachments", value: string | Array<{ name: string; url: string; size?: number }>) => {
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
        if (field === "coSpeakerId" && typeof value === "string") {
          const member = electedBodyMembers.find(m => m.id === value);
          return { ...item, coSpeakerId: value, coSpeakerName: member ? getMemberFullName(member) : "" };
        }
        if (field === "coSpeakerName" && typeof value === "string") return { ...item, coSpeakerName: value, coSpeakerId: "" };
        if (field === "attachments") return { ...item, attachments: value as Array<{ name: string; url: string; size?: number }> };
        if (field === "title" || field === "description") return { ...item, [field]: value as string };
        return item as AgendaItemForm;
      }),
    }));
  };

  /** Выбор докладчика/со-докладчика: член профкома (user:id) или приглашённый (ext:index) */
  const setSpeakerFromSelect = (index: number, value: string) => {
    if (!value) {
      updateAgendaItem(index, "speakerId", "");
      updateAgendaItem(index, "speakerName", "");
      updateAgendaItem(index, "speakerPosition", "");
      return;
    }
    if (value.startsWith("user:")) {
      const id = value.slice(5);
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
      return;
    }
    if (value.startsWith("ext:")) {
      const idx = parseInt(value.slice(4), 10);
      const ext = formData.externalParticipants[idx];
      if (ext) {
        setFormData(prev => ({
          ...prev,
          agendaItems: prev.agendaItems.map((item, i) =>
            i !== index ? item : {
              ...item,
              speakerId: "",
              speakerName: ext.name.trim(),
              speakerPosition: ext.position?.trim() || "",
            }
          ),
        }));
      }
    }
  };

  const setCoSpeakerFromSelect = (index: number, value: string) => {
    if (!value) {
      updateAgendaItem(index, "coSpeakerId", "");
      updateAgendaItem(index, "coSpeakerName", "");
      return;
    }
    if (value.startsWith("user:")) {
      const id = value.slice(5);
      const member = electedBodyMembers.find(m => m.id === id);
      if (member) {
        setFormData(prev => ({
          ...prev,
          agendaItems: prev.agendaItems.map((item, i) =>
            i !== index ? item : { ...item, coSpeakerId: id, coSpeakerName: getMemberFullName(member) }
          ),
        }));
      }
      return;
    }
    if (value.startsWith("ext:")) {
      const idx = parseInt(value.slice(4), 10);
      const ext = formData.externalParticipants[idx];
      if (ext) {
        setFormData(prev => ({
          ...prev,
          agendaItems: prev.agendaItems.map((item, i) =>
            i !== index ? item : { ...item, coSpeakerId: "", coSpeakerName: ext.name.trim() }
          ),
        }));
      }
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
        <button
          onClick={() => setShowCreateForm(true)}
          className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
        >
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Новый документ
        </button>
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
            {meetings.filter(m => m.agendaDocument).length > 0 && (
              <span className="ml-2 rounded-full bg-blue-100 px-2 py-0.5 text-xs text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                {meetings.filter(m => m.agendaDocument).length}
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

      {/* Модальное окно создания заседания */}
      <Modal
        isOpen={showCreateForm}
        onClose={() => {
          setShowCreateForm(false);
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
            agendaItems: [{ title: "", description: "", speakerId: "", speakerName: "", speakerPosition: "", coSpeakerId: "", coSpeakerName: "", attachments: [] }],
          });
        }}
        className="max-w-4xl w-full"
      >
        <div className="p-6 max-h-[90vh] overflow-y-auto">
          <h2 className="mb-4 text-xl font-semibold text-gray-900 dark:text-white">Новое заседание</h2>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Тип заседания
              </label>
              <select
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
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Формат
              </label>
              <select
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
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Дата заседания *
              </label>
              <input
                type="date"
                value={formData.scheduledDate}
                onChange={(e) => setFormData(prev => ({ ...prev, scheduledDate: e.target.value }))}
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 dark:border-gray-600 dark:bg-gray-700"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Время начала
              </label>
              <input
                type="time"
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

          {/* Участники заседания */}
          <div className="mt-6 rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800/50">
            <h3 className="mb-4 font-semibold text-gray-900 dark:text-white flex items-center gap-2">
              <svg className="h-5 w-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              Состав заседания
            </h3>
            
            <div className="space-y-4">
              {/* Информация о председателе */}
              <div className="flex items-center gap-2 p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                <span className="text-xs font-medium text-blue-800 dark:text-blue-300 px-2 py-0.5 bg-blue-200 dark:bg-blue-800 rounded">
                  Председатель
                </span>
                <span className="text-sm text-gray-700 dark:text-gray-300">
                  {session?.user?.name || "Вы"} (автоматически)
                </span>
              </div>

              {/* Сотрудники = члены выборного органа (раздел Управление сотрудниками). ФИО отсюда попадают в повестку и протокол. */}
              <div ref={participantsDropdownRef} className="relative">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Члены профкома / участники (сотрудники из раздела «Управление сотрудниками»)
                </label>
                {loadingElectedBody ? (
                  <p className="text-sm text-gray-500">Загрузка...</p>
                ) : electedBodyMembers.length === 0 ? (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-900/20">
                    <p className="text-sm text-amber-800 dark:text-amber-200">
                      Нет сотрудников в разделе «Управление сотрудниками». Добавьте сотрудников или роли в разделе Управление сотрудниками — оттуда подтягиваются ФИО в повестку и протокол.
                    </p>
                    <Link
                      href="/dashboard/staff"
                      className="mt-3 inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
                    >
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                      </svg>
                      Добавить роль / сотрудника
                    </Link>
                  </div>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => setParticipantsDropdownOpen((v) => !v)}
                      className="flex w-full items-center justify-between rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-left text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                    >
                      <span className={formData.participantIds.length === 0 ? "text-gray-500 dark:text-gray-400" : ""}>
                        {formData.participantIds.length === 0
                          ? "Выберите участников"
                          : `Выбрано: ${formData.participantIds.length} участников`}
                      </span>
                      <svg
                        className={`h-5 w-5 flex-shrink-0 text-gray-400 transition-transform ${participantsDropdownOpen ? "rotate-180" : ""}`}
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>
                    {participantsDropdownOpen && (
                      <div className="absolute z-10 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border border-gray-200 bg-white py-1 shadow-lg dark:border-gray-600 dark:bg-gray-800">
                        {electedBodyMembers.map((member) => (
                          <label
                            key={member.id}
                            className="flex cursor-pointer items-center gap-2 px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-700"
                          >
                            <input
                              type="checkbox"
                              checked={formData.participantIds.includes(member.id)}
                              onChange={() => {
                                setFormData((prev) => ({
                                  ...prev,
                                  participantIds: prev.participantIds.includes(member.id)
                                    ? prev.participantIds.filter((id) => id !== member.id)
                                    : [...prev.participantIds, member.id],
                                }));
                              }}
                              className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                            />
                            <div className="min-w-0 flex-1">
                              <div className="text-sm font-medium text-gray-900 dark:text-white truncate">
                                {getMemberFullName(member)}
                              </div>
                              <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
                                {member.roleName}
                                {member.jobTitle ? ` · ${member.jobTitle}` : ""}
                              </div>
                            </div>
                          </label>
                        ))}
                      </div>
                    )}
                    <div className="mt-2 flex items-center gap-3">
                      <Link
                        href="/dashboard/staff"
                        className="inline-flex items-center gap-1.5 text-sm font-medium text-blue-600 hover:text-blue-800 dark:text-blue-400"
                      >
                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                        </svg>
                        Добавить роль
                      </Link>
                      {formData.participantIds.length > 0 && (
                        <span className="text-xs text-green-600 dark:text-green-400">
                          Выбрано: {formData.participantIds.length} участников
                        </span>
                      )}
                    </div>
                  </>
                )}
              </div>

              {/* Внешние участники */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Приглашённые / внешние участники
                </label>
                <div className="space-y-2">
                  {formData.externalParticipants.map((p, index) => (
                    <div key={index} className="flex gap-2">
                      <input
                        type="text"
                        value={p.name}
                        onChange={(e) => updateExternalParticipant(index, "name", e.target.value)}
                        className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700"
                        placeholder="ФИО"
                      />
                      <input
                        type="text"
                        value={p.position}
                        onChange={(e) => updateExternalParticipant(index, "position", e.target.value)}
                        className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700"
                        placeholder="Должность"
                      />
                      <button
                        type="button"
                        onClick={() => removeExternalParticipant(index)}
                        className="text-red-500 hover:text-red-700 p-2"
                      >
                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={addExternalParticipant}
                  className="mt-2 text-sm text-blue-600 hover:text-blue-800 dark:text-blue-400"
                >
                  + Добавить внешнего участника
                </button>
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
                      
                      {/* Докладывает — члены профкома или приглашённые (выводятся в PDF в блоке ДОКЛАДЧИК) */}
                      <div>
                        <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                          Докладывает *
                        </label>
                        <div className="grid gap-2 sm:grid-cols-2">
                          <select
                            value={item.speakerId ? `user:${item.speakerId}` : (() => {
                              const idx = formData.externalParticipants.findIndex(ext => ext.name.trim() === (item.speakerName || "").trim());
                              return idx >= 0 ? `ext:${idx}` : "";
                            })()}
                            onChange={(e) => setSpeakerFromSelect(index, e.target.value)}
                            className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700"
                          >
                            <option value="">Выберите докладчика...</option>
                            {electedBodyMembers.length > 0 && (
                              <optgroup label="Члены профкома / участники">
                                {electedBodyMembers.map(m => (
                                  <option key={m.id} value={`user:${m.id}`}>
                                    {getMemberFullName(m)}{m.jobTitle || m.roleName ? ` (${m.jobTitle || m.roleName})` : ""}
                                  </option>
                                ))}
                              </optgroup>
                            )}
                            {formData.externalParticipants.some(p => p.name.trim()) && (
                              <optgroup label="Приглашённые / внешние участники">
                                {formData.externalParticipants.map((ext, idx) => ext.name.trim() ? (
                                  <option key={idx} value={`ext:${idx}`}>
                                    {ext.name.trim()}{ext.position?.trim() ? ` (${ext.position.trim()})` : ""}
                                  </option>
                                ) : null)}
                              </optgroup>
                            )}
                          </select>
                          <input
                            type="text"
                            value={item.speakerId ? "" : (formData.externalParticipants.some(ext => ext.name.trim() === (item.speakerName || "").trim()) ? "" : (item.speakerName || ""))}
                            onChange={(e) => updateAgendaItem(index, "speakerName", e.target.value)}
                            className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700"
                            placeholder="или ввести ФИО вручную"
                            disabled={!!(item.speakerId || formData.externalParticipants.some(ext => ext.name.trim() === (item.speakerName || "").trim()))}
                          />
                        </div>
                        {(item.speakerPosition || (item.speakerId && electedBodyMembers.find(m => m.id === item.speakerId)?.jobTitle)) && (
                          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                            Должность в PDF: {item.speakerPosition || electedBodyMembers.find(m => m.id === item.speakerId)?.jobTitle || electedBodyMembers.find(m => m.id === item.speakerId)?.roleName || ""}
                          </p>
                        )}
                      </div>
                      {/* Со-докладчик — члены профкома или приглашённые (опционально) */}
                      <div>
                        <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                          Со-докладчик (опционально)
                        </label>
                        <div className="grid gap-2 sm:grid-cols-2">
                          <select
                            value={item.coSpeakerId ? `user:${item.coSpeakerId}` : (() => {
                              const idx = formData.externalParticipants.findIndex(ext => ext.name.trim() === (item.coSpeakerName || "").trim());
                              return idx >= 0 ? `ext:${idx}` : "";
                            })()}
                            onChange={(e) => setCoSpeakerFromSelect(index, e.target.value)}
                            className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700"
                          >
                            <option value="">Не указан</option>
                            {electedBodyMembers.length > 0 && (
                              <optgroup label="Члены профкома / участники">
                                {electedBodyMembers.map(m => (
                                  <option key={m.id} value={`user:${m.id}`}>
                                    {getMemberFullName(m)}{m.jobTitle || m.roleName ? ` (${m.jobTitle || m.roleName})` : ""}
                                  </option>
                                ))}
                              </optgroup>
                            )}
                            {formData.externalParticipants.some(p => p.name.trim()) && (
                              <optgroup label="Приглашённые / внешние участники">
                                {formData.externalParticipants.map((ext, idx) => ext.name.trim() ? (
                                  <option key={idx} value={`ext:${idx}`}>
                                    {ext.name.trim()}{ext.position?.trim() ? ` (${ext.position.trim()})` : ""}
                                  </option>
                                ) : null)}
                              </optgroup>
                            )}
                          </select>
                          <input
                            type="text"
                            value={item.coSpeakerId ? "" : (formData.externalParticipants.some(ext => ext.name.trim() === (item.coSpeakerName || "").trim()) ? "" : (item.coSpeakerName || ""))}
                            onChange={(e) => updateAgendaItem(index, "coSpeakerName", e.target.value)}
                            className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700"
                            placeholder="или ввести ФИО вручную"
                            disabled={!!(item.coSpeakerId || formData.externalParticipants.some(ext => ext.name.trim() === (item.coSpeakerName || "").trim()))}
                          />
                        </div>
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

          <div className="mt-6 flex gap-2">
            <button
              onClick={handleCreateMeeting}
              disabled={isCreating}
              className="rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {isCreating ? "Создание..." : "Создать документ"}
            </button>
            <button
              onClick={() => setShowCreateForm(false)}
              className="rounded-lg border border-gray-300 px-4 py-2 hover:bg-gray-50 dark:border-gray-600 dark:hover:bg-gray-700"
            >
              Отмена
            </button>
          </div>
        </div>
      </Modal>

      {/* Список заседаний */}
      {(() => {
        // Фильтрация по активному табу
        const filteredMeetings = activeTab === "all" ? meetings :
          activeTab === "agenda" ? meetings.filter(m => m.agendaDocument) :
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

        return (
          <div className="space-y-3">
            {filteredMeetings.map((meeting) => (
              <article
                key={meeting.id}
                className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition-shadow hover:shadow dark:border-gray-700 dark:bg-gray-800 dark:hover:shadow-none"
              >
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-base font-semibold text-gray-900 dark:text-white">
                        {MEETING_TYPE_LABELS[meeting.type] || meeting.type} №{meeting.number}
                      </h3>
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${MEETING_STATUS_COLORS[meeting.status]}`}>
                        {MEETING_STATUS_LABELS[meeting.status]}
                      </span>
                    </div>
                    {meeting.title && meeting.title !== `Заседание профкома №${meeting.number}` && (
                      <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">{meeting.title}</p>
                    )}
                    <dl className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-500 dark:text-gray-400">
                      <span>{new Date(meeting.scheduledDate).toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" })}</span>
                      {meeting.scheduledTime && <span>{meeting.scheduledTime}</span>}
                      {meeting.location && <span className="truncate max-w-[200px] sm:max-w-none" title={meeting.location}>{meeting.location}</span>}
                      <span>{meeting._count.participants} участников</span>
                      <span>{meeting._count.agendaItems} вопросов</span>
                    </dl>
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {meeting.agendaDocument ? (
                        <span className="inline-flex items-center gap-1 rounded-md bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800 dark:bg-green-900/40 dark:text-green-300">
                          Повестка: {meeting.agendaDocument.regNumber}
                        </span>
                      ) : (
                        <span className="inline-flex items-center rounded-md bg-gray-100 px-2 py-0.5 text-xs text-gray-600 dark:bg-gray-700 dark:text-gray-400">
                          Повестка не сформирована
                        </span>
                      )}
                      {meeting.protocolDocument ? (
                        <span className="inline-flex items-center gap-1 rounded-md bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800 dark:bg-green-900/40 dark:text-green-300">
                          Протокол: {meeting.protocolDocument.regNumber}
                        </span>
                      ) : (
                        <span className="inline-flex items-center rounded-md bg-gray-100 px-2 py-0.5 text-xs text-gray-600 dark:bg-gray-700 dark:text-gray-400">
                          Протокол не сформирован
                        </span>
                      )}
                      {meeting._count.resolutions > 0 && (
                        <span className="inline-flex rounded-md bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800 dark:bg-blue-900/40 dark:text-blue-300">
                          {meeting._count.resolutions} постановлений
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2 sm:flex-col sm:items-end">
                    <Link
                      href={`/dashboard/documents/meetings/${meeting.id}`}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
                    >
                      Открыть
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </Link>
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
                      className="inline-flex items-center gap-1 rounded-lg border border-red-200 px-2.5 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-900/20"
                      title="Удалить заседание"
                    >
                      {deletingMeetingId === meeting.id ? (
                        "Удаление…"
                      ) : (
                        <>
                          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                          Удалить
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        );
      })()}
    </div>
  );
}
