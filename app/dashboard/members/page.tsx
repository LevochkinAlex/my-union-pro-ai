"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { alertSuccess, alertError } from "@/lib/alert";
import { Modal } from "@/components/ui/modal";

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

type DetailTab = "profile" | "work" | "family" | "education" | "awards" | "membership" | "documents" | "appeals";

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
  
  // Approve modal state
  const [showApproveModal, setShowApproveModal] = useState(false);
  const [approveTargetIds, setApproveTargetIds] = useState<string[]>([]);
  const [approveDate, setApproveDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [isApproving, setIsApproving] = useState(false);

  // Edit membership joined date modal (chairman/profkom)
  const [showEditJoinedDateModal, setShowEditJoinedDateModal] = useState(false);
  const [editJoinedDateValue, setEditJoinedDateValue] = useState("");
  const [isSavingJoinedDate, setIsSavingJoinedDate] = useState(false);

  // Detail modal state
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [memberDetails, setMemberDetails] = useState<MemberDetails | null>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [detailTab, setDetailTab] = useState<DetailTab>("profile");
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [appeals, setAppeals] = useState<any[]>([]);
  const [loadingAppeals, setLoadingAppeals] = useState(false);
  
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
    (session?.user?.role === "PPO_HEAD" && (session?.user as { isPPOHead?: boolean })?.isPPOHead === true);

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

  const openApproveModal = (memberIds: string[]) => {
    setApproveTargetIds(memberIds);
    setApproveDate(new Date().toISOString().split("T")[0]);
    setShowApproveModal(true);
  };

  const handleApproveConfirm = async () => {
    if (approveTargetIds.length === 0 || !approveDate) return;
    setIsApproving(true);
    let successCount = 0;
    let errorCount = 0;

    for (const id of approveTargetIds) {
      try {
        const response = await fetch(`/api/ppo-head/members/${id}/approve`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ membershipJoinedAt: approveDate }),
        });
        if (response.ok) {
          successCount++;
        } else {
          const err = await response.json().catch(() => ({}));
          console.error("Approve error for", id, err);
          errorCount++;
        }
      } catch {
        errorCount++;
      }
    }

    setIsApproving(false);
    setShowApproveModal(false);
    setApproveTargetIds([]);
    setSelectedIds(new Set());

    if (successCount > 0) {
      alertSuccess(
        approveTargetIds.length === 1
          ? "Заявка одобрена! Пользователю отправлено поздравление."
          : `Одобрено ${successCount} членов`
      );
      await loadMembers();
    }
    if (errorCount > 0) {
      alertError(`Ошибка при одобрении ${errorCount} членов`);
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
      
      // Загружаем обращения пользователя заранее
      loadMemberAppeals(memberId);
    } catch (err) {
      console.error("Error loading member details:", err);
      alertError("Не удалось загрузить данные члена профсоюза");
      setShowDetailModal(false);
    } finally {
      setLoadingDetails(false);
    }
  };

  // Загружаем обращения при открытии карточки или переключении на таб "appeals"
  useEffect(() => {
    if (memberDetails && !loadingAppeals) {
      // Загружаем обращения сразу при открытии карточки, чтобы счетчик в табе был актуальным
      if (appeals.length === 0) {
        loadMemberAppeals(memberDetails.id);
      }
    }
  }, [memberDetails?.id]);
  
  // Перезагружаем обращения при переключении на таб "appeals" (на случай, если они не загрузились)
  useEffect(() => {
    if (detailTab === "appeals" && memberDetails && appeals.length === 0 && !loadingAppeals) {
      loadMemberAppeals(memberDetails.id);
    }
  }, [detailTab]);

  const loadMemberAppeals = async (memberId: string) => {
    try {
      setLoadingAppeals(true);
      console.log(`[loadMemberAppeals] Loading appeals for user ${memberId}`);
      
      // Загружаем обращения через API председателя с фильтром по userId
      const url = `/api/ppo-head/appeals?userId=${encodeURIComponent(memberId)}`;
      console.log(`[loadMemberAppeals] Request URL:`, url);
      
      const response = await fetch(url, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
      });
      
      console.log(`[loadMemberAppeals] Response status:`, response.status, response.statusText);
      
      if (!response.ok) {
        let errorData;
        try {
          const errorText = await response.text();
          console.error("[loadMemberAppeals] Error response text:", errorText);
          errorData = JSON.parse(errorText);
        } catch (parseError) {
          console.error("[loadMemberAppeals] Failed to parse error response:", parseError);
          errorData = { 
            error: `Ошибка ${response.status}: ${response.statusText}`,
            message: "Не удалось обработать ответ сервера",
          };
        }
        
        console.error("[loadMemberAppeals] API error details:", {
          status: response.status,
          statusText: response.statusText,
          error: errorData,
        });
        
        const errorMessage = errorData.message || errorData.error || `Ошибка ${response.status}: ${response.statusText}`;
        throw new Error(errorMessage);
      }
      
      const data = await response.json();
      console.log(`[loadMemberAppeals] Response data:`, data);
      
      if (!data.success) {
        console.error("[loadMemberAppeals] API returned success: false", data);
        throw new Error(data.error || "Ошибка при получении обращений");
      }
      
      console.log(`[loadMemberAppeals] Loaded ${data.tickets?.length || 0} appeals for user ${memberId}`);
      
      if (data.tickets && data.tickets.length > 0) {
        console.log(`[loadMemberAppeals] Appeals data:`, data.tickets);
      } else {
        console.warn(`[loadMemberAppeals] No appeals found for user ${memberId}. Response:`, data);
      }
      
      setAppeals(data.tickets || []);
    } catch (err) {
      console.error("[loadMemberAppeals] Error:", err);
      const errorMessage = err instanceof Error 
        ? err.message 
        : "Не удалось загрузить обращения. Проверьте консоль для деталей.";
      alertError(errorMessage);
      setAppeals([]);
    } finally {
      setLoadingAppeals(false);
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
  const handleBulkApprove = () => {
    if (selectedIds.size === 0) return;
    openApproveModal(Array.from(selectedIds));
  };

  const openEditJoinedDateModal = () => {
    if (!memberDetails?.membershipJoinedAt) {
      setEditJoinedDateValue(new Date().toISOString().split("T")[0]);
    } else {
      setEditJoinedDateValue(new Date(memberDetails.membershipJoinedAt).toISOString().split("T")[0]);
    }
    setShowEditJoinedDateModal(true);
  };

  const handleSaveJoinedDate = async () => {
    if (!memberDetails?.id || !editJoinedDateValue) return;
    setIsSavingJoinedDate(true);
    try {
      const res = await fetch(`/api/ppo-head/members/${memberDetails.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ membershipJoinedAt: editJoinedDateValue }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Ошибка сохранения");
      alertSuccess("Дата вступления обновлена. Потребуется перегенерировать заявления участника.");
      setShowEditJoinedDateModal(false);
      await loadMemberDetails(memberDetails.id);
    } catch (err) {
      alertError(err instanceof Error ? err.message : "Не удалось сохранить дату");
    } finally {
      setIsSavingJoinedDate(false);
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
            {activeTab === "validation" ? "Нет заявок на проверку" : "Нет активных членов"}
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
                      aria-label="Выбрать всех членов"
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
                        aria-label={`Выбрать ${[member.lastName, member.firstName].filter(Boolean).join(" ") || "участника"}`}
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
                              onClick={() => openApproveModal([member.id])}
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

      {/* Модалка одобрения — выбор даты вступления */}
      <Modal
        isOpen={showApproveModal}
        onClose={() => {
          setShowApproveModal(false);
          setApproveTargetIds([]);
        }}
        className="max-w-md"
      >
        <div className="p-6 w-full">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
            Одобрить {approveTargetIds.length > 1 ? `(${approveTargetIds.length})` : "заявку"}
          </h2>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
            Укажите дату зачисления в члены ППО. Если участник вступил ранее (оффлайн), выберите фактическую дату.
          </p>
          <div className="mb-4">
            <label htmlFor="approve-date" className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
              Дата вступления <span className="text-red-500">*</span>
            </label>
            <input
              id="approve-date"
              type="date"
              value={approveDate}
              onChange={(e) => setApproveDate(e.target.value)}
              max={new Date().toISOString().split("T")[0]}
              required
              className="block w-full rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-gray-900 shadow-sm focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-500/20 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleApproveConfirm}
              disabled={isApproving || !approveDate}
              className="flex-1 rounded-lg bg-green-600 px-4 py-2 text-white font-medium hover:bg-green-700 disabled:opacity-50"
            >
              {isApproving ? "Одобрение..." : "Одобрить"}
            </button>
            <button
              onClick={() => {
                setShowApproveModal(false);
                setApproveTargetIds([]);
              }}
              className="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:border-gray-600 dark:hover:bg-gray-700"
            >
              Отмена
            </button>
          </div>
        </div>
      </Modal>

      {/* Модалка редактирования даты вступления (председатель / член профкома) */}
      <Modal
        isOpen={showEditJoinedDateModal && !!memberDetails}
        onClose={() => setShowEditJoinedDateModal(false)}
        className="max-w-md"
      >
        {memberDetails && (
          <div className="p-6">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
              Редактировать дату вступления
            </h2>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
              Участник:{" "}
              <strong>
                {[memberDetails.lastName, memberDetails.firstName, memberDetails.middleName]
                  .filter(Boolean)
                  .join(" ")}
              </strong>
            </p>
            <div className="mb-4">
              <label htmlFor="edit-joined-date" className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                Дата вступления
              </label>
              <input
                id="edit-joined-date"
                type="date"
                value={editJoinedDateValue}
                onChange={(e) => setEditJoinedDateValue(e.target.value)}
                max={new Date().toISOString().split("T")[0]}
                className="block w-full rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-gray-900 shadow-sm focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-500/20 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
              />
            </div>
            <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-200">
              После сохранения потребуется перегенерировать заявления участника (дата вступления в них изменится).
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleSaveJoinedDate}
                disabled={isSavingJoinedDate || !editJoinedDateValue}
                className="flex-1 rounded-lg bg-green-600 px-4 py-2 text-white font-medium hover:bg-green-700 disabled:opacity-50"
              >
                {isSavingJoinedDate ? "Сохранение..." : "Сохранить"}
              </button>
              <button
                onClick={() => setShowEditJoinedDateModal(false)}
                className="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:border-gray-600 dark:hover:bg-gray-700"
              >
                Отмена
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Модалка отклонения */}
      <Modal
        isOpen={showRejectModal && !!selectedMember}
        onClose={() => {
          setShowRejectModal(false);
          setSelectedMember(null);
          setRejectionReason("");
        }}
        className="max-w-md"
      >
        {selectedMember && (
          <div className="p-6">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">Отклонить заявку</h2>
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
              className="w-full rounded-md border border-gray-300 px-3 py-2 dark:border-gray-600 dark:bg-gray-700 dark:text-white mb-4"
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
                className="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:border-gray-600 dark:hover:bg-gray-700"
              >
                Отмена
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Модалка с детальной информацией о члене */}
      {showDetailModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div 
            className="fixed inset-0 bg-black/50 transition-opacity"
            onClick={() => {
              setShowDetailModal(false);
              setMemberDetails(null);
              setAppeals([]); // Очищаем обращения при закрытии
              setDetailTab("profile"); // Сбрасываем таб
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
                    type="button"
                    aria-label="Закрыть"
                    onClick={() => {
                      setShowDetailModal(false);
                      setMemberDetails(null);
                      setAppeals([]); // Очищаем обращения при закрытии
                      setDetailTab("profile"); // Сбрасываем таб
                    }}
                    className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700 dark:hover:text-gray-300"
                  >
                    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
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
                              setShowDetailModal(false);
                              openApproveModal([memberDetails.id]);
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
                          { key: "appeals", label: `Обращения (${appeals.length})` },
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
                          <div className="space-y-1">
                            <span className="block text-sm font-medium text-gray-700 dark:text-gray-300">Дата вступления</span>
                            <div className="flex items-center gap-2">
                              <span className="text-gray-900 dark:text-white">
                                {memberDetails.membershipJoinedAt ? new Date(memberDetails.membershipJoinedAt).toLocaleDateString("ru-RU") : "—"}
                              </span>
                              {memberDetails.membershipStatus === "APPROVED" && (
                                <button
                                  type="button"
                                  onClick={openEditJoinedDateModal}
                                  className="rounded bg-gray-100 dark:bg-gray-700 px-2 py-1 text-xs font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600"
                                >
                                  Изменить
                                </button>
                              )}
                            </div>
                          </div>
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
                          <div className="space-y-1">
                            <span className="block text-sm font-medium text-gray-700 dark:text-gray-300">Дата вступления</span>
                            <div className="flex items-center gap-2">
                              <span className="text-gray-900 dark:text-white">
                                {memberDetails.membershipJoinedAt ? new Date(memberDetails.membershipJoinedAt).toLocaleDateString("ru-RU") : "—"}
                              </span>
                              {memberDetails.membershipStatus === "APPROVED" && (
                                <button
                                  type="button"
                                  onClick={openEditJoinedDateModal}
                                  className="rounded bg-gray-100 dark:bg-gray-700 px-2 py-1 text-xs font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600"
                                >
                                  Изменить
                                </button>
                              )}
                            </div>
                          </div>
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

                    {detailTab === "appeals" && (
                      <div className="space-y-3">
                        {loadingAppeals ? (
                          <div className="flex items-center justify-center py-8">
                            <div className="text-center">
                              <div className="mb-4 inline-block h-6 w-6 animate-spin rounded-full border-4 border-solid border-blue-500 border-r-transparent"></div>
                              <p className="text-sm text-gray-600 dark:text-gray-400">Загрузка обращений...</p>
                            </div>
                          </div>
                        ) : appeals.length === 0 ? (
                          <p className="text-gray-500 dark:text-gray-400 text-center py-8">Обращений нет</p>
                        ) : (
                          appeals.map((appeal) => {
                            const statusColors: Record<string, string> = {
                              PENDING: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
                              IN_PROGRESS: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
                              RESOLVED: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
                              REJECTED: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
                              CLOSED: "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200",
                            };
                            
                            const statusLabels: Record<string, string> = {
                              PENDING: "Ожидание",
                              IN_PROGRESS: "В работе",
                              RESOLVED: "Решено",
                              REJECTED: "Отклонено",
                              CLOSED: "Закрыто",
                            };

                            const typeLabels: Record<string, string> = {
                              LEGAL: "Юридическое",
                              ACCOUNTING: "Бухгалтерское",
                              TECHNICAL: "Техническое",
                              HR: "Кадровое",
                              OTHER: "Прочее",
                            };

                            const priorityColors: Record<string, string> = {
                              LOW: "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200",
                              MEDIUM: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
                              HIGH: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
                              URGENT: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
                            };

                            const priorityLabels: Record<string, string> = {
                              LOW: "Низкая",
                              MEDIUM: "Средняя",
                              HIGH: "Высокая",
                              URGENT: "Срочная",
                            };

                            // Извлекаем текст из HTML для предпросмотра
                            const getTextFromHtml = (html: string) => {
                              if (!html) return "";
                              const div = document.createElement("div");
                              div.innerHTML = html;
                              return div.textContent || div.innerText || "";
                            };

                            return (
                              <div key={appeal.id} className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800 hover:shadow-md transition-shadow">
                                <div className="flex items-start justify-between gap-3">
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center flex-wrap gap-2 mb-2">
                                      <Link 
                                        href={`/dashboard/appeals/ppo-head?id=${appeal.publicId}`}
                                        className="text-sm font-semibold text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
                                      >
                                        #{appeal.publicId}
                                      </Link>
                                      <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${statusColors[appeal.status] || "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200"}`}>
                                        {statusLabels[appeal.status] || appeal.status}
                                      </span>
                                      {appeal.type && (
                                        <span className="text-xs text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-700 px-2 py-1 rounded">
                                          {typeLabels[appeal.type] || appeal.type}
                                        </span>
                                      )}
                                      {appeal.priority && (
                                        <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${priorityColors[appeal.priority] || "bg-gray-100 text-gray-800"}`}>
                                          {priorityLabels[appeal.priority] || appeal.priority}
                                        </span>
                                      )}
                                    </div>
                                    <h4 className="text-base font-semibold text-gray-900 dark:text-white mb-2">
                                      {appeal.title}
                                    </h4>
                                    {appeal.content && (
                                      <div className="text-sm text-gray-600 dark:text-gray-400 mb-3 line-clamp-3">
                                        {getTextFromHtml(appeal.content)}
                                      </div>
                                    )}
                                    <div className="flex items-center flex-wrap gap-3 text-xs text-gray-500 dark:text-gray-400 mb-2">
                                      <span className="flex items-center gap-1">
                                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                        </svg>
                                        {new Date(appeal.createdAt).toLocaleDateString("ru-RU", {
                                          day: "2-digit",
                                          month: "2-digit",
                                          year: "numeric",
                                          hour: "2-digit",
                                          minute: "2-digit",
                                        })}
                                      </span>
                                      {appeal.helpfulRating && (
                                        <span className="flex items-center gap-1">
                                          <span className="text-yellow-500">{"⭐".repeat(appeal.helpfulRating)}</span>
                                          <span className="font-medium text-gray-700 dark:text-gray-300">{appeal.helpfulRating}/5</span>
                                        </span>
                                      )}
                                    </div>
                                    {appeal.helpfulRatingComment && (
                                      <div className="mt-2 p-2 bg-gray-50 dark:bg-gray-700 rounded text-xs text-gray-600 dark:text-gray-400 italic border-l-2 border-yellow-400">
                                        "{appeal.helpfulRatingComment}"
                                      </div>
                                    )}
                                    {appeal.rejectionReason && (
                                      <div className="mt-2 p-2 bg-red-50 dark:bg-red-900/20 rounded text-xs text-red-700 dark:text-red-400 border-l-2 border-red-400">
                                        <strong>Причина отклонения:</strong> {appeal.rejectionReason}
                                      </div>
                                    )}
                                    <div className="flex items-center gap-2 mt-3">
                                      {appeal.chatId && (
                                        <Link
                                          href={`/dashboard/chat?chatId=${appeal.chatId}&ticketId=${appeal.publicId}`}
                                          className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 transition-colors"
                                        >
                                          <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                                          </svg>
                                          Открыть чат
                                        </Link>
                                      )}
                                      <Link
                                        href={`/dashboard/appeals/ppo-head?id=${appeal.publicId}`}
                                        className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-1.5 text-xs font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors"
                                      >
                                        <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                        </svg>
                                        Подробнее
                                      </Link>
                                    </div>
                                  </div>
                                  {appeal.helpfulRating && (
                                    <div className="shrink-0">
                                      <div className="flex flex-col items-center gap-1 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg p-2">
                                        <div className="text-xl leading-none">{"⭐".repeat(appeal.helpfulRating)}</div>
                                        <div className="text-xs font-semibold text-gray-700 dark:text-gray-300">
                                          {appeal.helpfulRating}/5
                                        </div>
                                      </div>
                                    </div>
                                  )}
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

