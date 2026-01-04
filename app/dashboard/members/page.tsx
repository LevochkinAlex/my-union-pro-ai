"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { alertSuccess, alertError } from "@/lib/alert";

interface Document {
  id: string;
  type: string;
  status: string;
  title: string;
  fileName: string | null;
  filePath: string | null;
  signedFilePath: string | null;
  createdAt: string;
}

interface Member {
  id: string;
  firstName: string | null;
  lastName: string | null;
  middleName: string | null;
  email: string | null;
  phone: string | null;
  membershipStatus: string;
  createdAt: string;
  documents?: Document[];
}

interface MemberDetails extends Member {
  authPhone: string | null;
  dateOfBirth: string | null;
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
  unionCardNumber: string | null;
  membershipJoinedAt: string | null;
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
  updatedAt: string;
  emailVerified: string | null;
  organization: { id: string; name: string } | null;
}

type DetailTab = "profile" | "work" | "family" | "education" | "awards" | "membership" | "documents";

// Маппинг типов документов
const DOCUMENT_TYPE_MAP: Record<string, string> = {
  MEMBERSHIP_APPLICATION: "Заявление о вступлении",
  CONTRIBUTION_APPLICATION: "Заявление о взносах",
  APPEAL: "Обращение",
  OTHER: "Прочее",
};

// Маппинг статусов документов
const DOCUMENT_STATUS_MAP: Record<string, string> = {
  DRAFT: "Черновик",
  GENERATED: "Сформирован",
  SIGNED: "Подписан",
  PENDING: "На проверке",
  APPROVED: "Одобрен",
  REJECTED: "Отклонен",
  VERIFYING: "Проверяется",
  VERIFIED: "Проверен",
  NEEDS_REVIEW: "Требует внимания",
  FAILED: "Не прошёл проверку",
};

// Функция для получения информативного статуса документа
const getDocumentStatusInfo = (doc: Document) => {
  const hasFile = !!doc.filePath;
  const hasSigned = !!doc.signedFilePath;
  
  if (hasSigned) {
    return { text: "✓ Подписан пользователем", color: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200" };
  }
  if (hasFile && doc.status === "GENERATED") {
    return { text: "⏳ Ожидает подписи пользователя", color: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200" };
  }
  if (doc.status === "APPROVED") {
    return { text: "✓ Одобрен", color: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200" };
  }
  if (doc.status === "REJECTED") {
    return { text: "✕ Отклонён", color: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200" };
  }
  return { text: DOCUMENT_STATUS_MAP[doc.status] || doc.status, color: "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200" };
};

// Маппинг статусов членства
const MEMBERSHIP_STATUS_MAP: Record<string, string> = {
  PENDING: "Ожидает",
  PENDING_VERIFICATION: "Ожидает проверки",
  PROFILE_INCOMPLETE: "Профиль не заполнен",
  DOCUMENTS_PENDING: "Ожидает документов",
  APPROVED: "Одобрен",
  REJECTED: "Отклонён",
  SUSPENDED: "Приостановлен",
  EXCLUDED: "Исключён",
};

// Маппинг статуса в профсоюзе
const UNION_MEMBERSHIP_STATUS_MAP: Record<string, string> = {
  ACCEPTED: "Принят на учёт",
  NOT_ACCEPTED: "Не принят",
  REMOVED: "Снят с учёта",
};

// Маппинг Best Benefits статуса
const BEST_BENEFITS_STATUS_MAP: Record<string, string> = {
  success: "Синхронизирован",
  pending: "Ожидает",
  error: "Ошибка",
  not_synced: "Не синхронизирован",
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

export default function MembersPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<"validation" | "active">("validation");
  const [members, setMembers] = useState<Member[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [selectedMember, setSelectedMember] = useState<Member | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // Detail modal state
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [memberDetails, setMemberDetails] = useState<MemberDetails | null>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [detailTab, setDetailTab] = useState<DetailTab>("profile");
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  
  // Bulk selection state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isBulkProcessing, setIsBulkProcessing] = useState(false);
  
  // Sorting state
  const [sortField, setSortField] = useState<"name" | "date" | "email">("date");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  
  // Компактный режим
  const [compactMode, setCompactMode] = useState(true);

  // Проверяем режим просмотра - страница только для председателей
  const isPPOHead = session?.user?.viewMode === "PPO_HEAD" || 
    (session?.user?.role === "PPO_HEAD" && !(session?.user as any)?.isPPOHead);

  // Редирект для обычных членов
  useEffect(() => {
    if (status === "authenticated" && !isPPOHead) {
      router.replace("/dashboard");
    }
  }, [status, isPPOHead, router]);

  useEffect(() => {
    if (isPPOHead) {
      loadMembers();
    }
  }, [activeTab, isPPOHead]);

  const loadMembers = async () => {
    try {
      setIsLoading(true);
      setError(null);

      const response = await fetch(`/api/ppo-head/members?status=${activeTab === "validation" ? "pending" : "approved"}`);
      if (!response.ok) {
        throw new Error("Ошибка загрузки членов профсоюза");
      }

      const data = await response.json();
      setMembers(data.members || []);
    } catch (err) {
      console.error("Error loading members:", err);
      setError(err instanceof Error ? err.message : "Не удалось загрузить членов профсоюза");
    } finally {
      setIsLoading(false);
    }
  };

  const handleApprove = async (memberId: string) => {
    try {
      const response = await fetch(`/api/ppo-head/members/${memberId}/approve`, {
        method: "POST",
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Ошибка при одобрении");
      }

      alertSuccess("Заявка одобрена! Пользователю отправлено поздравление.");
      await loadMembers();
    } catch (err) {
      console.error("Error approving member:", err);
      alertError(err instanceof Error ? err.message : "Не удалось одобрить заявку");
    }
  };

  const handleReject = async () => {
    if (!selectedMember || !rejectionReason.trim()) {
      alertError("Укажите причину отклонения");
      return;
    }

    try {
      setIsSubmitting(true);
      const response = await fetch(`/api/ppo-head/members/${selectedMember.id}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: rejectionReason.trim() }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Ошибка при отклонении");
      }

      alertSuccess("Заявка отклонена");
      setShowRejectModal(false);
      setSelectedMember(null);
      setRejectionReason("");
      await loadMembers();
    } catch (err) {
      console.error("Error rejecting member:", err);
      alertError(err instanceof Error ? err.message : "Не удалось отклонить заявку");
    } finally {
      setIsSubmitting(false);
    }
  };

  const loadMemberDetails = async (memberId: string) => {
    try {
      setLoadingDetails(true);
      setShowDetailModal(true);
      setDetailTab("profile");

      const response = await fetch(`/api/ppo-head/members/${memberId}`);
      if (!response.ok) {
        throw new Error("Ошибка загрузки данных");
      }

      const data = await response.json();
      setMemberDetails(data.member);
    } catch (err) {
      console.error("Error loading member details:", err);
      alertError("Не удалось загрузить данные члена профсоюза");
      setShowDetailModal(false);
    } finally {
      setLoadingDetails(false);
    }
  };

  const parseJsonField = (field: string | null) => {
    if (!field) return null;
    try {
      return JSON.parse(field);
    } catch {
      return null;
    }
  };

  // Генерация PDF анкеты члена профсоюза через серверный API
  const handleDownloadPdf = async () => {
    if (!memberDetails) return;
    
    setIsGeneratingPdf(true);
    try {
      const response = await fetch(`/api/ppo-head/members/${memberDetails.id}/pdf`);
      
      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: "Ошибка сервера" }));
        throw new Error(error.error || "Ошибка при генерации PDF");
      }
      
      // Получаем blob и скачиваем
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `anketa_${(memberDetails.lastName || "member").toLowerCase().replace(/[^a-zа-яё0-9]/gi, "_")}_${memberDetails.id.slice(0, 8)}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      
      alertSuccess("Анкета успешно скачана");
    } catch (error) {
      console.error("Error generating PDF:", error);
      alertError(error instanceof Error ? error.message : "Ошибка при генерации PDF");
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  // Сортировка членов
  const sortedMembers = [...members].sort((a, b) => {
    let comparison = 0;
    switch (sortField) {
      case "name":
        const nameA = [a.lastName, a.firstName].filter(Boolean).join(" ").toLowerCase();
        const nameB = [b.lastName, b.firstName].filter(Boolean).join(" ").toLowerCase();
        comparison = nameA.localeCompare(nameB, "ru");
        break;
      case "email":
        comparison = (a.email || "").localeCompare(b.email || "");
        break;
      case "date":
      default:
        comparison = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        break;
    }
    return sortDirection === "asc" ? comparison : -comparison;
  });

  // Выбор всех/снятие выбора
  const handleSelectAll = () => {
    if (selectedIds.size === members.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(members.map(m => m.id)));
    }
  };

  // Выбор одного члена
  const handleSelectOne = (id: string) => {
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setSelectedIds(newSet);
  };

  // Bulk одобрение
  const handleBulkApprove = async () => {
    if (selectedIds.size === 0) return;
    
    setIsBulkProcessing(true);
    let successCount = 0;
    let errorCount = 0;
    
    for (const id of selectedIds) {
      try {
        const response = await fetch(`/api/ppo-head/members/${id}/approve`, {
          method: "POST",
        });
        if (response.ok) {
          successCount++;
        } else {
          errorCount++;
        }
      } catch {
        errorCount++;
      }
    }
    
    setIsBulkProcessing(false);
    setSelectedIds(new Set());
    
    if (successCount > 0) {
      alertSuccess(`Одобрено ${successCount} членов`);
      loadMembers();
    }
    if (errorCount > 0) {
      alertError(`Ошибка при одобрении ${errorCount} членов`);
    }
  };

  // Bulk исключение (для активных членов)
  const handleBulkExclude = async () => {
    if (selectedIds.size === 0) return;
    
    const confirmed = window.confirm(`Вы уверены, что хотите исключить ${selectedIds.size} членов?`);
    if (!confirmed) return;
    
    setIsBulkProcessing(true);
    let successCount = 0;
    let errorCount = 0;
    
    for (const id of selectedIds) {
      try {
        const response = await fetch(`/api/ppo-head/members/${id}/exclude`, {
          method: "POST",
        });
        if (response.ok) {
          successCount++;
        } else {
          errorCount++;
        }
      } catch {
        errorCount++;
      }
    }
    
    setIsBulkProcessing(false);
    setSelectedIds(new Set());
    
    if (successCount > 0) {
      alertSuccess(`Исключено ${successCount} членов`);
      loadMembers();
    }
    if (errorCount > 0) {
      alertError(`Ошибка при исключении ${errorCount} членов`);
    }
  };

  // Исключение одного члена
  const handleExclude = async (memberId: string) => {
    const confirmed = window.confirm("Вы уверены, что хотите исключить этого члена профсоюза?");
    if (!confirmed) return;
    
    try {
      const response = await fetch(`/api/ppo-head/members/${memberId}/exclude`, {
        method: "POST",
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Ошибка при исключении");
      }
      
      alertSuccess("Член профсоюза исключён");
      loadMembers();
    } catch (err) {
      alertError(err instanceof Error ? err.message : "Не удалось исключить члена");
    }
  };

  // Сортировка при клике на заголовок
  const handleSort = (field: "name" | "date" | "email") => {
    if (sortField === field) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
  };

  // Сброс выбранных при переключении табов
  useEffect(() => {
    setSelectedIds(new Set());
  }, [activeTab]);

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
            Члены профсоюза
          </h1>
          <p className="mt-2 text-gray-600 dark:text-gray-400">
            Управление заявками на вступление и активными членами
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 dark:border-gray-700">
        <nav className="-mb-px flex space-x-8">
          <button
            onClick={() => setActiveTab("validation")}
            className={`whitespace-nowrap border-b-2 py-4 px-1 text-sm font-medium ${
              activeTab === "validation"
                ? "border-blue-500 text-blue-600 dark:text-blue-400"
                : "border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
            }`}
          >
            Валидация
            {activeTab === "validation" && members.length > 0 && (
              <span className="ml-2 rounded-full bg-blue-100 px-2 py-0.5 text-xs text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                {members.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab("active")}
            className={`whitespace-nowrap border-b-2 py-4 px-1 text-sm font-medium ${
              activeTab === "active"
                ? "border-blue-500 text-blue-600 dark:text-blue-400"
                : "border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
            }`}
          >
            Активные
            {activeTab === "active" && members.length > 0 && (
              <span className="ml-2 rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-800 dark:bg-green-900 dark:text-green-200">
                {members.length}
              </span>
            )}
          </button>
        </nav>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-200">
          {error}
        </div>
      )}

      {/* Bulk Actions Bar */}
      {selectedIds.size > 0 && (
        <div className="rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 p-4 flex items-center justify-between">
          <span className="text-sm font-medium text-blue-800 dark:text-blue-200">
            Выбрано: {selectedIds.size}
          </span>
          <div className="flex gap-2">
            {activeTab === "validation" && (
              <button
                onClick={handleBulkApprove}
                disabled={isBulkProcessing}
                className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
              >
                {isBulkProcessing ? "Обработка..." : `✓ Одобрить (${selectedIds.size})`}
              </button>
            )}
            {activeTab === "active" && (
              <button
                onClick={handleBulkExclude}
                disabled={isBulkProcessing}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                {isBulkProcessing ? "Обработка..." : `✕ Исключить (${selectedIds.size})`}
              </button>
            )}
            <button
              onClick={() => setSelectedIds(new Set())}
              className="rounded-lg bg-gray-200 dark:bg-gray-700 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600"
            >
              Отменить
            </button>
          </div>
        </div>
      )}

      {members.length === 0 ? (
        <div className="rounded-lg border-2 border-dashed border-gray-300 bg-white p-12 text-center dark:border-gray-700 dark:bg-gray-800">
          <svg
            className="mx-auto h-12 w-12 text-gray-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
            />
          </svg>
          <h3 className="mt-4 text-lg font-medium text-gray-900 dark:text-white">
            {activeTab === "validation" ? "Нет заявок на валидацию" : "Нет активных членов"}
          </h3>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
            {activeTab === "validation"
              ? "Все заявки обработаны"
              : "В вашей организации пока нет активных членов"}
          </p>
        </div>
      ) : (
        <div className="rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 dark:bg-gray-900/50">
                <tr>
                  <th className="w-12 px-4 py-3">
                    <input
                      type="checkbox"
                      checked={selectedIds.size === members.length && members.length > 0}
                      onChange={handleSelectAll}
                      className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                  </th>
                  <th 
                    className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800"
                    onClick={() => handleSort("name")}
                  >
                    <div className="flex items-center gap-1">
                      ФИО
                      {sortField === "name" && (
                        <span>{sortDirection === "asc" ? "↑" : "↓"}</span>
                      )}
                    </div>
                  </th>
                  <th 
                    className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800"
                    onClick={() => handleSort("email")}
                  >
                    <div className="flex items-center gap-1">
                      Контакты
                      {sortField === "email" && (
                        <span>{sortDirection === "asc" ? "↑" : "↓"}</span>
                      )}
                    </div>
                  </th>
                  <th 
                    className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800"
                    onClick={() => handleSort("date")}
                  >
                    <div className="flex items-center gap-1">
                      Дата
                      {sortField === "date" && (
                        <span>{sortDirection === "asc" ? "↑" : "↓"}</span>
                      )}
                    </div>
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Документы
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Действия
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {sortedMembers.map((member) => (
                  <tr 
                    key={member.id} 
                    className={`hover:bg-gray-50 dark:hover:bg-gray-700/50 ${
                      selectedIds.has(member.id) ? "bg-blue-50 dark:bg-blue-900/20" : ""
                    }`}
                  >
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(member.id)}
                        onChange={() => handleSelectOne(member.id)}
                        className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => loadMemberDetails(member.id)}
                        className="text-left hover:text-blue-600 dark:hover:text-blue-400"
                      >
                        <div className="font-medium text-gray-900 dark:text-white">
                          {[member.lastName, member.firstName, member.middleName]
                            .filter(Boolean)
                            .join(" ") || "—"}
                        </div>
                      </button>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                      {member.email && <div>{member.email}</div>}
                      {member.phone && <div className="text-xs">{member.phone}</div>}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                      {new Date(member.createdAt).toLocaleDateString("ru-RU")}
                    </td>
                    <td className="px-4 py-3">
                      {member.documents && member.documents.length > 0 ? (
                        <div className="flex gap-1">
                          {member.documents.map((doc) => (
                            <a
                              key={doc.id}
                              href={doc.signedFilePath ? `/api/documents/${doc.id}/download?signed=true` : `/api/documents/${doc.id}/download`}
                              target="_blank"
                              rel="noopener noreferrer"
                              title={DOCUMENT_TYPE_MAP[doc.type] || doc.type}
                              className={`inline-flex items-center gap-1 rounded px-2 py-1 text-xs ${
                                doc.status === "SIGNED" 
                                  ? "bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300"
                                  : "bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300"
                              }`}
                            >
                              📄 {doc.type === "MEMBERSHIP_APPLICATION" ? "Вступл." : doc.type === "CONTRIBUTION_APPLICATION" ? "Взносы" : "Док."}
                            </a>
                          ))}
                        </div>
                      ) : (
                        <span className="text-xs text-gray-400">Нет</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => loadMemberDetails(member.id)}
                          className="rounded bg-gray-100 dark:bg-gray-700 px-2 py-1 text-xs text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600"
                        >
                          Подробнее
                        </button>
                        {activeTab === "validation" && (
                          <>
                            <button
                              onClick={() => handleApprove(member.id)}
                              className="rounded bg-green-600 px-2 py-1 text-xs text-white hover:bg-green-700"
                            >
                              ✓
                            </button>
                            <button
                              onClick={() => {
                                setSelectedMember(member);
                                setShowRejectModal(true);
                              }}
                              className="rounded bg-red-600 px-2 py-1 text-xs text-white hover:bg-red-700"
                            >
                              ✕
                            </button>
                          </>
                        )}
                        {activeTab === "active" && (
                          <button
                            onClick={() => handleExclude(member.id)}
                            className="rounded bg-red-600 px-2 py-1 text-xs text-white hover:bg-red-700"
                          >
                            Исключить
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Модалка отклонения */}
      {showRejectModal && selectedMember && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
          <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-lg dark:border-gray-700 dark:bg-gray-800 w-full max-w-md">
            <h2 className="text-xl font-semibold mb-4">Отклонить заявку</h2>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
              Заявка от:{" "}
              <strong>
                {[selectedMember.lastName, selectedMember.firstName, selectedMember.middleName]
                  .filter(Boolean)
                  .join(" ")}
              </strong>
            </p>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
              Укажите причину отклонения. Это сообщение будет отправлено заявителю в чат и на email.
            </p>
            <textarea
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 dark:border-gray-600 dark:bg-gray-700 mb-4"
              rows={4}
              placeholder="Например: В документах обнаружены ошибки, требуется корректировка..."
            />
            <div className="flex gap-2">
              <button
                onClick={handleReject}
                disabled={isSubmitting || !rejectionReason.trim()}
                className="flex-1 rounded-lg bg-red-600 px-4 py-2 text-white hover:bg-red-700 disabled:opacity-50"
              >
                {isSubmitting ? "Отклонение..." : "Отклонить заявку"}
              </button>
              <button
                onClick={() => {
                  setShowRejectModal(false);
                  setSelectedMember(null);
                  setRejectionReason("");
                }}
                className="flex-1 rounded-lg border border-gray-300 px-4 py-2 hover:bg-gray-50 dark:border-gray-600 dark:hover:bg-gray-700"
              >
                Отмена
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Модалка с детальной информацией о члене */}
      {showDetailModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div 
            className="fixed inset-0 bg-black/50 transition-opacity"
            onClick={() => {
              setShowDetailModal(false);
              setMemberDetails(null);
            }}
          />
          
          <div className="flex min-h-full items-center justify-center p-4">
            <div className="relative w-full max-w-4xl rounded-xl border border-gray-200 bg-white shadow-2xl dark:border-gray-700 dark:bg-gray-800">
              {/* Header */}
              <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4 dark:border-gray-700">
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                  Карточка члена профсоюза
                </h2>
                <div className="flex items-center gap-2">
                  {memberDetails && (
                    <button
                      onClick={handleDownloadPdf}
                      disabled={isGeneratingPdf}
                      className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                    >
                      {isGeneratingPdf ? (
                        <>
                          <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                          </svg>
                          Генерация...
                        </>
                      ) : (
                        <>
                          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                          </svg>
                          Скачать PDF
                        </>
                      )}
                    </button>
                  )}
                  <button
                    onClick={() => {
                      setShowDetailModal(false);
                      setMemberDetails(null);
                    }}
                    className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700 dark:hover:text-gray-300"
                  >
                    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>

              {/* Body */}
              <div className="max-h-[calc(100vh-200px)] overflow-y-auto">
                {loadingDetails ? (
                  <div className="flex items-center justify-center py-12">
                    <div className="text-center">
                      <div className="mb-4 inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-blue-500 border-r-transparent"></div>
                      <p className="text-gray-600 dark:text-gray-400">Загрузка данных...</p>
                    </div>
                  </div>
                ) : memberDetails ? (
                  <div className="p-6">
                    {/* Profile Header */}
                    <div className="flex items-start gap-4 mb-6">
                      {memberDetails.avatarUrl ? (
                        <img src={memberDetails.avatarUrl} alt="" className="h-20 w-20 rounded-full object-cover" />
                      ) : (
                        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-gray-200 dark:bg-gray-700">
                          <span className="text-2xl font-bold text-gray-500 dark:text-gray-400">
                            {memberDetails.firstName?.[0]}{memberDetails.lastName?.[0]}
                          </span>
                        </div>
                      )}
                      <div className="flex-1">
                        <h3 className="text-xl font-bold text-gray-900 dark:text-white">
                          {memberDetails.lastName} {memberDetails.firstName} {memberDetails.middleName}
                        </h3>
                        <p className="text-gray-600 dark:text-gray-400">{memberDetails.email}</p>
                        <p className="text-gray-600 dark:text-gray-400">{memberDetails.phone}</p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${
                            memberDetails.membershipStatus === "APPROVED"
                              ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                              : memberDetails.membershipStatus === "DOCUMENTS_PENDING"
                              ? "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200"
                              : memberDetails.membershipStatus === "EXCLUDED" || memberDetails.membershipStatus === "REJECTED"
                              ? "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200"
                              : "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200"
                          }`}>
                            {MEMBERSHIP_STATUS_MAP[memberDetails.membershipStatus] || memberDetails.membershipStatus}
                          </span>
                          {memberDetails.unionCardNumber && (
                            <span className="inline-flex rounded-full bg-indigo-100 px-3 py-1 text-xs font-semibold text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200">
                              № {memberDetails.unionCardNumber}
                            </span>
                          )}
                        </div>
                      </div>
                      
                      {/* Quick Actions */}
                      {memberDetails.membershipStatus !== "APPROVED" && (
                        <div className="flex flex-col gap-2">
                          <button
                            onClick={() => {
                              handleApprove(memberDetails.id);
                              setShowDetailModal(false);
                            }}
                            className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700"
                          >
                            ✓ Одобрить
                          </button>
                          <button
                            onClick={() => {
                              setSelectedMember(memberDetails);
                              setShowDetailModal(false);
                              setShowRejectModal(true);
                            }}
                            className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
                          >
                            ✕ Отклонить
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Tabs */}
                    <div className="border-b border-gray-200 dark:border-gray-700 mb-6">
                      <nav className="-mb-px flex space-x-4 overflow-x-auto">
                        {[
                          { key: "profile", label: "Профиль" },
                          { key: "work", label: "Работа" },
                          { key: "family", label: "Семья" },
                          { key: "education", label: "Образование" },
                          { key: "awards", label: "Награды" },
                          { key: "membership", label: "Членство" },
                          { key: "documents", label: `Документы (${memberDetails.documents?.length || 0})` },
                        ].map((tab) => (
                          <button
                            key={tab.key}
                            onClick={() => setDetailTab(tab.key as DetailTab)}
                            className={`whitespace-nowrap border-b-2 px-1 py-3 text-sm font-medium ${
                              detailTab === tab.key
                                ? "border-blue-500 text-blue-600 dark:text-blue-400"
                                : "border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 dark:text-gray-400"
                            }`}
                          >
                            {tab.label}
                          </button>
                        ))}
                      </nav>
                    </div>

                    {/* Tab Content */}
                    {detailTab === "profile" && (
                      <div className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <InfoField label="Email" value={memberDetails.email} />
                          <InfoField label="Телефон" value={memberDetails.phone} />
                          <InfoField label="Телефон регистрации" value={memberDetails.authPhone} />
                          <InfoField label="Дата рождения" value={memberDetails.dateOfBirth ? new Date(memberDetails.dateOfBirth).toLocaleDateString("ru-RU") : null} />
                          <InfoField label="Адрес" value={memberDetails.address} className="md:col-span-2" />
                          <InfoField label="Город для скидок" value={memberDetails.preferredDiscountCity} />
                          <InfoField label="Дата вступления" value={memberDetails.membershipJoinedAt ? new Date(memberDetails.membershipJoinedAt).toLocaleDateString("ru-RU") : null} />
                        </div>
                        {(memberDetails.aboutMe || memberDetails.hobbies) && (
                          <div className="mt-4 border-t border-gray-200 pt-4 dark:border-gray-700">
                            <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">О себе</h4>
                            <div className="space-y-3">
                              {memberDetails.aboutMe && <InfoField label="О себе" value={memberDetails.aboutMe} />}
                              {memberDetails.hobbies && <InfoField label="Хобби" value={memberDetails.hobbies} />}
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {detailTab === "work" && (
                      <div className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <InfoField label="Организация (Профсоюз)" value={memberDetails.organization?.name} />
                          <InfoField label="Статус занятости" value={memberDetails.employmentStatus ? EMPLOYMENT_STATUS_MAP[memberDetails.employmentStatus] || memberDetails.employmentStatus : null} />
                          <InfoField label="Место работы" value={memberDetails.workplace} />
                          <InfoField label="ИНН работодателя" value={memberDetails.workplaceInn} />
                          <InfoField label="Руководитель" value={memberDetails.directorName} />
                          <InfoField label="Должность руководителя" value={memberDetails.directorPosition} />
                          <InfoField label="Должность" value={memberDetails.jobTitle} />
                          <InfoField label="Профессия" value={memberDetails.profession} />
                        </div>
                        {(() => {
                          const professions = parseJsonField(memberDetails.professions);
                          return professions && professions.length > 0 && (
                            <div className="mt-4 border-t border-gray-200 pt-4 dark:border-gray-700">
                              <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">Профессии</h4>
                              <div className="space-y-2">
                                {professions.map((p: any, i: number) => (
                                  <div key={i} className="rounded-lg border border-gray-200 p-3 dark:border-gray-700">
                                    <p className="font-medium text-gray-900 dark:text-white">{p.name}</p>
                                    {p.experience && <p className="text-sm text-gray-600 dark:text-gray-400">Опыт: {p.experience}</p>}
                                  </div>
                                ))}
                              </div>
                            </div>
                          );
                        })()}
                      </div>
                    )}

                    {detailTab === "family" && (
                      <div className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <InfoField label="Семейное положение" value={memberDetails.maritalStatus ? MARITAL_STATUS_MAP[memberDetails.maritalStatus] || memberDetails.maritalStatus : null} />
                          <InfoField label="Информация о супруге" value={memberDetails.spouseInfo} />
                          <InfoField label="Есть дети" value={memberDetails.hasChildren === true ? "Да" : memberDetails.hasChildren === false ? "Нет" : null} />
                          <InfoField label="О детях" value={memberDetails.childrenInfo} />
                        </div>
                        {(() => {
                          const children = parseJsonField(memberDetails.childrenBirthDates);
                          return children && children.length > 0 && (
                            <div className="mt-4 border-t border-gray-200 pt-4 dark:border-gray-700">
                              <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">Дети</h4>
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
                            </div>
                          );
                        })()}
                      </div>
                    )}

                    {detailTab === "education" && (
                      <div className="space-y-4">
                        <InfoField label="Образование" value={memberDetails.education} />
                        
                        {(() => {
                          const educations = parseJsonField(memberDetails.educations);
                          return educations && educations.length > 0 && (
                            <div className="mt-4 border-t border-gray-200 pt-4 dark:border-gray-700">
                              <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">Учебные заведения</h4>
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
                            </div>
                          );
                        })()}

                        {(() => {
                          const trainings = parseJsonField(memberDetails.training);
                          return trainings && trainings.length > 0 && (
                            <div className="mt-4 border-t border-gray-200 pt-4 dark:border-gray-700">
                              <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">Повышение квалификации</h4>
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
                            </div>
                          );
                        })()}

                        {memberDetails.additionalInfo && (
                          <div className="mt-4 border-t border-gray-200 pt-4 dark:border-gray-700">
                            <InfoField label="Дополнительная информация" value={memberDetails.additionalInfo} />
                          </div>
                        )}
                      </div>
                    )}

                    {detailTab === "awards" && (
                      <div className="space-y-4">
                        {(() => {
                          const awards = parseJsonField(memberDetails.awards);
                          return awards && awards.length > 0 ? (
                            <div className="space-y-3">
                              {awards.map((a: any, i: number) => (
                                <div key={i} className="rounded-lg border border-gray-200 p-4 dark:border-gray-700">
                                  <div className="flex items-center gap-2 mb-2">
                                    <span className="text-2xl">🏆</span>
                                    <span className={`rounded-full px-3 py-1 text-xs font-medium ${
                                      a.type === "государственная" ? "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200" :
                                      a.type === "ведомственная" ? "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200" :
                                      a.type === "профсоюзная" ? "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200" :
                                      "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                                    }`}>
                                      {a.type || "Награда"}
                                    </span>
                                    {a.year && <span className="text-sm text-gray-500 dark:text-gray-400">{a.year} г.</span>}
                                  </div>
                                  <p className="text-gray-900 dark:text-white">{a.description}</p>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="text-gray-500 dark:text-gray-400 text-center py-8">Наград нет</p>
                          );
                        })()}
                      </div>
                    )}

                    {detailTab === "membership" && (
                      <div className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <InfoField label="Статус членства" value={MEMBERSHIP_STATUS_MAP[memberDetails.membershipStatus] || memberDetails.membershipStatus} />
                          {memberDetails.unionCardNumber && <InfoField label="Номер профсоюзного билета" value={memberDetails.unionCardNumber} />}
                          {memberDetails.membershipJoinedAt && <InfoField label="Дата вступления" value={new Date(memberDetails.membershipJoinedAt).toLocaleDateString("ru-RU")} />}
                          {memberDetails.unionMembershipStatus && <InfoField label="Статус в профсоюзе" value={UNION_MEMBERSHIP_STATUS_MAP[memberDetails.unionMembershipStatus] || memberDetails.unionMembershipStatus} />}
                          {memberDetails.organization?.name && <InfoField label="Организация" value={memberDetails.organization.name} />}
                          {memberDetails.bestBenefitsUserId && <InfoField label="Best Benefits ID" value={memberDetails.bestBenefitsUserId} />}
                          {memberDetails.bestBenefitsStatus && <InfoField label="Best Benefits статус" value={BEST_BENEFITS_STATUS_MAP[memberDetails.bestBenefitsStatus] || memberDetails.bestBenefitsStatus} />}
                          <InfoField label="Email подтверждён" value={memberDetails.emailVerified ? new Date(memberDetails.emailVerified).toLocaleDateString("ru-RU") : "Нет"} />
                        </div>
                      </div>
                    )}

                    {detailTab === "documents" && (
                      <div className="space-y-4">
                        {!memberDetails.documents || memberDetails.documents.length === 0 ? (
                          <p className="text-gray-500 dark:text-gray-400 text-center py-8">Документов нет</p>
                        ) : (
                          memberDetails.documents.map((doc) => {
                            const statusInfo = getDocumentStatusInfo(doc);
                            return (
                              <div key={doc.id} className="rounded-lg border border-gray-200 p-4 dark:border-gray-700">
                                <div className="flex items-start justify-between gap-4">
                                  <div className="flex-1 min-w-0">
                                    <h4 className="font-medium text-gray-900 dark:text-white">{doc.title}</h4>
                                    <div className="mt-2 flex flex-wrap gap-2">
                                      <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-medium text-blue-700 dark:bg-blue-900 dark:text-blue-300">
                                        {DOCUMENT_TYPE_MAP[doc.type] || doc.type}
                                      </span>
                                      <span className={`rounded-full px-3 py-1 text-xs font-medium ${statusInfo.color}`}>
                                        {statusInfo.text}
                                      </span>
                                    </div>
                                    <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                                      Создан: {new Date(doc.createdAt).toLocaleString("ru-RU")}
                                    </p>
                                    
                                    {/* Дополнительная информация о статусе */}
                                    {!doc.signedFilePath && doc.filePath && (
                                      <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">
                                        ⚠️ Документ сформирован, но пользователь ещё не загрузил подписанную версию
                                      </p>
                                    )}
                                  </div>
                                  
                                  <div className="flex flex-col gap-2 shrink-0">
                                    {doc.filePath && (
                                      <a
                                        href={`/api/documents/${doc.id}/download`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700"
                                        title="Скачать сформированный документ"
                                      >
                                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                        </svg>
                                        Шаблон
                                      </a>
                                    )}
                                    {doc.signedFilePath && (
                                      <a
                                        href={`/api/documents/${doc.id}/download?signed=true`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-flex items-center gap-1.5 rounded-lg bg-green-600 px-3 py-1.5 text-sm text-white hover:bg-green-700"
                                        title="Скачать подписанный документ от пользователя"
                                      >
                                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                        </svg>
                                        Подписанный
                                      </a>
                                    )}
                                    {!doc.filePath && !doc.signedFilePath && (
                                      <span className="text-xs text-gray-400 dark:text-gray-500 italic">
                                        Файлы отсутствуют
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>
                            );
                          })
                        )}
                      </div>
                    )}
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Helper component for info fields - не показывает поле если значение пустое
function InfoField({ label, value, className = "", showEmpty = false }: { label: string; value: string | null | undefined; className?: string; showEmpty?: boolean }) {
  // Если значение пустое и не нужно показывать пустые поля - возвращаем null
  if (!value && !showEmpty) {
    return null;
  }
  
  return (
    <div className={className}>
      <label className="block text-sm font-medium text-gray-500 dark:text-gray-400">{label}</label>
      <p className="mt-1 text-gray-900 dark:text-white whitespace-pre-wrap break-words">
        {value || <span className="text-gray-400 dark:text-gray-600">—</span>}
      </p>
    </div>
  );
}

