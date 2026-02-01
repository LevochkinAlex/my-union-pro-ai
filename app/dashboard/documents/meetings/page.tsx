"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { alertSuccess, alertError } from "@/lib/alert";
import Link from "next/link";
import { Modal } from "@/components/ui/modal";
import PPOMemberSelect from "@/components/form/PPOMemberSelect";
import PPOMemberMultiSelect from "@/components/form/PPOMemberMultiSelect";

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

export default function MeetingsPage() {
  const { data: session } = useSession();
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [activeTab, setActiveTab] = useState<"all" | "agenda" | "protocol" | "resolutions" | "extracts">("all");
  const [isAlgorithmExpanded, setIsAlgorithmExpanded] = useState(false);

  const [formData, setFormData] = useState({
    type: "COMMITTEE",
    format: "OFFLINE",
    title: "",
    scheduledDate: "",
    scheduledTime: "",
    location: "",
    onlineLink: "",
    // Участники
    secretaryId: "",
    participantIds: [] as string[],
    externalParticipants: [] as Array<{ name: string; position: string }>,
    // Пункты повестки
    agendaItems: [{ title: "", description: "", speakerId: "", speakerName: "" }],
  });

  // Список членов для выбора докладчика
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

  // Загружаем членов при открытии формы создания
  useEffect(() => {
    if (showCreateForm && members.length === 0) {
      loadMembers();
    }
  }, [showCreateForm]);

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
          secretaryId: formData.secretaryId || null,
          participantIds: formData.participantIds,
          externalParticipants: formData.externalParticipants.filter(p => p.name.trim()),
          agendaItems: validAgendaItems.map(item => ({
            title: item.title.trim(),
            description: item.description?.trim() || null,
            speakerId: item.speakerId || null,
            speakerName: item.speakerName?.trim() || null,
          })),
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        const errorMessage = errorData.error || "Ошибка создания";
        const errorDetails = errorData.details ? `\n\nДетали: ${errorData.details}` : "";
        throw new Error(errorMessage + errorDetails);
      }

      alertSuccess("Заседание создано!");
      setShowCreateForm(false);
      setFormData({
        type: "COMMITTEE",
        format: "OFFLINE",
        title: "",
        scheduledDate: "",
        scheduledTime: "",
        location: "",
        onlineLink: "",
        secretaryId: "",
        participantIds: [],
        externalParticipants: [],
        agendaItems: [{ title: "", description: "", speakerId: "", speakerName: "" }],
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
      agendaItems: [...prev.agendaItems, { title: "", description: "", speakerId: "", speakerName: "" }],
    }));
  };

  const removeAgendaItem = (index: number) => {
    setFormData(prev => ({
      ...prev,
      agendaItems: prev.agendaItems.filter((_, i) => i !== index),
    }));
  };

  const updateAgendaItem = (index: number, field: "title" | "description" | "speakerId" | "speakerName", value: string) => {
    setFormData(prev => ({
      ...prev,
      agendaItems: prev.agendaItems.map((item, i) => {
        if (i !== index) return item;
        
        // Если выбрали докладчика из списка, очищаем ручной ввод
        if (field === "speakerId" && value) {
          const member = members.find(m => m.id === value);
          return { 
            ...item, 
            speakerId: value, 
            speakerName: member ? getMemberFullName(member) : "" 
          };
        }
        // Если вводят имя вручную, очищаем выбор из списка
        if (field === "speakerName" && value) {
          return { ...item, speakerName: value, speakerId: "" };
        }
        
        return { ...item, [field]: value };
      }),
    }));
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
          Новое заседание
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
            Все заседания
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
            Повестки
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

      {/* Информационный блок с алгоритмом - сворачиваемый */}
      <div className="rounded-lg border border-blue-200 bg-blue-50/50 dark:border-blue-800 dark:bg-blue-900/20">
        <button
          onClick={() => setIsAlgorithmExpanded(!isAlgorithmExpanded)}
          className="flex w-full items-center justify-between p-4 text-left hover:bg-blue-100/50 dark:hover:bg-blue-900/30"
        >
          <h3 className="font-semibold text-blue-700 dark:text-blue-400">
            Алгоритм проведения заседания (согласно требованиям)
          </h3>
          <svg
            className={`h-5 w-5 text-blue-700 transition-transform dark:text-blue-400 ${
              isAlgorithmExpanded ? "rotate-180" : ""
            }`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        {isAlgorithmExpanded && (
          <div className="border-t border-blue-200 p-4 dark:border-blue-800">
            <ol className="list-decimal list-inside space-y-2 text-sm text-blue-600 dark:text-blue-400">
              <li><strong>Шаг 1:</strong> Создайте заседание с повесткой дня</li>
              <li><strong>Шаг 2:</strong> Сформируйте документ <strong>«Повестка дня»</strong> (статус: Черновик)</li>
              <li><strong>Шаг 3:</strong> Отправьте повестку на согласование участникам (статус: На согласовании)</li>
              <li><strong>Шаг 4:</strong> После согласования всеми участниками утвердите повестку председателем (статус: Утверждено)</li>
              <li><strong>Шаг 5:</strong> Проведите заседание (очно или онлайн)</li>
              <li><strong>Шаг 6:</strong> Создайте <strong>«Протокол»</strong> с результатами голосования (статус: Черновик)</li>
              <li><strong>Шаг 7:</strong> Отправьте протокол на согласование участникам (статус: На согласовании)</li>
              <li><strong>Шаг 8:</strong> После согласования утвердите протокол председателем (статус: Утверждено)</li>
              <li><strong>Шаг 9:</strong> На основании протокола сформируйте <strong>«Постановление»</strong></li>
              <li><strong>Шаг 10:</strong> При необходимости создайте <strong>«Выписку из протокола»</strong></li>
            </ol>
            <div className="mt-3 rounded bg-blue-100/50 p-2 text-xs text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
              <strong>Важно:</strong> Документооборот проходит через этапы: Черновик → На согласовании → Утверждено
            </div>
          </div>
        )}
      </div>

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
            secretaryId: "",
            participantIds: [],
            externalParticipants: [],
            agendaItems: [{ title: "", description: "", speakerId: "", speakerName: "" }],
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

              {/* Секретарь */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Секретарь заседания
                </label>
                <PPOMemberSelect
                  value={formData.secretaryId}
                  onChange={(id) => setFormData(prev => ({ ...prev, secretaryId: id }))}
                  members={members}
                  placeholder="Поиск по ФИО или должности..."
                  loading={loadingMembers}
                  showJobTitle
                />
              </div>

              {/* Члены профкома */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Члены профкома / участники
                </label>
                <PPOMemberMultiSelect
                  value={formData.participantIds}
                  onChange={(ids) => setFormData((prev) => ({ ...prev, participantIds: ids }))}
                  placeholder="Поиск по ФИО или должности (в пределах вашего ППО)..."
                  fetchLimit={50}
                />
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
                      
                      {/* Докладчик */}
                      <div>
                        <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                          Докладывает *
                        </label>
                        <div className="grid gap-2 sm:grid-cols-2">
                          <PPOMemberSelect
                            value={item.speakerId}
                            onChange={(id, member) => {
                              updateAgendaItem(index, "speakerId", id);
                              if (member) {
                                updateAgendaItem(index, "speakerName", getMemberFullName(member));
                              }
                            }}
                            members={members}
                            placeholder="Поиск по ФИО или должности..."
                            loading={loadingMembers}
                            showJobTitle
                          />
                          <input
                            type="text"
                            value={item.speakerId ? "" : item.speakerName}
                            onChange={(e) => updateAgendaItem(index, "speakerName", e.target.value)}
                            className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700"
                            placeholder="или ввести ФИО вручную"
                            disabled={!!item.speakerId}
                          />
                        </div>
                      </div>
                      
                      {/* Описание */}
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
              {isCreating ? "Создание..." : "Создать заседание"}
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
        // Фильтрация заседаний по активному табу
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
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <h3 className="mt-2 text-sm font-medium text-gray-900 dark:text-white">Нет заседаний</h3>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                {activeTab === "all" ? "Начните с создания нового заседания профкома" : 
                 activeTab === "agenda" ? "Нет заседаний с повестками" :
                 activeTab === "protocol" ? "Нет заседаний с протоколами" :
                 activeTab === "resolutions" ? "Нет заседаний с постановлениями" :
                 "Нет заседаний с выписками"}
              </p>
              {activeTab === "all" && (
                <button
                  onClick={() => setShowCreateForm(true)}
                  className="mt-4 rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
                >
                  Создать заседание
                </button>
              )}
            </div>
          );
        }

        return (
          <div className="space-y-4">
            {filteredMeetings.map((meeting) => (
            <div
              key={meeting.id}
              className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                      {MEETING_TYPE_LABELS[meeting.type] || meeting.type} №{meeting.number}
                    </h3>
                    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${MEETING_STATUS_COLORS[meeting.status]}`}>
                      {MEETING_STATUS_LABELS[meeting.status]}
                    </span>
                  </div>
                  {meeting.title && (
                    <p className="mt-1 text-gray-600 dark:text-gray-400">{meeting.title}</p>
                  )}
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-500 dark:text-gray-400">
                    <span>📅 {new Date(meeting.scheduledDate).toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" })}</span>
                    {meeting.scheduledTime && <span>🕐 {meeting.scheduledTime}</span>}
                    {meeting.location && <span>📍 {meeting.location}</span>}
                    <span>👥 {meeting._count.participants} участников</span>
                    <span>📋 {meeting._count.agendaItems} вопросов</span>
                  </div>

                  {/* Статус документов */}
                  <div className="mt-3 flex flex-wrap gap-2">
                    {meeting.agendaDocument ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-green-200 px-2.5 py-0.5 text-xs font-medium text-green-800 dark:bg-green-900/30 dark:text-green-400">
                        ✓ Повестка: {meeting.agendaDocument.regNumber}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-gray-200 px-2.5 py-0.5 text-xs font-medium text-gray-600 dark:bg-gray-700 dark:text-gray-400">
                        ○ Повестка не сформирована
                      </span>
                    )}
                    {meeting.protocolDocument ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-green-200 px-2.5 py-0.5 text-xs font-medium text-green-800 dark:bg-green-900/30 dark:text-green-400">
                        ✓ Протокол: {meeting.protocolDocument.regNumber}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-gray-200 px-2.5 py-0.5 text-xs font-medium text-gray-600 dark:bg-gray-700 dark:text-gray-400">
                        ○ Протокол не сформирован
                      </span>
                    )}
                    {meeting._count.resolutions > 0 && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-blue-200 px-2.5 py-0.5 text-xs font-medium text-blue-800 dark:bg-blue-900/30 dark:text-blue-400">
                        📜 {meeting._count.resolutions} постановлений
                      </span>
                    )}
                  </div>
                </div>

                <Link
                  href={`/dashboard/documents/meetings/${meeting.id}`}
                  className="flex items-center gap-1 rounded-lg bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700"
                >
                  Открыть
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </Link>
              </div>
            </div>
          ))}
        </div>
      );
      })()}
    </div>
  );
}
