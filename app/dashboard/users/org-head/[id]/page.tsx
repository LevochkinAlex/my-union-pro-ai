"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { Check, Download, Trash2, X } from "lucide-react";
import {
  getMembershipStatusBadgeClass,
  getDocumentStatusLabel,
  getMembershipStatusLabel,
  getUserRoleLabel,
  EMPLOYMENT_STATUS_LABELS,
  MARITAL_STATUS_LABELS,
} from "@/lib/status-labels";
import UserDetailsForm from "@/components/admin/users/UserDetailsForm";

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

interface MembershipHistoryItem {
  id: string;
  organizationName: string;
  status: string;
  statusDate: string | Date;
  notes: string | null;
}

interface UserData {
  id: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  middleName: string | null;
  phone: string | null;
  authPhone: string | null;
  dateOfBirth: Date | string | null;
  address: string | null;
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
  createdAt: string;
  updatedAt: string;
  emailVerified: Date | string | null;
  isPPOHead?: boolean;
  isRPOHead?: boolean;
  avatarUrl: string | null;
  unionCardNumber: string | null;
  membershipJoinedAt: Date | string | null;
  unionMembershipStatus: string | null;
  preferredDiscountCity: string | null;
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
  awards: string | null;
  organization: { id: string; name: string; inn?: string | null } | null;
  ppoHeadOrganization: { id: string; name: string } | null;
  rpoHeadOrganization: { id: string; name: string } | null;
  effectiveOrganization?: { id: string; name: string; inn?: string | null } | null;
  effectiveWorkplace?: string | null;
  effectiveWorkplaceInn?: string | null;
  documents: Document[];
  membershipHistory: MembershipHistoryItem[];
}

type TabKey = "profile" | "work" | "family" | "education" | "documents" | "membership" | "edit";

function InfoField({
  label,
  value,
  className = "",
}: {
  label: string;
  value: string | null | undefined;
  className?: string;
}) {
  return (
    <div className={className}>
      <label className="block text-sm font-medium text-gray-500 dark:text-gray-400">{label}</label>
      <p className="mt-1 whitespace-pre-wrap break-words text-gray-900 dark:text-white">
        {value || <span className="text-gray-400 dark:text-gray-600">—</span>}
      </p>
    </div>
  );
}

export default function OrgHeadUserDetailPage() {
  const params = useParams();
  const router = useRouter();
  const userId = params.id as string;
  const { data: session } = useSession();
  const [user, setUser] = useState<UserData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [validating, setValidating] = useState(false);
  const [validationComment, setValidationComment] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [activeTab, setActiveTab] = useState<TabKey>("profile");

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

  const handleDelete = async () => {
    if (!user) return;
    if (
      !confirm(
        `Вы уверены, что хотите удалить пользователя ${user.email}?\n\nЭто действие нельзя отменить.`
      )
    ) {
      return;
    }
    setDeleting(true);
    try {
      const response = await fetch(`/api/admin/users/${userId}`, { method: "DELETE" });
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || "Ошибка удаления");
      }
      router.push("/dashboard/users/org-head");
    } catch (err) {
      alert(err instanceof Error ? err.message : "Ошибка удаления");
    } finally {
      setDeleting(false);
    }
  };

  const handleValidate = async (status: "APPROVED" | "REJECTED") => {
    if (
      !confirm(
        `Вы уверены, что хотите ${status === "APPROVED" ? "одобрить" : "отклонить"} этого пользователя?`
      )
    ) {
      return;
    }
    setValidating(true);
    try {
      const response = await fetch(`/api/admin/users/${userId}/validate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, comment: validationComment }),
      });
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || "Ошибка проверки");
      }
      await loadUser();
      setValidationComment("");
      alert(status === "APPROVED" ? "Пользователь одобрен" : "Пользователь отклонён");
    } catch (err) {
      alert(err instanceof Error ? err.message : "Ошибка проверки");
    } finally {
      setValidating(false);
    }
  };

  if (loading) {
    return (
      <div className="min-w-0 w-full space-y-6 py-4">Загрузка данных пользователя...</div>
    );
  }

  if (error || !user) {
    return (
      <div className="min-w-0 w-full space-y-6 py-4">
        <p className="text-red-500">{error || "Пользователь не найден"}</p>
        <Link href="/dashboard/users/org-head" className="text-blue-600 hover:underline">
          ← К списку пользователей
        </Link>
      </div>
    );
  }

  const canValidate =
    user.membershipStatus !== "APPROVED" &&
    user.membershipStatus !== "REJECTED" &&
    user.membershipStatus !== "SUSPENDED";

  const formUser = {
    id: user.id,
    email: user.email ?? "",
    firstName: user.firstName ?? "",
    lastName: user.lastName ?? "",
    middleName: user.middleName ?? "",
    phone: user.phone ?? "",
    dateOfBirth:
      user.dateOfBirth == null
        ? null
        : typeof user.dateOfBirth === "string"
          ? user.dateOfBirth
          : (user.dateOfBirth as Date)?.toISOString?.() ?? null,
    address: user.address ?? null,
    jobTitle: user.jobTitle ?? null,
    profession: user.profession ?? null,
    education: user.education ?? null,
    role: user.role,
    membershipStatus: user.membershipStatus,
    createdAt:
      typeof user.createdAt === "string"
        ? user.createdAt
        : (user.createdAt as unknown as Date)?.toISOString?.() ?? new Date().toISOString(),
    updatedAt:
      typeof user.updatedAt === "string"
        ? user.updatedAt
        : (user.updatedAt as unknown as Date)?.toISOString?.() ?? new Date().toISOString(),
  };

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

  const tabs: { key: TabKey; label: string }[] = [
    { key: "profile", label: "Профиль" },
    { key: "work", label: "Работа" },
    { key: "family", label: "Семья" },
    { key: "education", label: "Образование" },
    { key: "documents", label: `Документы (${user.documents?.length ?? 0})` },
    { key: "membership", label: "Членство" },
    { key: "edit", label: "Редактировать" },
  ];

  return (
    <div className="min-w-0 w-full space-y-6">
      <div className="mb-6 flex items-center gap-4">
        <Link
          href="/dashboard/users/org-head"
          className="text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400"
        >
          ← Назад к списку пользователей
        </Link>
      </div>

      {/* Header */}
      <div className="rounded-lg bg-white p-6 shadow dark:bg-gray-800">
        <div className="flex items-start gap-6">
          <div className="flex-shrink-0">
            {user.avatarUrl ? (
              <img src={user.avatarUrl} alt="" className="h-24 w-24 rounded-full object-cover" />
            ) : (
              <div className="flex h-24 w-24 items-center justify-center rounded-full bg-gray-200 dark:bg-gray-700">
                <span className="text-3xl font-bold text-gray-500 dark:text-gray-400">
                  {user.firstName?.[0]}
                  {user.lastName?.[0]}
                </span>
              </div>
            )}
          </div>
          <div className="flex-1">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
              {user.lastName} {user.firstName} {user.middleName}
            </h1>
            <p className="text-gray-600 dark:text-gray-400">{user.email}</p>
            <p className="text-gray-600 dark:text-gray-400">{user.phone}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <span className="inline-flex rounded-full bg-blue-100 px-3 py-1 text-xs font-semibold text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                {getUserRoleLabel(user.role, user.isPPOHead)}
              </span>
              <span
                className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${getMembershipStatusBadgeClass(
                  user.membershipStatus
                )}`}
              >
                {getMembershipStatusLabel(user.membershipStatus)}
              </span>
              {user.isPPOHead && (
                <span className="inline-flex rounded-full bg-purple-100 px-3 py-1 text-xs font-semibold text-purple-800 dark:bg-purple-900 dark:text-purple-200">
                  Председатель ППО
                </span>
              )}
              {user.isRPOHead && user.rpoHeadOrganization && (
                <span className="inline-flex rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800 dark:bg-amber-900 dark:text-amber-200">
                  Председатель РПО
                </span>
              )}
              {user.unionCardNumber && (
                <span className="inline-flex rounded-full bg-indigo-100 px-3 py-1 text-xs font-semibold text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200">
                  Карточка: {user.unionCardNumber}
                </span>
              )}
            </div>
          </div>
          <div className="flex flex-col gap-2">
            {canValidate && (
              <>
                <button
                  onClick={() => handleValidate("APPROVED")}
                  disabled={validating}
                  className="rounded-lg bg-green-600 px-4 py-2 text-white hover:bg-green-700 disabled:opacity-50"
                >
                  <span className="inline-flex items-center gap-1.5">
                    <Check className="h-4 w-4" />
                    Одобрить
                  </span>
                </button>
                <button
                  onClick={() => handleValidate("REJECTED")}
                  disabled={validating}
                  className="rounded-lg bg-red-600 px-4 py-2 text-white hover:bg-red-700 disabled:opacity-50"
                >
                  <span className="inline-flex items-center gap-1.5">
                    <X className="h-4 w-4" />
                    Отклонить
                  </span>
                </button>
              </>
            )}
            {session?.user?.id !== user.id && (
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="rounded-lg border border-red-300 bg-white px-4 py-2 text-red-600 hover:bg-red-50 disabled:opacity-50 dark:border-red-700 dark:bg-gray-800 dark:text-red-400 dark:hover:bg-red-900/20"
              >
                {deleting ? (
                  "Удаление..."
                ) : (
                  <span className="inline-flex items-center gap-1.5">
                    <Trash2 className="h-4 w-4" />
                    Удалить
                  </span>
                )}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 dark:border-gray-700">
        <nav className="-mb-px flex space-x-4 overflow-x-auto md:space-x-8">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
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
          <h2 className="mb-4 text-lg font-semibold text-gray-900 dark:text-white">
            Личная информация
          </h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            <InfoField label="Email" value={user.email} />
            <InfoField
              label="Email подтверждён"
              value={
                user.emailVerified
                  ? new Date(user.emailVerified).toLocaleDateString("ru-RU")
                  : "Нет"
              }
            />
            <InfoField label="Телефон" value={user.phone} />
            <InfoField label="Телефон регистрации" value={user.authPhone} />
            <InfoField
              label="Дата рождения"
              value={
                user.dateOfBirth ? new Date(user.dateOfBirth).toLocaleDateString("ru-RU") : null
              }
            />
            <InfoField label="Адрес" value={user.address} className="md:col-span-2 lg:col-span-3" />
            <InfoField label="Город для скидок" value={user.preferredDiscountCity} />
          </div>

          {(user.aboutMe || user.hobbies) && (
            <>
              <h3 className="mb-4 mt-6 text-lg font-semibold text-gray-900 dark:text-white">
                О себе
              </h3>
              <div className="space-y-4">
                {user.aboutMe && (
                  <InfoField label="О себе" value={user.aboutMe} className="col-span-full" />
                )}
                {user.hobbies && (
                  <InfoField label="Хобби" value={user.hobbies} className="col-span-full" />
                )}
              </div>
            </>
          )}

          <h3 className="mb-4 mt-6 text-lg font-semibold text-gray-900 dark:text-white">
            Системная информация
          </h3>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            <InfoField
              label="Дата регистрации"
              value={new Date(user.createdAt).toLocaleString("ru-RU")}
            />
            <InfoField
              label="Последнее обновление"
              value={new Date(user.updatedAt).toLocaleString("ru-RU")}
            />
          </div>
        </div>
      )}

      {/* Tab: Работа */}
      {activeTab === "work" && (
        <div className="rounded-lg bg-white p-6 shadow dark:bg-gray-800">
          <h2 className="mb-4 text-lg font-semibold text-gray-900 dark:text-white">
            Место работы
          </h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <InfoField
              label="Организация (Профсоюз)"
              value={user.effectiveOrganization?.name || user.organization?.name}
            />
            <InfoField
              label="Статус занятости"
              value={
                user.employmentStatus
                  ? EMPLOYMENT_STATUS_LABELS[user.employmentStatus] || user.employmentStatus
                  : null
              }
            />
            <InfoField
              label="Место работы"
              value={user.effectiveWorkplace || user.workplace}
            />
            <InfoField
              label="ИНН работодателя"
              value={
                user.effectiveWorkplaceInn ||
                user.workplaceInn ||
                (user.effectiveOrganization as { inn?: string })?.inn
              }
            />
            <InfoField label="Руководитель" value={user.directorName} />
            <InfoField label="Должность руководителя" value={user.directorPosition} />
            <InfoField label="Должность" value={user.jobTitle} />
            <InfoField label="Профессия" value={user.profession} />
          </div>

          {professions && professions.length > 0 && (
            <>
              <h3 className="mb-4 mt-6 text-lg font-semibold text-gray-900 dark:text-white">
                Профессии
              </h3>
              <div className="space-y-2">
                {professions.map((p: { name?: string; experience?: string }, i: number) => (
                  <div
                    key={i}
                    className="rounded-lg border border-gray-200 p-3 dark:border-gray-700"
                  >
                    <p className="font-medium text-gray-900 dark:text-white">{p.name}</p>
                    {p.experience && (
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        Опыт: {p.experience}
                      </p>
                    )}
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
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <InfoField
              label="Семейное положение"
              value={
                user.maritalStatus
                  ? MARITAL_STATUS_LABELS[user.maritalStatus] || user.maritalStatus
                  : null
              }
            />
            <InfoField label="Информация о супруге" value={user.spouseInfo} />
            <InfoField
              label="Есть дети"
              value={
                user.hasChildren === true ? "Да" : user.hasChildren === false ? "Нет" : null
              }
            />
            <InfoField label="О детях" value={user.childrenInfo} />
          </div>

          {children && children.length > 0 && (
            <>
              <h3 className="mb-4 mt-6 text-lg font-semibold text-gray-900 dark:text-white">
                Дети
              </h3>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                {children.map(
                  (child: { name?: string; gender?: string; birthDate?: string }, i: number) => (
                    <div
                      key={i}
                      className="rounded-lg border border-gray-200 p-4 dark:border-gray-700"
                    >
                      <p className="font-medium text-gray-900 dark:text-white">{child.name}</p>
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        {child.gender}{" "}
                        {child.birthDate
                          ? new Date(child.birthDate).toLocaleDateString("ru-RU")
                          : ""}
                      </p>
                    </div>
                  )
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* Tab: Образование */}
      {activeTab === "education" && (
        <div className="rounded-lg bg-white p-6 shadow dark:bg-gray-800">
          <h2 className="mb-4 text-lg font-semibold text-gray-900 dark:text-white">
            Образование
          </h2>
          <InfoField label="Образование" value={user.education} />

          {educations && educations.length > 0 && (
            <>
              <h3 className="mb-4 mt-6 text-lg font-semibold text-gray-900 dark:text-white">
                Учебные заведения
              </h3>
              <div className="space-y-3">
                {educations.map(
                  (
                    edu: {
                      institution?: string;
                      level?: string;
                      specialty?: string;
                      year?: string;
                    },
                    i: number
                  ) => (
                    <div
                      key={i}
                      className="rounded-lg border border-gray-200 p-4 dark:border-gray-700"
                    >
                      <p className="font-medium text-gray-900 dark:text-white">
                        {edu.institution}
                      </p>
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        {edu.level} • {edu.specialty} • {edu.year}
                      </p>
                    </div>
                  )
                )}
              </div>
            </>
          )}

          {trainings && trainings.length > 0 && (
            <>
              <h3 className="mb-4 mt-6 text-lg font-semibold text-gray-900 dark:text-white">
                Повышение квалификации
              </h3>
              <div className="space-y-3">
                {trainings.map(
                  (
                    t: { name?: string; year?: string; description?: string },
                    i: number
                  ) => (
                    <div
                      key={i}
                      className="rounded-lg border border-gray-200 p-4 dark:border-gray-700"
                    >
                      <p className="font-medium text-gray-900 dark:text-white">{t.name}</p>
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        {t.year} {t.description && `• ${t.description}`}
                      </p>
                    </div>
                  )
                )}
              </div>
            </>
          )}

          {awards && awards.length > 0 && (
            <>
              <h3 className="mb-4 mt-6 text-lg font-semibold text-gray-900 dark:text-white">
                Награды
              </h3>
              <div className="space-y-3">
                {awards.map(
                  (
                    a: { type?: string; year?: string; description?: string },
                    i: number
                  ) => (
                    <div
                      key={i}
                      className="rounded-lg border border-gray-200 p-4 dark:border-gray-700"
                    >
                      <div className="flex items-center gap-2">
                        <span
                          className={`rounded px-2 py-0.5 text-xs ${
                            a.type === "государственная"
                              ? "bg-yellow-100 text-yellow-800"
                              : a.type === "ведомственная"
                                ? "bg-blue-100 text-blue-800"
                                : "bg-green-100 text-green-800"
                          }`}
                        >
                          {a.type}
                        </span>
                        <span className="text-sm text-gray-500">{a.year}</span>
                      </div>
                      <p className="mt-1 text-gray-900 dark:text-white">{a.description}</p>
                    </div>
                  )
                )}
              </div>
            </>
          )}

          {user.additionalInfo && (
            <>
              <h3 className="mb-4 mt-6 text-lg font-semibold text-gray-900 dark:text-white">
                Дополнительная информация
              </h3>
              <p className="whitespace-pre-wrap text-gray-900 dark:text-white">
                {user.additionalInfo}
              </p>
            </>
          )}
        </div>
      )}

      {/* Tab: Документы */}
      {activeTab === "documents" && (
        <div className="rounded-lg bg-white p-6 shadow dark:bg-gray-800">
          <h2 className="mb-4 text-lg font-semibold text-gray-900 dark:text-white">
            Документы ({user.documents?.length ?? 0})
          </h2>
          {!user.documents?.length ? (
            <p className="text-gray-500 dark:text-gray-400">Документов нет</p>
          ) : (
            <div className="space-y-4">
              {user.documents.map((doc) => (
                <div
                  key={doc.id}
                  className="rounded-lg border border-gray-200 p-4 dark:border-gray-700"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="font-medium text-gray-900 dark:text-white">
                        {doc.title || doc.type}
                      </h3>
                      <div className="mt-1 flex flex-wrap gap-2">
                        <span className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-700 dark:bg-gray-700 dark:text-gray-300">
                          {doc.type}
                        </span>
                        <span
                          className={`rounded px-2 py-0.5 text-xs ${
                            doc.status === "SIGNED"
                              ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                              : doc.status === "PENDING_REVIEW" ||
                                  doc.status === "PENDING_APPROVAL" ||
                                  doc.status === "PENDING_SIGNATURE"
                                ? "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200"
                                : doc.status === "DRAFT"
                                  ? "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200"
                                  : "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200"
                          }`}
                        >
                          {getDocumentStatusLabel(doc.status)}
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
                          rel="noopener noreferrer"
                          className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700"
                        >
                          <span className="inline-flex items-center gap-1.5">
                            <Download className="h-4 w-4" />
                            Скачать
                          </span>
                        </a>
                      )}
                      {doc.signedFilePath && (
                        <a
                          href={`/api/documents/${doc.id}/download?signed=true`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="rounded-lg bg-green-600 px-3 py-1.5 text-sm text-white hover:bg-green-700"
                        >
                          <span className="inline-flex items-center gap-1.5">
                            <Check className="h-4 w-4" />
                            Подписанный
                          </span>
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
          <h2 className="mb-4 text-lg font-semibold text-gray-900 dark:text-white">
            Профсоюзное членство
          </h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <InfoField label="Номер карточки" value={user.unionCardNumber} />
            <InfoField
              label="Дата вступления"
              value={
                user.membershipJoinedAt
                  ? new Date(user.membershipJoinedAt).toLocaleDateString("ru-RU")
                  : null
              }
            />
            <InfoField label="Статус членства" value={getMembershipStatusLabel(user.unionMembershipStatus)} />
            <InfoField
              label="Организация"
              value={user.effectiveOrganization?.name || user.organization?.name}
            />
            {user.isPPOHead && user.ppoHeadOrganization && (
              <InfoField label="Председатель ППО" value={user.ppoHeadOrganization.name} />
            )}
            {user.isRPOHead && user.rpoHeadOrganization && (
              <InfoField label="Председатель РПО" value={user.rpoHeadOrganization.name} />
            )}
          </div>

          {user.membershipHistory && user.membershipHistory.length > 0 && (
            <>
              <h3 className="mb-4 mt-6 text-lg font-semibold text-gray-900 dark:text-white">
                История членства
              </h3>
              <div className="space-y-3">
                {user.membershipHistory.map((h) => (
                  <div
                    key={h.id}
                    className="rounded-lg border border-gray-200 p-4 dark:border-gray-700"
                  >
                    <div className="flex items-center justify-between">
                      <p className="font-medium text-gray-900 dark:text-white">
                        {h.organizationName}
                      </p>
                      <span className="text-sm text-gray-500">
                        {new Date(h.statusDate).toLocaleDateString("ru-RU")}
                      </span>
                    </div>
                    <p className="text-sm text-gray-600 dark:text-gray-400">{getMembershipStatusLabel(h.status)}</p>
                    {h.notes && (
                      <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{h.notes}</p>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* Tab: Редактировать */}
      {activeTab === "edit" && (
        <UserDetailsForm
          user={formUser}
          currentUserId={session?.user?.id}
          redirectPathAfterDelete="/dashboard/users/org-head"
        />
      )}
    </div>
  );
}
