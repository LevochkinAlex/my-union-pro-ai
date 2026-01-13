"use client";

import { useState, useEffect, use } from "react";
import { useSession } from "next-auth/react";
import { alertSuccess, alertError } from "@/lib/alert";
import Link from "next/link";

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
  APPROVED: "Утверждён",
  COMPLETED: "Утверждён",
};

export default function MeetingDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const resolvedParams = use(params);
  const { data: session } = useSession();
  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"info" | "agenda" | "protocol">("info");
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Состояние для редактирования протокола
  const [protocolData, setProtocolData] = useState<Record<string, any>>({});
  const [members, setMembers] = useState<any[]>([]);

  useEffect(() => {
    loadMeeting();
    loadMembers();
  }, [resolvedParams.id]);

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

  const updateProtocolItem = (itemId: string, field: string, value: any) => {
    setProtocolData(prev => ({
      ...prev,
      [itemId]: {
        ...prev[itemId],
        [field]: value,
      },
    }));
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
        <span className={`rounded-full px-3 py-1 text-sm font-medium ${
          meeting.status === "COMPLETED" ? "bg-green-100 text-green-800" :
          meeting.status === "IN_PROGRESS" ? "bg-yellow-100 text-yellow-800" :
          "bg-gray-100 text-gray-800"
        }`}>
          {MEETING_STATUS_LABELS[meeting.status]}
        </span>
      </div>

      {/* Статус документов */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {/* Повестка */}
        <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
          <div className="flex items-center justify-between">
            <h3 className="font-medium text-gray-900 dark:text-white">Повестка дня</h3>
            {meeting.agendaDocument && (
              <span className="text-xs text-green-600 dark:text-green-400">✓</span>
            )}
          </div>
          {meeting.agendaDocument ? (
            <div className="mt-2">
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {meeting.agendaDocument.regNumber}
              </p>
              <p className="text-xs text-gray-500">
                {DOC_STATUS_LABELS[meeting.agendaDocument.status]}
              </p>
              {meeting.agendaDocument.filePath && (
                <a
                  href={meeting.agendaDocument.filePath}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 inline-block text-sm text-blue-600 hover:underline"
                >
                  Скачать PDF
                </a>
              )}
            </div>
          ) : (
            <button
              onClick={() => handleGenerateDocument("AGENDA")}
              disabled={isGenerating || meeting.agendaItems.length === 0}
              className="mt-2 text-sm text-blue-600 hover:underline disabled:opacity-50"
            >
              {isGenerating ? "Формирование..." : "Сформировать"}
            </button>
          )}
        </div>

        {/* Протокол */}
        <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
          <div className="flex items-center justify-between">
            <h3 className="font-medium text-gray-900 dark:text-white">Протокол</h3>
            {meeting.protocolDocument && (
              <span className="text-xs text-green-600 dark:text-green-400">✓</span>
            )}
          </div>
          {meeting.protocolDocument ? (
            <div className="mt-2">
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {meeting.protocolDocument.regNumber}
              </p>
              <p className="text-xs text-gray-500">
                {DOC_STATUS_LABELS[meeting.protocolDocument.status]}
              </p>
              {meeting.protocolDocument.filePath && (
                <a
                  href={meeting.protocolDocument.filePath}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 inline-block text-sm text-blue-600 hover:underline"
                >
                  Скачать PDF
                </a>
              )}
            </div>
          ) : (
            <button
              onClick={() => setActiveTab("protocol")}
              disabled={!meeting.agendaDocument}
              className="mt-2 text-sm text-blue-600 hover:underline disabled:opacity-50 disabled:cursor-not-allowed"
              title={!meeting.agendaDocument ? "Сначала сформируйте повестку" : ""}
            >
              Заполнить протокол →
            </button>
          )}
        </div>

        {/* Постановления */}
        <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
          <h3 className="font-medium text-gray-900 dark:text-white">Постановления</h3>
          <p className="mt-2 text-2xl font-bold text-gray-900 dark:text-white">
            {meeting.resolutions.length}
          </p>
          <p className="text-xs text-gray-500">документов</p>
        </div>

        {/* Выписки */}
        <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
          <h3 className="font-medium text-gray-900 dark:text-white">Выписки</h3>
          <p className="mt-2 text-2xl font-bold text-gray-900 dark:text-white">
            {meeting.extracts.length}
          </p>
          <p className="text-xs text-gray-500">документов</p>
        </div>
      </div>

      {/* Табы */}
      <div className="border-b border-gray-200 dark:border-gray-700">
        <nav className="-mb-px flex space-x-8">
          {[
            { id: "info", label: "Информация" },
            { id: "agenda", label: `Повестка (${meeting.agendaItems.length})` },
            { id: "protocol", label: "Протокол" },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`whitespace-nowrap border-b-2 py-4 px-1 text-sm font-medium transition-colors ${
                activeTab === tab.id
                  ? "border-blue-500 text-blue-600 dark:text-blue-400"
                  : "border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 dark:text-gray-400"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Контент табов */}
      {activeTab === "info" && (
        <div className="grid gap-6 lg:grid-cols-2">
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
            <h3 className="mb-4 font-semibold text-gray-900 dark:text-white">
              Участники ({meeting.participants.length})
            </h3>
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
                  {p.canVote && (
                    <span className="text-xs text-gray-500">Голосует</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {activeTab === "agenda" && (
        <div className="space-y-4">
          {meeting.agendaItems.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              Нет пунктов в повестке
            </div>
          ) : (
            meeting.agendaItems.map((item) => (
              <div
                key={item.id}
                className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800"
              >
                <div className="flex items-start gap-3">
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-100 text-sm font-medium text-blue-800 dark:bg-blue-900/30 dark:text-blue-400">
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
            ))
          )}

          {!meeting.agendaDocument && meeting.agendaItems.length > 0 && (
            <button
              onClick={() => handleGenerateDocument("AGENDA")}
              disabled={isGenerating}
              className="w-full rounded-lg bg-blue-600 py-3 text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {isGenerating ? "Формирование..." : "Сформировать повестку дня"}
            </button>
          )}
        </div>
      )}

      {activeTab === "protocol" && (
        <div className="space-y-6">
          {/* Статус протокола */}
          <div className="flex items-center justify-between rounded-lg bg-gray-50 p-4 dark:bg-gray-800">
            <div>
              <h3 className="font-semibold">Статус документа</h3>
              <div className="mt-2 flex items-center gap-4">
                {["Черновик", "На согласовании", "Утверждено"].map((status, i) => (
                  <div key={status} className="flex items-center gap-2">
                    <span className={`h-3 w-3 rounded-full ${
                      i === 0 ? "bg-blue-500" : "bg-gray-300 dark:bg-gray-600"
                    }`} />
                    <span className={i === 0 ? "font-medium" : "text-gray-500"}>{status}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={saveProtocolData}
                disabled={isSaving}
                className="rounded-lg border border-gray-300 px-4 py-2 hover:bg-gray-100 disabled:opacity-50 dark:border-gray-600 dark:hover:bg-gray-700"
              >
                {isSaving ? "Сохранение..." : "Сохранить"}
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
                  <select
                    value={protocolData[item.id]?.speakerId || ""}
                    onChange={(e) => {
                      const memberId = e.target.value;
                      const member = members.find(m => m.id === memberId);
                      updateProtocolItem(item.id, "speakerId", memberId);
                      if (member) {
                        updateProtocolItem(item.id, "speakerName", getMemberName(member));
                      }
                    }}
                    className="block w-full rounded-md border border-gray-300 px-3 py-2 dark:border-gray-600 dark:bg-gray-700"
                  >
                    <option value="">Выберите докладчика</option>
                    {members.map((member) => (
                      <option key={member.id} value={member.id}>
                        {getMemberName(member)} {member.jobTitle ? `— ${member.jobTitle}` : ""}
                      </option>
                    ))}
                  </select>
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
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                    Голосование:
                  </label>
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">За:</label>
                      <input
                        type="number"
                        min="0"
                        value={protocolData[item.id]?.votesFor || 0}
                        onChange={(e) => updateProtocolItem(item.id, "votesFor", parseInt(e.target.value) || 0)}
                        className="block w-full rounded-md border border-green-300 bg-green-50 px-3 py-2 text-center font-medium text-green-700 dark:border-green-700 dark:bg-green-900/30 dark:text-green-400"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Против:</label>
                      <input
                        type="number"
                        min="0"
                        value={protocolData[item.id]?.votesAgainst || 0}
                        onChange={(e) => updateProtocolItem(item.id, "votesAgainst", parseInt(e.target.value) || 0)}
                        className="block w-full rounded-md border border-red-300 bg-red-50 px-3 py-2 text-center font-medium text-red-700 dark:border-red-700 dark:bg-red-900/30 dark:text-red-400"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Воздержались:</label>
                      <input
                        type="number"
                        min="0"
                        value={protocolData[item.id]?.votesAbstained || 0}
                        onChange={(e) => updateProtocolItem(item.id, "votesAbstained", parseInt(e.target.value) || 0)}
                        className="block w-full rounded-md border border-gray-300 bg-gray-100 px-3 py-2 text-center font-medium dark:border-gray-600 dark:bg-gray-700"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))}

          {/* Кнопки внизу */}
          <div className="flex justify-between">
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
        </div>
      )}
    </div>
  );
}
