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
  dateOfBirth: Date | null;
  address: string | null;
  jobTitle: string | null;
  profession: string | null;
  education: string | null;
  role: string;
  membershipStatus: string;
  awards: string | null;
  aboutMe: string | null;
  hobbies: string | null;
  maritalStatus: string | null;
  hasChildren: boolean | null;
  childrenInfo: string | null;
  training: string | null;
  additionalInfo: string | null;
  createdAt: Date;
  updatedAt: Date;
  organization: {
    id: string;
    name: string;
  } | null;
  documents: Document[];
}

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
        throw new Error(error.error || "Ошибка валидации");
      }

      await loadUser();
      alert(status === "APPROVED" ? "Пользователь успешно одобрен" : "Пользователь отклонен");
      setValidationComment("");
    } catch (err) {
      alert(err instanceof Error ? err.message : "Ошибка валидации");
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
    (doc) => doc.status === "SIGNED" || doc.status === "PENDING"
  );
  const canValidate = pendingDocuments.length > 0 && 
    (user.membershipStatus === "DOCUMENTS_PENDING" || 
     user.membershipStatus === "PENDING_VERIFICATION");

  return (
    <div className="p-8 space-y-6">
      <div className="mb-6 flex items-center gap-4">
        <Link href="/admin/users" className="text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400">
          ← Назад к списку пользователей
        </Link>
      </div>

      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
          {user.firstName} {user.lastName} {user.middleName}
        </h1>
        {canValidate && (
          <div className="flex gap-2">
            <button
              onClick={() => handleValidate("APPROVED")}
              disabled={validating}
              className="rounded-lg bg-green-600 px-4 py-2 text-white hover:bg-green-700 disabled:opacity-50"
            >
              Одобрить
            </button>
            <button
              onClick={() => handleValidate("REJECTED")}
              disabled={validating}
              className="rounded-lg bg-red-600 px-4 py-2 text-white hover:bg-red-700 disabled:opacity-50"
            >
              Отклонить
            </button>
          </div>
        )}
      </div>

      {/* Основная информация */}
      <div className="rounded-lg bg-white p-6 shadow dark:bg-gray-800">
        <h2 className="mb-4 text-xl font-semibold text-gray-900 dark:text-white">
          Основная информация
        </h2>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-medium text-gray-500 dark:text-gray-400">Email</label>
            <p className="text-gray-900 dark:text-white">{user.email || "Не указан"}</p>
          </div>
          <div>
            <label className="text-sm font-medium text-gray-500 dark:text-gray-400">Телефон</label>
            <p className="text-gray-900 dark:text-white">{user.phone || "Не указан"}</p>
          </div>
          <div>
            <label className="text-sm font-medium text-gray-500 dark:text-gray-400">Дата рождения</label>
            <p className="text-gray-900 dark:text-white">
              {user.dateOfBirth ? new Date(user.dateOfBirth).toLocaleDateString("ru-RU") : "Не указана"}
            </p>
          </div>
          <div>
            <label className="text-sm font-medium text-gray-500 dark:text-gray-400">Адрес</label>
            <p className="text-gray-900 dark:text-white">{user.address || "Не указан"}</p>
          </div>
          <div>
            <label className="text-sm font-medium text-gray-500 dark:text-gray-400">Должность</label>
            <p className="text-gray-900 dark:text-white">{user.jobTitle || "Не указана"}</p>
          </div>
          <div>
            <label className="text-sm font-medium text-gray-500 dark:text-gray-400">Профессия</label>
            <p className="text-gray-900 dark:text-white">{user.profession || "Не указана"}</p>
          </div>
          <div>
            <label className="text-sm font-medium text-gray-500 dark:text-gray-400">Образование</label>
            <p className="text-gray-900 dark:text-white">{user.education || "Не указано"}</p>
          </div>
          <div>
            <label className="text-sm font-medium text-gray-500 dark:text-gray-400">Организация</label>
            <p className="text-gray-900 dark:text-white">{user.organization?.name || "Не указана"}</p>
          </div>
          <div>
            <label className="text-sm font-medium text-gray-500 dark:text-gray-400">Статус</label>
            <p className="text-gray-900 dark:text-white">{user.membershipStatus}</p>
          </div>
        </div>
      </div>

      {/* Документы */}
      {user.documents.length > 0 && (
        <div className="rounded-lg bg-white p-6 shadow dark:bg-gray-800">
          <h2 className="mb-4 text-xl font-semibold text-gray-900 dark:text-white">
            Документы
          </h2>
          <div className="space-y-4">
            {user.documents.map((doc) => (
              <div key={doc.id} className="border-b border-gray-200 pb-4 dark:border-gray-700">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-medium text-gray-900 dark:text-white">{doc.title}</h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      Тип: {doc.type} | Статус: {doc.status}
                    </p>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      Создан: {new Date(doc.createdAt).toLocaleDateString("ru-RU")}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    {doc.filePath && (
                      <a
                        href={`/api/documents/${doc.id}/download`}
                        target="_blank"
                        className="rounded-lg bg-blue-600 px-3 py-1 text-sm text-white hover:bg-blue-700"
                      >
                        Скачать
                      </a>
                    )}
                    {doc.signedFilePath && (
                      <a
                        href={`/api/documents/${doc.id}/download?signed=true`}
                        target="_blank"
                        className="rounded-lg bg-green-600 px-3 py-1 text-sm text-white hover:bg-green-700"
                      >
                        Подписанный
                      </a>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Дополнительная информация */}
      {(user.aboutMe || user.hobbies || user.awards || user.training || user.additionalInfo) && (
        <div className="rounded-lg bg-white p-6 shadow dark:bg-gray-800">
          <h2 className="mb-4 text-xl font-semibold text-gray-900 dark:text-white">
            Дополнительная информация
          </h2>
          {user.aboutMe && (
            <div className="mb-4">
              <label className="text-sm font-medium text-gray-500 dark:text-gray-400">О себе</label>
              <p className="text-gray-900 dark:text-white">{user.aboutMe}</p>
            </div>
          )}
          {user.hobbies && (
            <div className="mb-4">
              <label className="text-sm font-medium text-gray-500 dark:text-gray-400">Хобби</label>
              <p className="text-gray-900 dark:text-white">{user.hobbies}</p>
            </div>
          )}
          {user.awards && (
            <div className="mb-4">
              <label className="text-sm font-medium text-gray-500 dark:text-gray-400">Награды</label>
              <p className="text-gray-900 dark:text-white whitespace-pre-wrap">{user.awards}</p>
            </div>
          )}
          {user.training && (
            <div className="mb-4">
              <label className="text-sm font-medium text-gray-500 dark:text-gray-400">Обучение</label>
              <p className="text-gray-900 dark:text-white whitespace-pre-wrap">{user.training}</p>
            </div>
          )}
          {user.additionalInfo && (
            <div className="mb-4">
              <label className="text-sm font-medium text-gray-500 dark:text-gray-400">Дополнительная информация</label>
              <p className="text-gray-900 dark:text-white whitespace-pre-wrap">{user.additionalInfo}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}


