"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { alertSuccess, alertError } from "@/lib/alert";
import { DATE_INPUT_MIN, DATE_INPUT_MAX, normalizeDateInputValue } from "@/lib/date-bounds";
import { HorizontalTabArrowStrip } from "@/components/ui/HorizontalTabArrowStrip";

// Типы документов
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

// Типы документов организации (заседания профкома)
const ORGANIZATION_DOC_TYPES: DocumentType[] = ["AGENDA", "PROTOCOL", "RESOLUTION", "PROTOCOL_EXTRACT"];

// Типы личных документов
const PERSONAL_DOC_TYPES: DocumentType[] = [
  "MEMBERSHIP_APPLICATION", 
  "CONTRIBUTION_APPLICATION", 
  "MEMBERSHIP_REMOVAL_APPLICATION",
  "MEMBERSHIP_TRANSFER_APPLICATION"
];

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
  description?: string | null;
  fileName: string | null;
  filePath: string | null;
  createdAt: string;
}

type DocumentTab = "organization" | "personal" | "templates";

export default function PPOHeadDocumentsPage() {
  const { data: session } = useSession();
  const isRpoMode =
    (session?.user as { viewMode?: string; isRPOHead?: boolean } | undefined)?.viewMode === "RPO_HEAD" ||
    (session?.user as { viewMode?: string; isRPOHead?: boolean } | undefined)?.isRPOHead === true;
  const [activeTab, setActiveTab] = useState<DocumentTab>("organization");
  const [journalDocuments, setJournalDocuments] = useState<Document[]>([]);
  const [isLoadingJournal, setIsLoadingJournal] = useState(false);
  const [orgDocuments, setOrgDocuments] = useState<Document[]>([]);
  const [personalDocuments, setPersonalDocuments] = useState<Document[]>([]);
  const [templates, setTemplates] = useState<DocumentTemplate[]>([]);
  const [allTemplates, setAllTemplates] = useState<DocumentTemplate[]>([]);
  const [isLoadingTemplates, setIsLoadingTemplates] = useState(false);
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
    if (isRpoMode) {
      setActiveTab("organization");
      setIsCreating(true);
    }
  }, [isRpoMode]);

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
      // Загружаем документы организации
      const orgResponse = await fetch("/api/ppo-head/documents");
      if (orgResponse.ok) {
        const data = await orgResponse.json();
        const allDocs = data.documents || [];
        
        // Разделяем на документы организации и личные
        const orgDocs = allDocs.filter((d: Document) => 
          ORGANIZATION_DOC_TYPES.includes(d.type as DocumentType)
        );
        
        setOrgDocuments(orgDocs);
      }
      
      // Загружаем личные документы председателя (только заявления и устав)
      // API /api/documents возвращает incomingDocuments и outgoingDocuments, не documents
      const personalResponse = await fetch("/api/documents");
      if (personalResponse.ok) {
        const data = await personalResponse.json();
        const userDocs = [
          ...(data.incomingDocuments || []),
          ...(data.outgoingDocuments || []),
        ];
        
        // Фильтруем: только личные документы (заявления) и устав (OTHER с уставом)
        const personalDocs = userDocs.filter((d: Document) => {
          // Исключаем документы организации
          if (ORGANIZATION_DOC_TYPES.includes(d.type as DocumentType)) {
            return false;
          }
          
          // Включаем только заявления
          if (PERSONAL_DOC_TYPES.includes(d.type as DocumentType)) {
            return true;
          }
          
          // Включаем устав (OTHER с упоминанием "устав")
          if (d.type === "OTHER") {
            const isCharter = 
              d.id === "charter-system" ||
              d.title?.toLowerCase().includes("устав") ||
              (d.description && d.description.toLowerCase().includes("устав"));
            return isCharter;
          }
          
          return false;
        });
        
        setPersonalDocuments(personalDocs);
      }
    } catch (error) {
      console.error("Ошибка загрузки документов:", error);
    }
  };

  const loadTemplates = async (type: DocumentType) => {
    try {
      let response = await fetch(`/api/ppo-head/document-templates?type=${type}`);
      if (response.status === 403) {
        // В режиме РПО шаблоны заседаний берём из org-head API
        response = await fetch(`/api/org-head/document-templates?type=${type}`);
      }
      if (!response.ok) {
        setTemplates([]);
        setSelectedTemplate(null);
        setFormData((prev) => ({ ...prev, templateId: "" }));
        return;
      }

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
      } else {
        setSelectedTemplate(null);
        setFormData((prev) => ({ ...prev, templateId: "" }));
      }
    } catch (error) {
      console.error("Ошибка загрузки шаблонов:", error);
      setTemplates([]);
      setSelectedTemplate(null);
      setFormData((prev) => ({ ...prev, templateId: "" }));
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

  const loadAllTemplates = async () => {
    setIsLoadingTemplates(true);
    try {
      let response = await fetch("/api/ppo-head/document-templates");
      if (response.status === 403) {
        response = await fetch("/api/org-head/document-templates");
      }
      if (response.ok) {
        const data = await response.json();
        setAllTemplates(data.templates || []);
      }
    } catch (error) {
      console.error("Ошибка загрузки всех шаблонов:", error);
    } finally {
      setIsLoadingTemplates(false);
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

  const getDocumentTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      AGENDA: "Повестка дня",
      PROTOCOL: "Протокол",
      RESOLUTION: "Постановление",
      PROTOCOL_EXTRACT: "Выписка из протокола",
      MEMBERSHIP_APPLICATION: "Заявление о вступлении",
      CONTRIBUTION_APPLICATION: "Заявление о взносах",
      MEMBERSHIP_REMOVAL_APPLICATION: "Заявление о выходе",
      MEMBERSHIP_TRANSFER_APPLICATION: "Заявление о переводе",
      APPEAL: "Обращение",
      OTHER: "Другое",
    };
    return labels[type] || type;
  };

  const getDocumentStatusLabel = (status: string) => {
    const labels: Record<string, string> = {
      DRAFT: "Черновик",
      GENERATED: "Сформирован",
      SIGNED: "Подписан",
      PENDING: "На рассмотрении",
      APPROVED: "Одобрен",
      REJECTED: "Отклонён",
      ARCHIVED: "В архиве",
    };
    return labels[status] || status;
  };

  const currentDocuments = activeTab === "organization"
    ? orgDocuments
    : (isRpoMode ? orgDocuments : personalDocuments);

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
            {isRpoMode ? "Конструктор документов" : "Документы"}
          </h1>
          <p className="mt-2 text-gray-600 dark:text-gray-400">
            {isRpoMode
              ? "Создание организационных документов по шаблонам РПО"
              : "Управление документами организации и личными документами"}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <a
            href="/dashboard/documents/journal"
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm hover-surface dark:border-gray-600"
          >
            Журнал документов
          </a>
          {activeTab === "organization" && !isRpoMode && (
            <button
              onClick={() => setIsCreating(true)}
              className="rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
            >
              + Создать документ
            </button>
          )}
        </div>
      </div>

      {/* Табы */}
      <div className="border-b border-gray-200 dark:border-gray-700">
        <HorizontalTabArrowStrip
          enabled={!isLoading}
          remeasureDeps={[activeTab, orgDocuments.length, personalDocuments.length, isRpoMode]}
        >
          {(innerRef) => (
        <nav ref={innerRef} className="-mb-px flex w-max max-w-none flex-nowrap gap-x-8">
          <button
            type="button"
            onClick={() => setActiveTab("organization")}
            className={`shrink-0 whitespace-nowrap border-b-2 py-4 px-1 text-sm font-medium transition-colors ${
              activeTab === "organization"
                ? "border-blue-500 text-blue-600 dark:text-blue-400"
                : "border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
            }`}
          >
            {isRpoMode ? "Конструктор" : "Документы организации"}
            {orgDocuments.length > 0 && (
              <span className="ml-2 rounded-full bg-blue-200 px-2 py-0.5 text-xs font-medium text-blue-800 dark:bg-blue-900/30 dark:text-blue-400">
                {orgDocuments.length}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("personal")}
            className={`shrink-0 whitespace-nowrap border-b-2 py-4 px-1 text-sm font-medium transition-colors ${
              activeTab === "personal"
                ? "border-blue-500 text-blue-600 dark:text-blue-400"
                : "border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
            }`}
          >
            {isRpoMode ? "Журнал" : "Личные"}
            {(isRpoMode ? orgDocuments.length : personalDocuments.length) > 0 && (
              <span className="ml-2 rounded-full bg-gray-200 px-2 py-0.5 text-xs font-medium text-gray-700 dark:bg-gray-700 dark:text-gray-300">
                {isRpoMode ? orgDocuments.length : personalDocuments.length}
              </span>
            )}
          </button>
        </nav>
          )}
        </HorizontalTabArrowStrip>
      </div>

      {/* Информационный блок для таба организации */}
      {activeTab === "organization" && !isCreating && !isRpoMode && (
        <div className="rounded-lg border border-dashed border-blue-300 bg-blue-50/50 p-4 dark:border-blue-800 dark:bg-blue-900/20">
          <div className="flex items-start gap-3">
            <svg className="h-6 w-6 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <div className="text-sm text-blue-700 dark:text-blue-300">
              <p className="font-medium mb-1">Алгоритм проведения заседания Профкома:</p>
              <ol className="list-decimal list-inside space-y-1 text-blue-600 dark:text-blue-400">
                <li>Создайте <strong>Повестку дня</strong> с пунктами для обсуждения</li>
                <li>После заседания оформите <strong>Протокол</strong> с результатами голосования</li>
                <li>На основании протокола создайте <strong>Постановление</strong></li>
                <li>При необходимости сформируйте <strong>Выписку из протокола</strong></li>
              </ol>
            </div>
          </div>
        </div>
      )}

      {/* Форма создания документа организации */}
      {activeTab === "organization" && (isCreating || isRpoMode) && (
        <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
          <h2 className="mb-4 text-xl font-semibold">Создание документа</h2>

          <div className="space-y-4">
            <div>
              <label htmlFor="ppo-head-doc-type" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Тип документа *
              </label>
              <select
                id="ppo-head-doc-type"
                aria-label="Тип документа"
                value={formData.type}
                onChange={(e) => {
                  const newType = e.target.value as DocumentType;
                  setFormData(prev => ({ ...prev, type: newType, templateId: "" }));
                  setSelectedTemplate(null);
                }}
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 dark:border-gray-600 dark:bg-gray-700"
              >
                <option value="AGENDA">Повестка дня</option>
                <option value="PROTOCOL">Протокол</option>
                <option value="RESOLUTION">Постановление</option>
                <option value="PROTOCOL_EXTRACT">Выписка из протокола</option>
              </select>
            </div>

            {templates.length > 0 && (
              <div>
                <label htmlFor="ppo-head-doc-template" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Шаблон документа *
                </label>
                <select
                  id="ppo-head-doc-template"
                  aria-label="Шаблон документа"
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
              <label htmlFor="ppo-head-doc-title" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Название документа *
              </label>
              <input
                id="ppo-head-doc-title"
                type="text"
                aria-label="Название документа"
                value={formData.title}
                onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 dark:border-gray-600 dark:bg-gray-700"
                placeholder="Например: Повестка дня заседания профкома от 15.01.2025"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="ppo-head-meeting-date" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Дата заседания
                </label>
                <input
                  id="ppo-head-meeting-date"
                  type="date"
                  aria-label="Дата заседания"
                  min={DATE_INPUT_MIN}
                  max={DATE_INPUT_MAX}
                  value={formData.meetingDate}
                  onChange={(e) => setFormData(prev => ({ ...prev, meetingDate: normalizeDateInputValue(e.target.value) }))}
                  className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 dark:border-gray-600 dark:bg-gray-700"
                />
              </div>
              <div>
                <label htmlFor="ppo-head-meeting-time" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Время заседания
                </label>
                <input
                  id="ppo-head-meeting-time"
                  type="time"
                  aria-label="Время заседания"
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
                            className="flex items-center gap-2 cursor-pointer hover-surface p-2 rounded"
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
                          className="flex items-center gap-2 cursor-pointer hover-surface p-1 rounded"
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
                          className="flex items-center gap-2 cursor-pointer hover-surface p-1 rounded"
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
                    <label htmlFor="ppo-head-secretary-name" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                      ФИО секретаря
                    </label>
                    <input
                      id="ppo-head-secretary-name"
                      type="text"
                      aria-label="ФИО секретаря"
                      value={formData.secretaryName}
                      onChange={(e) => setFormData(prev => ({ ...prev, secretaryName: e.target.value }))}
                      className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 dark:border-gray-600 dark:bg-gray-700"
                    />
                  </div>
                  <div>
                    <label htmlFor="ppo-head-secretary-job" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                      Должность секретаря
                    </label>
                    <input
                      id="ppo-head-secretary-job"
                      type="text"
                      aria-label="Должность секретаря"
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
                className="rounded-lg border border-gray-300 px-4 py-2 hover-surface dark:border-gray-600"
              >
                Отмена
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Список документов */}
      {activeTab !== "organization" && (
      <div className="space-y-4">
        {currentDocuments.length === 0 ? (
          <div className="rounded-lg border-2 border-dashed border-gray-300 bg-white p-8 text-center dark:border-gray-700 dark:bg-gray-800">
            <p className="text-gray-600 dark:text-gray-400">
              {isRpoMode
                ? "Журнал документов пока пуст."
                : "Личных документов пока нет."}
            </p>
          </div>
        ) : (
          <div className="grid gap-4">
            {currentDocuments.map((doc) => (
              <div
                key={doc.id}
                className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                      {doc.title}
                    </h3>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <span className="inline-flex items-center rounded-full bg-blue-200 px-2.5 py-0.5 text-xs font-medium text-blue-800 dark:bg-blue-900/30 dark:text-blue-400">
                        {getDocumentTypeLabel(doc.type)}
                      </span>
                      <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                        doc.status === "SIGNED" || doc.status === "APPROVED"
                          ? "bg-green-200 text-green-800 dark:bg-green-900/30 dark:text-green-400"
                          : doc.status === "REJECTED"
                          ? "bg-red-200 text-red-800 dark:bg-red-900/30 dark:text-red-400"
                          : "bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-300"
                      }`}>
                        {getDocumentStatusLabel(doc.status)}
                      </span>
                    </div>
                    <p className="mt-2 text-xs text-gray-500">
                      Создан: {new Date(doc.createdAt).toLocaleDateString("ru-RU")}
                    </p>
                  </div>
                  {doc.filePath && (
                    <a
                      href={doc.filePath}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700"
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
      )}
    </div>
  );
}
