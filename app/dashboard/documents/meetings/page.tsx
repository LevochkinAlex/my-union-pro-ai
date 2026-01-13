"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { alertSuccess, alertError } from "@/lib/alert";
import Link from "next/link";

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

  const [formData, setFormData] = useState({
    type: "COMMITTEE",
    format: "OFFLINE",
    title: "",
    scheduledDate: "",
    scheduledTime: "",
    location: "",
    onlineLink: "",
    agendaItems: [{ title: "", description: "" }],
  });

  useEffect(() => {
    loadMeetings();
  }, []);

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

    if (formData.agendaItems.every(item => !item.title.trim())) {
      alertError("Добавьте хотя бы один вопрос в повестку");
      return;
    }

    try {
      setIsCreating(true);
      const response = await fetch("/api/ppo-head/meetings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...formData,
          agendaItems: formData.agendaItems.filter(item => item.title.trim()),
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Ошибка создания");
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
        agendaItems: [{ title: "", description: "" }],
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
      agendaItems: [...prev.agendaItems, { title: "", description: "" }],
    }));
  };

  const removeAgendaItem = (index: number) => {
    setFormData(prev => ({
      ...prev,
      agendaItems: prev.agendaItems.filter((_, i) => i !== index),
    }));
  };

  const updateAgendaItem = (index: number, field: "title" | "description", value: string) => {
    setFormData(prev => ({
      ...prev,
      agendaItems: prev.agendaItems.map((item, i) =>
        i === index ? { ...item, [field]: value } : item
      ),
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

      {/* Информационный блок с алгоритмом */}
      <div className="rounded-lg border border-blue-200 bg-blue-50/50 p-4 dark:border-blue-800 dark:bg-blue-900/20">
        <h3 className="mb-2 font-semibold text-blue-700 dark:text-blue-400">
          Алгоритм проведения заседания:
        </h3>
        <ol className="list-decimal list-inside space-y-1 text-sm text-blue-600 dark:text-blue-400">
          <li>Создайте заседание с повесткой дня</li>
          <li>Сформируйте документ <strong>«Повестка дня»</strong> и отправьте участникам</li>
          <li>Проведите заседание (очно или онлайн)</li>
          <li>Создайте <strong>«Протокол»</strong> с результатами голосования по каждому вопросу</li>
          <li>На основании протокола сформируйте <strong>«Постановление»</strong></li>
          <li>При необходимости создайте <strong>«Выписку из протокола»</strong></li>
        </ol>
      </div>

      {/* Форма создания заседания */}
      {showCreateForm && (
        <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
          <h2 className="mb-4 text-xl font-semibold">Новое заседание</h2>

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

          {/* Пункты повестки */}
          <div className="mt-6">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Пункты повестки дня *
            </label>
            <div className="space-y-3">
              {formData.agendaItems.map((item, index) => (
                <div key={index} className="rounded-md border border-gray-200 p-3 dark:border-gray-700">
                  <div className="flex items-start gap-3">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-200 text-xs font-medium text-blue-800 dark:bg-blue-900/30 dark:text-blue-400">
                      {index + 1}
                    </span>
                    <div className="flex-1 space-y-2">
                      <input
                        type="text"
                        value={item.title}
                        onChange={(e) => updateAgendaItem(index, "title", e.target.value)}
                        className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700"
                        placeholder="Название вопроса"
                      />
                      <textarea
                        value={item.description}
                        onChange={(e) => updateAgendaItem(index, "description", e.target.value)}
                        rows={2}
                        className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700"
                        placeholder="Описание (опционально)"
                      />
                    </div>
                    {formData.agendaItems.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeAgendaItem(index)}
                        className="text-red-500 hover:text-red-700"
                      >
                        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
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
              className="mt-2 text-sm text-blue-600 hover:text-blue-800 dark:text-blue-400"
            >
              + Добавить вопрос
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
      )}

      {/* Список заседаний */}
      {meetings.length === 0 && !showCreateForm ? (
        <div className="rounded-lg border-2 border-dashed border-gray-300 bg-white p-8 text-center dark:border-gray-700 dark:bg-gray-800">
          <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          <h3 className="mt-2 text-sm font-medium text-gray-900 dark:text-white">Нет заседаний</h3>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Начните с создания нового заседания профкома
          </p>
          <button
            onClick={() => setShowCreateForm(true)}
            className="mt-4 rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
          >
            Создать заседание
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {meetings.map((meeting) => (
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
      )}
    </div>
  );
}
