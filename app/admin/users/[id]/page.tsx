"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useSession } from "next-auth/react";

interface Document {
  id: string;
  type: string;
  status: string;
  title: string;
  fileName: string | null;
  filePath: string | null;
  signedFilePath: string | null;
  createdAt: string;
  updatedAt: string;
}

interface UserData {
  id: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  middleName: string | null;
  phone: string | null;
  authPhone: string | null;
  dateOfBirth: Date | null;
  address: string | null;
  avatarUrl: string | null;
  jobTitle: string | null;
  profession: string | null;
  education: string | null;
  workplace: string | null;
  workplaceInn: string | null;
  directorName: string | null;
  directorPosition: string | null;
  employmentStatus: string | null;
  role: string;
  membershipStatus: string;
  unionCardNumber: string | null;
  membershipJoinedAt: Date | null;
  unionMembershipStatus: string | null;
  awards: string | null;
  aboutMe: string | null;
  hobbies: string | null;
  maritalStatus: string | null;
  spouseInfo: string | null;
  hasChildren: boolean | null;
  childrenInfo: string | null;
  childrenBirthDates: string | null;
  training: string | null;
  additionalInfo: string | null;
  professions: string | null;
  educations: string | null;
  preferredDiscountCity: string | null;
  bestBenefitsUserId: string | null;
  bestBenefitsStatus: string | null;
  isPPOHead: boolean;
  viewMode: string | null;
  createdAt: Date;
  updatedAt: Date;
  emailVerified: Date | null;
  organization: {
    id: string;
    name: string;
  } | null;
  ppoHeadOrganization: {
    id: string;
    name: string;
  } | null;
  documents: Document[];
  membershipHistory: Array<{
    id: string;
    organizationName: string;
    status: string;
    statusDate: Date;
    notes: string | null;
  }>;
}

type TabKey = "profile" | "work" | "family" | "education" | "documents" | "membership" | "knowledge";

interface KnowledgeChunk {
  id: string;
  type: string;
  content: string;
  source: string;
  relatedEntityType?: string;
  relatedEntityId?: string;
  tokens?: number;
  createdAt: string;
}

interface KnowledgeBase {
  id: string;
  userId: string;
  chunks: KnowledgeChunk[];
  chunksCount: number;
  createdAt: string;
  updatedAt: string;
}

const KNOWLEDGE_TYPE_MAP: Record<string, string> = {
  PROFILE_DATA: "Данные профиля",
  INTERACTION: "Взаимодействие с ИИ",
  DOCUMENT_CONTENT: "Документы",
  PREFERENCE: "Предпочтения",
  HISTORY: "История",
  NOTE: "Заметки",
};

const MARITAL_STATUS_MAP: Record<string, string> = {
  SINGLE: "Не женат/Не замужем",
  MARRIED: "Женат/Замужем",
  DIVORCED: "В разводе",
  WIDOWED: "Вдовец/Вдова",
  CIVIL_UNION: "В гражданском браке",
};

const EMPLOYMENT_STATUS_MAP: Record<string, string> = {
  WORK: "Работает",
  STUDY: "Учится",
  RETIREMENT: "На пенсии",
};

export default function AdminUserDetailsPage() {
  const params = useParams();
  const router = useRouter();
  const userId = params.id as string;
  const { data: session } = useSession();
  const [user, setUser] = useState<UserData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [validating, setValidating] = useState(false);
  const [validationComment, setValidationComment] = useState("");
  const [activeTab, setActiveTab] = useState<TabKey>("profile");
  const [deleting, setDeleting] = useState(false);
  // Knowledge base state
  const [knowledgeBase, setKnowledgeBase] = useState<KnowledgeBase | null>(null);
  const [knowledgeLoading, setKnowledgeLoading] = useState(false);
  const [newChunkType, setNewChunkType] = useState("NOTE");
  const [newChunkContent, setNewChunkContent] = useState("");
  const [addingChunk, setAddingChunk] = useState(false);

  const loadUser = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const response = await fetch(`/api/admin/users/${userId}`);
      if (!response.ok) {
        throw new Error("Не удалось загрузить данные пользователя");
      }
      const data = await response.json();
      setUser(data.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Произошла ошибка");
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    loadUser();
  }, [loadUser]);

  // Load knowledge base when tab is selected
  const loadKnowledgeBase = useCallback(async () => {
    if (!userId) return;
    setKnowledgeLoading(true);
    try {
      const response = await fetch(`/api/admin/users/${userId}/knowledge`);
      if (response.ok) {
        const data = await response.json();
        setKnowledgeBase(data);
      }
    } catch (err) {
      console.error("Failed to load knowledge base:", err);
    } finally {
      setKnowledgeLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    if (activeTab === "knowledge") {
      loadKnowledgeBase();
    }
  }, [activeTab, loadKnowledgeBase]);

  const handleSyncProfile = async () => {
    if (!userId) return;
    try {
      const response = await fetch(`/api/admin/users/${userId}/knowledge`, {
        method: "PUT",
      });
      if (response.ok) {
        alert("Профиль синхронизирован с базой знаний");
        loadKnowledgeBase();
      }
    } catch (err) {
      alert("Ошибка синхронизации");
    }
  };

  const handleAddChunk = async () => {
    if (!userId || !newChunkContent.trim()) return;
    setAddingChunk(true);
    try {
      const response = await fetch(`/api/admin/users/${userId}/knowledge`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: newChunkType,
          content: newChunkContent,
        }),
      });
      if (response.ok) {
        setNewChunkContent("");
        loadKnowledgeBase();
      }
    } catch (err) {
      alert("Ошибка добавления");
    } finally {
      setAddingChunk(false);
    }
  };

  const handleDeleteChunk = async (chunkId: string) => {
    if (!confirm("Удалить этот фрагмент?")) return;
    try {
      const response = await fetch(`/api/admin/users/${userId}/knowledge?chunkId=${chunkId}`, {
        method: "DELETE",
      });
      if (response.ok) {
        loadKnowledgeBase();
      }
    } catch (err) {
      alert("Ошибка удаления");
    }
  };

  const handleDelete = async () => {
    if (!confirm(`Вы уверены, что хотите удалить пользователя ${user?.email}?\n\nЭто действие нельзя отменить. Все связанные данные (документы, сообщения, обращения и т.д.) также будут удалены.`)) {
      return;
    }

    setDeleting(true);
    try {
      const response = await fetch(`/api/admin/users/${userId}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Ошибка удаления");
      }

      alert("Пользователь успешно удален");
      router.push("/admin/users");
    } catch (err) {
      alert(err instanceof Error ? err.message : "Ошибка удаления");
    } finally {
      setDeleting(false);
    }
  };

  const handleValidate = async (status: "APPROVED" | "REJECTED") => {
    if (!confirm(`Вы уверены, что хотите ${status === "APPROVED" ? "одобрить" : "отклонить"} этого пользователя?`)) {
      return;
    }

    setValidating(true);
    try {
      const response = await fetch(`/api/admin/users/${userId}/validate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          status,
          comment: validationComment,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Ошибка проверки");
      }

      await loadUser();
      alert(status === "APPROVED" ? "Пользователь успешно одобрен" : "Пользователь отклонен");
      setValidationComment("");
    } catch (err) {
      alert(err instanceof Error ? err.message : "Ошибка проверки");
    } finally {
      setValidating(false);
    }
  };

  if (loading) {
    return <div className="p-8">Загрузка данных пользователя...</div>;
  }

  if (error) {
    return <div className="p-8 text-red-500">{error}</div>;
  }
  
  if (!user) {
    return <div className="p-8">Пользователь не найден.</div>;
  }

  const pendingDocuments = user.documents.filter(
    (doc) => doc.status === "SIGNED" || doc.status === "PENDING_REVIEW" || doc.status === "PENDING_APPROVAL" || doc.status === "PENDING_SIGNATURE"
  );
  const canValidate = pendingDocuments.length > 0 && 
    (user.membershipStatus === "DOCUMENTS_PENDING" || 
     user.membershipStatus === "PENDING_VERIFICATION");

  // Парсим JSON поля
  const parseJsonField = (field: string | null) => {
    if (!field) return null;
    try {
      return JSON.parse(field);
    } catch {
      return null;
    }
  };

  const children = parseJsonField(user.childrenBirthDates);
  const awards = parseJsonField(user.awards);
  const trainings = parseJsonField(user.training);
  const professions = parseJsonField(user.professions);
  const educations = parseJsonField(user.educations);

  return (
    <div className="p-8 space-y-6">
      <div className="mb-6 flex items-center gap-4">
        <Link href="/admin/users" className="text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400">
          ← Назад к списку пользователей
        </Link>
      </div>

      {/* Header с аватаром и действиями */}
      <div className="rounded-lg bg-white p-6 shadow dark:bg-gray-800">
        <div className="flex items-start gap-6">
          {/* Аватар */}
          <div className="flex-shrink-0">
            {user.avatarUrl ? (
              <img src={user.avatarUrl} alt="" className="h-24 w-24 rounded-full object-cover" />
            ) : (
              <div className="flex h-24 w-24 items-center justify-center rounded-full bg-gray-200 dark:bg-gray-700">
                <span className="text-3xl font-bold text-gray-500 dark:text-gray-400">
                  {user.firstName?.[0]}{user.lastName?.[0]}
                </span>
              </div>
            )}
          </div>
          
          {/* Info */}
          <div className="flex-1">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
              {user.lastName} {user.firstName} {user.middleName}
            </h1>
            <p className="text-gray-600 dark:text-gray-400">{user.email}</p>
            <p className="text-gray-600 dark:text-gray-400">{user.phone}</p>
            
            <div className="mt-3 flex flex-wrap gap-2">
              <span className="inline-flex rounded-full bg-blue-100 px-3 py-1 text-xs font-semibold text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                {user.role}
              </span>
              <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${
                user.membershipStatus === "APPROVED"
                  ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                  : user.membershipStatus === "DOCUMENTS_PENDING"
                  ? "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200"
                  : "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200"
              }`}>
                {user.membershipStatus}
              </span>
              {user.isPPOHead && (
                <span className="inline-flex rounded-full bg-purple-100 px-3 py-1 text-xs font-semibold text-purple-800 dark:bg-purple-900 dark:text-purple-200">
                  Председатель ППО
                </span>
              )}
              {user.unionCardNumber && (
                <span className="inline-flex rounded-full bg-indigo-100 px-3 py-1 text-xs font-semibold text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200">
                  Карточка: {user.unionCardNumber}
                </span>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="flex flex-col gap-2">
            {canValidate && (
              <>
                <button
                  onClick={() => handleValidate("APPROVED")}
                  disabled={validating}
                  className="rounded-lg bg-green-600 px-4 py-2 text-white hover:bg-green-700 disabled:opacity-50"
                >
                  ✓ Одобрить
                </button>
                <button
                  onClick={() => handleValidate("REJECTED")}
                  disabled={validating}
                  className="rounded-lg bg-red-600 px-4 py-2 text-white hover:bg-red-700 disabled:opacity-50"
                >
                  ✕ Отклонить
                </button>
              </>
            )}
            {/* Кнопка удаления - только если это не текущий пользователь */}
            {session?.user?.id !== user.id && (
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="rounded-lg border border-red-300 bg-white px-4 py-2 text-red-600 hover:bg-red-50 disabled:opacity-50 dark:border-red-700 dark:bg-gray-800 dark:text-red-400 dark:hover:bg-red-900/20"
              >
                {deleting ? "Удаление..." : "🗑️ Удалить"}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 dark:border-gray-700">
        <nav className="-mb-px flex space-x-4 overflow-x-auto md:space-x-8">
          {[
            { key: "profile", label: "Профиль" },
            { key: "work", label: "Работа" },
            { key: "family", label: "Семья" },
            { key: "education", label: "Образование" },
            { key: "documents", label: `Документы (${user.documents.length})` },
            { key: "membership", label: "Членство" },
            { key: "knowledge", label: "База знаний" },
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key as TabKey)}
              className={`whitespace-nowrap border-b-2 px-1 py-3 text-sm font-medium ${
                activeTab === tab.key
                  ? "border-blue-500 text-blue-600 dark:text-blue-400"
                  : "border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 dark:text-gray-400"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab: Профиль */}
      {activeTab === "profile" && (
        <div className="rounded-lg bg-white p-6 shadow dark:bg-gray-800">
          <h2 className="mb-4 text-lg font-semibold text-gray-900 dark:text-white">Личная информация</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <InfoField label="Email" value={user.email} />
            <InfoField label="Email подтверждён" value={user.emailVerified ? new Date(user.emailVerified).toLocaleDateString("ru-RU") : "Нет"} />
            <InfoField label="Телефон" value={user.phone} />
            <InfoField label="Телефон регистрации" value={user.authPhone} />
            <InfoField label="Дата рождения" value={user.dateOfBirth ? new Date(user.dateOfBirth).toLocaleDateString("ru-RU") : null} />
            <InfoField label="Адрес" value={user.address} className="md:col-span-2 lg:col-span-3" />
            <InfoField label="Город для скидок" value={user.preferredDiscountCity} />
          </div>
          
          {(user.aboutMe || user.hobbies) && (
            <>
              <h3 className="mt-6 mb-4 text-lg font-semibold text-gray-900 dark:text-white">О себе</h3>
              <div className="space-y-4">
                {user.aboutMe && <InfoField label="О себе" value={user.aboutMe} className="col-span-full" />}
                {user.hobbies && <InfoField label="Хобби" value={user.hobbies} className="col-span-full" />}
              </div>
            </>
          )}

          <h3 className="mt-6 mb-4 text-lg font-semibold text-gray-900 dark:text-white">Системная информация</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <InfoField label="Дата регистрации" value={new Date(user.createdAt).toLocaleString("ru-RU")} />
            <InfoField label="Последнее обновление" value={new Date(user.updatedAt).toLocaleString("ru-RU")} />
            <InfoField label="BestBenefits ID" value={user.bestBenefitsUserId} />
            <InfoField label="BestBenefits статус" value={user.bestBenefitsStatus} />
          </div>
        </div>
      )}

      {/* Tab: Работа */}
      {activeTab === "work" && (
        <div className="rounded-lg bg-white p-6 shadow dark:bg-gray-800">
          <h2 className="mb-4 text-lg font-semibold text-gray-900 dark:text-white">Место работы</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <InfoField label="Организация (Профсоюз)" value={user.organization?.name} />
            <InfoField label="Статус занятости" value={user.employmentStatus ? EMPLOYMENT_STATUS_MAP[user.employmentStatus] || user.employmentStatus : null} />
            <InfoField label="Место работы" value={user.workplace} />
            <InfoField label="ИНН работодателя" value={user.workplaceInn} />
            <InfoField label="Руководитель" value={user.directorName} />
            <InfoField label="Должность руководителя" value={user.directorPosition} />
            <InfoField label="Должность" value={user.jobTitle} />
            <InfoField label="Профессия (старое поле)" value={user.profession} />
          </div>

          {professions && professions.length > 0 && (
            <>
              <h3 className="mt-6 mb-4 text-lg font-semibold text-gray-900 dark:text-white">Профессии</h3>
              <div className="space-y-2">
                {professions.map((p: any, i: number) => (
                  <div key={i} className="rounded-lg border border-gray-200 p-3 dark:border-gray-700">
                    <p className="font-medium text-gray-900 dark:text-white">{p.name}</p>
                    {p.experience && <p className="text-sm text-gray-600 dark:text-gray-400">Опыт: {p.experience}</p>}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* Tab: Семья */}
      {activeTab === "family" && (
        <div className="rounded-lg bg-white p-6 shadow dark:bg-gray-800">
          <h2 className="mb-4 text-lg font-semibold text-gray-900 dark:text-white">Семья</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <InfoField label="Семейное положение" value={user.maritalStatus ? MARITAL_STATUS_MAP[user.maritalStatus] || user.maritalStatus : null} />
            <InfoField label="Информация о супруге" value={user.spouseInfo} />
            <InfoField label="Есть дети" value={user.hasChildren === true ? "Да" : user.hasChildren === false ? "Нет" : null} />
            <InfoField label="О детях (старое поле)" value={user.childrenInfo} />
          </div>

          {children && children.length > 0 && (
            <>
              <h3 className="mt-6 mb-4 text-lg font-semibold text-gray-900 dark:text-white">Дети</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {children.map((child: any, i: number) => (
                  <div key={i} className="rounded-lg border border-gray-200 p-4 dark:border-gray-700">
                    <p className="font-medium text-gray-900 dark:text-white">{child.name}</p>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      {child.gender === "М" ? "👦" : "👧"} {child.birthDate ? new Date(child.birthDate).toLocaleDateString("ru-RU") : ""}
                    </p>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* Tab: Образование */}
      {activeTab === "education" && (
        <div className="rounded-lg bg-white p-6 shadow dark:bg-gray-800">
          <h2 className="mb-4 text-lg font-semibold text-gray-900 dark:text-white">Образование</h2>
          <InfoField label="Образование (старое поле)" value={user.education} />

          {educations && educations.length > 0 && (
            <>
              <h3 className="mt-6 mb-4 text-lg font-semibold text-gray-900 dark:text-white">Учебные заведения</h3>
              <div className="space-y-3">
                {educations.map((edu: any, i: number) => (
                  <div key={i} className="rounded-lg border border-gray-200 p-4 dark:border-gray-700">
                    <p className="font-medium text-gray-900 dark:text-white">{edu.institution}</p>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      {edu.level} • {edu.specialty} • {edu.year}
                    </p>
                  </div>
                ))}
              </div>
            </>
          )}

          {trainings && trainings.length > 0 && (
            <>
              <h3 className="mt-6 mb-4 text-lg font-semibold text-gray-900 dark:text-white">Повышение квалификации</h3>
              <div className="space-y-3">
                {trainings.map((t: any, i: number) => (
                  <div key={i} className="rounded-lg border border-gray-200 p-4 dark:border-gray-700">
                    <p className="font-medium text-gray-900 dark:text-white">{t.name}</p>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      {t.year} {t.description && `• ${t.description}`}
                    </p>
                  </div>
                ))}
              </div>
            </>
          )}

          {awards && awards.length > 0 && (
            <>
              <h3 className="mt-6 mb-4 text-lg font-semibold text-gray-900 dark:text-white">Награды</h3>
              <div className="space-y-3">
                {awards.map((a: any, i: number) => (
                  <div key={i} className="rounded-lg border border-gray-200 p-4 dark:border-gray-700">
                    <div className="flex items-center gap-2">
                      <span className={`rounded px-2 py-0.5 text-xs ${
                        a.type === "государственная" ? "bg-yellow-100 text-yellow-800" :
                        a.type === "ведомственная" ? "bg-blue-100 text-blue-800" :
                        "bg-green-100 text-green-800"
                      }`}>
                        {a.type}
                      </span>
                      <span className="text-sm text-gray-500">{a.year}</span>
                    </div>
                    <p className="mt-1 text-gray-900 dark:text-white">{a.description}</p>
                  </div>
                ))}
              </div>
            </>
          )}

          {user.additionalInfo && (
            <>
              <h3 className="mt-6 mb-4 text-lg font-semibold text-gray-900 dark:text-white">Дополнительная информация</h3>
              <p className="text-gray-900 dark:text-white whitespace-pre-wrap">{user.additionalInfo}</p>
            </>
          )}
        </div>
      )}

      {/* Tab: Документы */}
      {activeTab === "documents" && (
        <div className="rounded-lg bg-white p-6 shadow dark:bg-gray-800">
          <h2 className="mb-4 text-lg font-semibold text-gray-900 dark:text-white">
            Документы ({user.documents.length})
          </h2>
          {user.documents.length === 0 ? (
            <p className="text-gray-500 dark:text-gray-400">Документов нет</p>
          ) : (
            <div className="space-y-4">
              {user.documents.map((doc) => (
                <div key={doc.id} className="rounded-lg border border-gray-200 p-4 dark:border-gray-700">
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="font-medium text-gray-900 dark:text-white">{doc.title}</h3>
                      <div className="mt-1 flex flex-wrap gap-2">
                        <span className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-700 dark:bg-gray-700 dark:text-gray-300">
                          {doc.type}
                        </span>
                        <span className={`rounded px-2 py-0.5 text-xs ${
                          doc.status === "SIGNED" ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200" :
                          doc.status === "PENDING_REVIEW" || doc.status === "PENDING_APPROVAL" || doc.status === "PENDING_SIGNATURE" ? "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200" :
                          doc.status === "DRAFT" ? "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200" :
                          "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200"
                        }`}>
                          {doc.status}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                        Создан: {new Date(doc.createdAt).toLocaleString("ru-RU")}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      {doc.filePath && (
                        <a
                          href={`/api/documents/${doc.id}/download`}
                          target="_blank"
                          className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700"
                        >
                          📄 Скачать
                        </a>
                      )}
                      {doc.signedFilePath && (
                        <a
                          href={`/api/documents/${doc.id}/download?signed=true`}
                          target="_blank"
                          className="rounded-lg bg-green-600 px-3 py-1.5 text-sm text-white hover:bg-green-700"
                        >
                          ✓ Подписанный
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab: Членство */}
      {activeTab === "membership" && (
        <div className="rounded-lg bg-white p-6 shadow dark:bg-gray-800">
          <h2 className="mb-4 text-lg font-semibold text-gray-900 dark:text-white">Профсоюзное членство</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <InfoField label="Номер карточки" value={user.unionCardNumber} />
            <InfoField label="Дата вступления" value={user.membershipJoinedAt ? new Date(user.membershipJoinedAt).toLocaleDateString("ru-RU") : null} />
            <InfoField label="Статус членства" value={user.unionMembershipStatus} />
            <InfoField label="Организация" value={user.organization?.name} />
            {user.isPPOHead && user.ppoHeadOrganization && (
              <InfoField label="Председатель ППО" value={user.ppoHeadOrganization.name} />
            )}
          </div>

          {user.membershipHistory && user.membershipHistory.length > 0 && (
            <>
              <h3 className="mt-6 mb-4 text-lg font-semibold text-gray-900 dark:text-white">История членства</h3>
              <div className="space-y-3">
                {user.membershipHistory.map((h) => (
                  <div key={h.id} className="rounded-lg border border-gray-200 p-4 dark:border-gray-700">
                    <div className="flex items-center justify-between">
                      <p className="font-medium text-gray-900 dark:text-white">{h.organizationName}</p>
                      <span className="text-sm text-gray-500">{new Date(h.statusDate).toLocaleDateString("ru-RU")}</span>
                    </div>
                    <p className="text-sm text-gray-600 dark:text-gray-400">{h.status}</p>
                    {h.notes && <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{h.notes}</p>}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* Tab: База знаний */}
      {activeTab === "knowledge" && (
        <div className="space-y-6">
          {/* Действия */}
          <div className="flex items-center gap-4">
            <button
              onClick={handleSyncProfile}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              Синхронизировать профиль
            </button>
            <span className="text-sm text-gray-500 dark:text-gray-400">
              {knowledgeBase ? `${knowledgeBase.chunksCount} фрагментов` : "Загрузка..."}
            </span>
          </div>

          {/* Добавить фрагмент */}
          <div className="rounded-lg bg-white p-6 shadow dark:bg-gray-800">
            <h3 className="mb-4 text-lg font-semibold text-gray-900 dark:text-white">Добавить информацию</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Тип</label>
                <select
                  value={newChunkType}
                  onChange={(e) => setNewChunkType(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                >
                  <option value="NOTE">Заметка</option>
                  <option value="PREFERENCE">Предпочтение</option>
                  <option value="HISTORY">История</option>
                  <option value="PROFILE_DATA">Данные профиля</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Содержание</label>
                <textarea
                  value={newChunkContent}
                  onChange={(e) => setNewChunkContent(e.target.value)}
                  rows={3}
                  className="w-full rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  placeholder="Введите информацию о пользователе..."
                />
              </div>
              <button
                onClick={handleAddChunk}
                disabled={addingChunk || !newChunkContent.trim()}
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors"
              >
                {addingChunk ? "Добавление..." : "Добавить"}
              </button>
            </div>
          </div>

          {/* Список фрагментов */}
          <div className="rounded-lg bg-white p-6 shadow dark:bg-gray-800">
            <h3 className="mb-4 text-lg font-semibold text-gray-900 dark:text-white">Фрагменты базы знаний</h3>
            {knowledgeLoading ? (
              <p className="text-gray-500 dark:text-gray-400">Загрузка...</p>
            ) : knowledgeBase?.chunks.length === 0 ? (
              <p className="text-gray-500 dark:text-gray-400">База знаний пуста. Нажмите &quot;Синхронизировать профиль&quot; для заполнения.</p>
            ) : (
              <div className="space-y-4">
                {knowledgeBase?.chunks.map((chunk) => (
                  <div
                    key={chunk.id}
                    className="rounded-lg border border-gray-200 dark:border-gray-700 p-4"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="px-2 py-0.5 text-xs font-medium rounded bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                            {KNOWLEDGE_TYPE_MAP[chunk.type] || chunk.type}
                          </span>
                          <span className="text-xs text-gray-500 dark:text-gray-400">
                            {chunk.source}
                          </span>
                          {chunk.tokens && (
                            <span className="text-xs text-gray-400">
                              {chunk.tokens} токенов
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-gray-900 dark:text-white whitespace-pre-wrap">
                          {chunk.content}
                        </p>
                        <p className="mt-2 text-xs text-gray-400">
                          {new Date(chunk.createdAt).toLocaleString("ru-RU")}
                        </p>
                      </div>
                      <button
                        onClick={() => handleDeleteChunk(chunk.id)}
                        className="ml-4 p-1 text-red-500 hover:text-red-700"
                        title="Удалить"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// Helper component for info fields
function InfoField({ label, value, className = "" }: { label: string; value: string | null | undefined; className?: string }) {
  return (
    <div className={className}>
      <label className="block text-sm font-medium text-gray-500 dark:text-gray-400">{label}</label>
      <p className="mt-1 text-gray-900 dark:text-white whitespace-pre-wrap break-words">
        {value || <span className="text-gray-400 dark:text-gray-600">—</span>}
      </p>
    </div>
  );
}


