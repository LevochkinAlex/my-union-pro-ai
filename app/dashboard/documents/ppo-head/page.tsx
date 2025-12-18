"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { alertSuccess, alertError } from "@/lib/alert";

// ИСПРАВЛЕНО: Убран импорт типа из @prisma/client, используем строковый литерал
type DocumentType = 
  | "MEMBERSHIP_APPLICATION" 
  | "CONTRIBUTION_APPLICATION" 
  | "MEMBERSHIP_REMOVAL_APPLICATION"
  | "MEMBERSHIP_TRANSFER_APPLICATION"
  | "AGENDA"
  | "PROTOCOL"
  | "RESOLUTION"
  | "PROTOCOL_EXTRACT"
  | "APPEAL"
  | "OTHER";

interface DocumentTemplate {
  id: string;
  name: string;
  description: string | null;
  type: DocumentType;
}

interface Member {
  id: string;
  firstName: string | null;
  lastName: string | null;
  middleName: string | null;
  jobTitle: string | null;
}

interface Document {
  id: string;
  type: string;
  status: string;
  title: string;
  fileName: string | null;
  filePath: string | null;
  createdAt: string;
}

export default function PPOHeadDocumentsPage() {
  const { data: session } = useSession();
  const [documents, setDocuments] = useState<Document[]>([]);
  const [templates, setTemplates] = useState<DocumentTemplate[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<DocumentTemplate | null>(null);
  const [formData, setFormData] = useState<{
    templateId: string;
    type: DocumentType;
    title: string;
    meetingDate: string;
    meetingTime: string;
    meetingPlace: string;
    agendaItems: string[];
    votingParticipants: string[];
    presentMembers: string[];
    absentMembers: string[];
    secretaryName: string;
    secretaryJobTitle: string;
    resolutionNumber: string;
    protocolNumber: string;
  }>({
    templateId: "",
    type: "AGENDA",
    title: "",
    meetingDate: "",
    meetingTime: "",
    meetingPlace: "",
    agendaItems: [""],
    votingParticipants: [],
    presentMembers: [],
    absentMembers: [],
    secretaryName: "",
    secretaryJobTitle: "",
    resolutionNumber: "",
    protocolNumber: "",
  });

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    // При изменении типа документа обновляем список шаблонов
    if (formData.type) {
      loadTemplates(formData.type);
    }
  }, [formData.type]);

  const loadData = async () => {
    try {
      setIsLoading(true);
      await Promise.all([
        loadDocuments(),
        loadMembers(),
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const loadDocuments = async () => {
    try {
      const response = await fetch("/api/ppo-head/documents");
      if (response.ok) {
        const data = await response.json();
        setDocuments(data.documents || []);
      }
    } catch (error) {
      console.error("Ошибка загрузки документов:", error);
    }
  };

  const loadTemplates = async (type: DocumentType) => {
    try {
      const response = await fetch(`/api/ppo-head/document-templates?type=${type}`);
      if (response.ok) {
        const data = await response.json();
        const filteredTemplates = data.templates || [];
        setTemplates(filteredTemplates);
        
        // Автоматически выбираем шаблон по умолчанию, если есть
        const defaultTemplate = filteredTemplates.find((t: DocumentTemplate & { isDefault?: boolean }) => t.isDefault);
        if (defaultTemplate) {
          setSelectedTemplate(defaultTemplate);
          setFormData(prev => ({ ...prev, templateId: defaultTemplate.id }));
        } else if (filteredTemplates.length === 1) {
          // Если шаблон один, выбираем его автоматически
          setSelectedTemplate(filteredTemplates[0]);
          setFormData(prev => ({ ...prev, templateId: filteredTemplates[0].id }));
        }
      }
    } catch (error) {
      console.error("Ошибка загрузки шаблонов:", error);
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

  const handleCreateDocument = async () => {
    try {
      if (!formData.templateId) {
        alertError("Выберите шаблон документа");
        return;
      }

      if (!formData.title) {
        alertError("Укажите название документа");
        return;
      }

      // Валидация в зависимости от типа документа
      if (formData.type === "AGENDA" && formData.agendaItems.every(item => !item.trim())) {
        alertError("Добавьте хотя бы один пункт повестки дня");
        return;
      }

      if ((formData.type === "PROTOCOL" || formData.type === "RESOLUTION") && 
          formData.votingParticipants.length === 0) {
        alertError("Выберите участников голосования");
        return;
      }

      setIsCreating(true);

      const response = await fetch("/api/ppo-head/documents/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Ошибка при создании документа");
      }

      const data = await response.json();
      alertSuccess("Документ успешно создан!");
      
      // Сбрасываем форму
      setFormData({
        templateId: "",
        type: "AGENDA",
        title: "",
        meetingDate: "",
        meetingTime: "",
        meetingPlace: "",
        agendaItems: [""],
        votingParticipants: [],
        presentMembers: [],
        absentMembers: [],
        secretaryName: "",
        secretaryJobTitle: "",
        resolutionNumber: "",
        protocolNumber: "",
      });
      setSelectedTemplate(null);
      setIsCreating(false);

      await loadDocuments();
    } catch (error) {
      console.error("Ошибка создания документа:", error);
      alertError(error instanceof Error ? error.message : "Не удалось создать документ");
      setIsCreating(false);
    }
  };

  const addAgendaItem = () => {
    setFormData(prev => ({
      ...prev,
      agendaItems: [...prev.agendaItems, ""],
    }));
  };

  const removeAgendaItem = (index: number) => {
    setFormData(prev => ({
      ...prev,
      agendaItems: prev.agendaItems.filter((_, i) => i !== index),
    }));
  };

  const updateAgendaItem = (index: number, value: string) => {
    setFormData(prev => ({
      ...prev,
      agendaItems: prev.agendaItems.map((item, i) => i === index ? value : item),
    }));
  };

  const toggleVotingParticipant = (memberId: string) => {
    setFormData(prev => ({
      ...prev,
      votingParticipants: prev.votingParticipants.includes(memberId)
        ? prev.votingParticipants.filter(id => id !== memberId)
        : [...prev.votingParticipants, memberId],
    }));
  };

  const togglePresentMember = (memberId: string) => {
    setFormData(prev => ({
      ...prev,
      presentMembers: prev.presentMembers.includes(memberId)
        ? prev.presentMembers.filter(id => id !== memberId)
        : [...prev.presentMembers, memberId],
      absentMembers: prev.absentMembers.filter(id => id !== memberId),
    }));
  };

  const toggleAbsentMember = (memberId: string) => {
    setFormData(prev => ({
      ...prev,
      absentMembers: prev.absentMembers.includes(memberId)
        ? prev.absentMembers.filter(id => id !== memberId)
        : [...prev.absentMembers, memberId],
      presentMembers: prev.presentMembers.filter(id => id !== memberId),
    }));
  };

  const getMemberName = (member: Member) => {
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
            Документы профкома
          </h1>
          <p className="mt-2 text-gray-600 dark:text-gray-400">
            Создание и управление документами заседаний профсоюзного комитета
          </p>
        </div>
        <button
          onClick={() => setIsCreating(true)}
          className="rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
        >
          + Создать документ
        </button>
      </div>

      {isCreating && (
        <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
          <h2 className="mb-4 text-xl font-semibold">Создание документа</h2>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Тип документа *
              </label>
              <select
                value={formData.type}
                onChange={(e) => {
                  const newType = e.target.value as DocumentType;
                  setFormData(prev => ({ ...prev, type: newType, templateId: "" }));
                  setSelectedTemplate(null);
                }}
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 dark:border-gray-600 dark:bg-gray-700"
              >
                <option value={AGENDA}>Повестка дня</option>
                <option value={PROTOCOL}>Протокол</option>
                <option value={RESOLUTION}>Постановление</option>
                <option value={PROTOCOL_EXTRACT}>Выписка из протокола</option>
              </select>
            </div>

            {templates.length > 0 && (
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Шаблон документа *
                </label>
                <select
                  value={formData.templateId}
                  onChange={(e) => {
                    const template = templates.find(t => t.id === e.target.value);
                    setSelectedTemplate(template || null);
                    setFormData(prev => ({ ...prev, templateId: e.target.value }));
                  }}
                  className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 dark:border-gray-600 dark:bg-gray-700"
                >
                  <option value="">Выберите шаблон</option>
                  {templates.map((template) => (
                    <option key={template.id} value={template.id}>
                      {template.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Название документа *
              </label>
              <input
                type="text"
                value={formData.title}
                onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 dark:border-gray-600 dark:bg-gray-700"
                placeholder="Например: Повестка дня заседания профкома от 15.01.2025"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Дата заседания
                </label>
                <input
                  type="date"
                  value={formData.meetingDate}
                  onChange={(e) => setFormData(prev => ({ ...prev, meetingDate: e.target.value }))}
                  className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 dark:border-gray-600 dark:bg-gray-700"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Время заседания
                </label>
                <input
                  type="time"
                  value={formData.meetingTime}
                  onChange={(e) => setFormData(prev => ({ ...prev, meetingTime: e.target.value }))}
                  className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 dark:border-gray-700"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Место проведения заседания
              </label>
              <input
                type="text"
                value={formData.meetingPlace}
                onChange={(e) => setFormData(prev => ({ ...prev, meetingPlace: e.target.value }))}
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 dark:border-gray-600 dark:bg-gray-700"
                placeholder="Например: Кабинет профкома, ул. Ленина, д. 1"
              />
            </div>

            {formData.type === "AGENDA" && (
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Пункты повестки дня *
                </label>
                <div className="mt-2 space-y-2">
                  {formData.agendaItems.map((item, index) => (
                    <div key={index} className="flex gap-2">
                      <input
                        type="text"
                        value={item}
                        onChange={(e) => updateAgendaItem(index, e.target.value)}
                        className="flex-1 rounded-md border border-gray-300 px-3 py-2 dark:border-gray-600 dark:bg-gray-700"
                        placeholder={`Пункт ${index + 1}`}
                      />
                      {formData.agendaItems.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeAgendaItem(index)}
                          className="rounded bg-red-600 px-3 py-2 text-white hover:bg-red-700"
                        >
                          Удалить
                        </button>
                      )}
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={addAgendaItem}
                    className="rounded bg-gray-200 px-3 py-2 text-sm hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600"
                  >
                    + Добавить пункт
                  </button>
                </div>
              </div>
            )}

            {(formData.type === "PROTOCOL" || formData.type === "RESOLUTION") && (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Участники голосования * (выберите членов профкома, имеющих право голоса)
                  </label>
                  <div className="max-h-60 overflow-y-auto rounded-md border border-gray-300 p-3 dark:border-gray-600">
                    {members.length === 0 ? (
                      <p className="text-sm text-gray-500">Нет активных членов профсоюза</p>
                    ) : (
                      <div className="space-y-2">
                        {members.map((member) => (
                          <label
                            key={member.id}
                            className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 p-2 rounded"
                          >
                            <input
                              type="checkbox"
                              checked={formData.votingParticipants.includes(member.id)}
                              onChange={() => toggleVotingParticipant(member.id)}
                              className="rounded"
                            />
                            <span className="text-sm">
                              {getMemberName(member)}
                              {member.jobTitle && ` - ${member.jobTitle}`}
                            </span>
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Присутствующие
                    </label>
                    <div className="max-h-40 overflow-y-auto rounded-md border border-gray-300 p-3 dark:border-gray-600">
                      {members.map((member) => (
                        <label
                          key={member.id}
                          className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 p-1 rounded"
                        >
                          <input
                            type="checkbox"
                            checked={formData.presentMembers.includes(member.id)}
                            onChange={() => togglePresentMember(member.id)}
                            className="rounded"
                          />
                          <span className="text-xs">{getMemberName(member)}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Отсутствующие
                    </label>
                    <div className="max-h-40 overflow-y-auto rounded-md border border-gray-300 p-3 dark:border-gray-600">
                      {members.map((member) => (
                        <label
                          key={member.id}
                          className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 p-1 rounded"
                        >
                          <input
                            type="checkbox"
                            checked={formData.absentMembers.includes(member.id)}
                            onChange={() => toggleAbsentMember(member.id)}
                            className="rounded"
                          />
                          <span className="text-xs">{getMemberName(member)}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
              </>
            )}

            {formData.type === "PROTOCOL" && (
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Номер протокола
                </label>
                <input
                  type="text"
                  value={formData.protocolNumber}
                  onChange={(e) => setFormData(prev => ({ ...prev, protocolNumber: e.target.value }))}
                  className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 dark:border-gray-600 dark:bg-gray-700"
                  placeholder="Например: № 1"
                />
              </div>
            )}

            {formData.type === "RESOLUTION" && (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Номер постановления
                  </label>
                  <input
                    type="text"
                    value={formData.resolutionNumber}
                    onChange={(e) => setFormData(prev => ({ ...prev, resolutionNumber: e.target.value }))}
                    className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 dark:border-gray-600 dark:bg-gray-700"
                    placeholder="Например: № 1"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                      ФИО секретаря
                    </label>
                    <input
                      type="text"
                      value={formData.secretaryName}
                      onChange={(e) => setFormData(prev => ({ ...prev, secretaryName: e.target.value }))}
                      className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 dark:border-gray-600 dark:bg-gray-700"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                      Должность секретаря
                    </label>
                    <input
                      type="text"
                      value={formData.secretaryJobTitle}
                      onChange={(e) => setFormData(prev => ({ ...prev, secretaryJobTitle: e.target.value }))}
                      className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 dark:border-gray-600 dark:bg-gray-700"
                    />
                  </div>
                </div>
              </>
            )}

            <div className="flex gap-2">
              <button
                onClick={handleCreateDocument}
                disabled={isCreating}
                className="rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {isCreating ? "Создание..." : "Создать документ"}
              </button>
              <button
                onClick={() => {
                  setIsCreating(false);
                  setFormData({
                    templateId: "",
                    type: "AGENDA",
                    title: "",
                    meetingDate: "",
                    meetingTime: "",
                    meetingPlace: "",
                    agendaItems: [""],
                    votingParticipants: [],
                    presentMembers: [],
                    absentMembers: [],
                    secretaryName: "",
                    secretaryJobTitle: "",
                    resolutionNumber: "",
                    protocolNumber: "",
                  });
                  setSelectedTemplate(null);
                }}
                className="rounded-lg border border-gray-300 px-4 py-2 hover:bg-gray-50 dark:border-gray-600 dark:hover:bg-gray-700"
              >
                Отмена
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="space-y-4">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
          Созданные документы
        </h2>
        {documents.length === 0 ? (
          <div className="rounded-lg border-2 border-dashed border-gray-300 bg-white p-8 text-center dark:border-gray-700 dark:bg-gray-800">
            <p className="text-gray-600 dark:text-gray-400">
              Документов пока нет. Создайте первый документ.
            </p>
          </div>
        ) : (
          <div className="grid gap-4">
            {documents.map((doc) => (
              <div
                key={doc.id}
                className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                      {doc.title}
                    </h3>
                    <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                      Тип: {doc.type} | Статус: {doc.status}
                    </p>
                    <p className="mt-1 text-xs text-gray-500">
                      Создан: {new Date(doc.createdAt).toLocaleDateString("ru-RU")}
                    </p>
                  </div>
                  {doc.filePath && (
                    <a
                      href={doc.filePath}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded bg-blue-600 px-3 py-1 text-sm text-white hover:bg-blue-700"
                    >
                      Скачать
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

