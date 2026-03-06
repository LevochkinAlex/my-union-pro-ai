"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { Check, Download, Trash2, X } from "lucide-react";
import {
  getMembershipStatusBadgeClass,
  getMembershipStatusLabel,
  getUserRoleLabel,
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

interface UserData {
  id: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  middleName: string | null;
  phone: string | null;
  dateOfBirth: Date | string | null;
  address: string | null;
  jobTitle: string | null;
  profession: string | null;
  education: string | null;
  role: string;
  membershipStatus: string;
  createdAt: string;
  updatedAt: string;
  isPPOHead?: boolean;
  isRPOHead?: boolean;
  avatarUrl: string | null;
  unionCardNumber: string | null;
  organization: { id: string; name: string } | null;
  ppoHeadOrganization: { id: string; name: string } | null;
  rpoHeadOrganization: { id: string; name: string } | null;
  effectiveOrganization?: { id: string; name: string } | null;
  documents: Document[];
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
    if (!confirm(`Вы уверены, что хотите удалить пользователя ${user.email}?\n\nЭто действие нельзя отменить.`)) {
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
    if (!confirm(`Вы уверены, что хотите ${status === "APPROVED" ? "одобрить" : "отклонить"} этого пользователя?`)) {
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
      <div className="space-y-6 min-w-0 w-full py-4">
        Загрузка данных пользователя...
      </div>
    );
  }

  if (error || !user) {
    return (
      <div className="space-y-6 min-w-0 w-full py-4">
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

  return (
    <div className="space-y-6 min-w-0 w-full">
      <div className="mb-6 flex items-center gap-4">
        <Link
          href="/dashboard/users/org-head"
          className="text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400"
        >
          ← Назад к списку пользователей
        </Link>
      </div>

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

      <UserDetailsForm
        user={formUser}
        currentUserId={session?.user?.id}
        redirectPathAfterDelete="/dashboard/users/org-head"
      />

      {user.documents && user.documents.length > 0 && (
        <div className="rounded-lg bg-white p-6 shadow dark:bg-gray-800">
          <h2 className="mb-4 text-lg font-semibold text-gray-900 dark:text-white">
            Документы ({user.documents.length})
          </h2>
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
                      <span className="rounded px-2 py-0.5 text-xs bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300">
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
        </div>
      )}
    </div>
  );
}
