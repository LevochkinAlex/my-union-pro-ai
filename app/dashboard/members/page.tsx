"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";

interface Member {
  id: string;
  firstName: string | null;
  lastName: string | null;
  middleName: string | null;
  email: string | null;
  phone: string | null;
  membershipStatus: string;
  createdAt: string;
  documents?: Array<{
    id: string;
    type: string;
    status: string;
    filePath: string | null;
  }>;
}

export default function MembersPage() {
  const { data: session } = useSession();
  const [activeTab, setActiveTab] = useState<"validation" | "active">("validation");
  const [members, setMembers] = useState<Member[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadMembers();
  }, [activeTab]);

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

      await loadMembers();
    } catch (err) {
      console.error("Error approving member:", err);
      alert(err instanceof Error ? err.message : "Не удалось одобрить заявку");
    }
  };

  const handleReject = async (memberId: string, reason: string) => {
    try {
      const response = await fetch(`/api/ppo-head/members/${memberId}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Ошибка при отклонении");
      }

      await loadMembers();
    } catch (err) {
      console.error("Error rejecting member:", err);
      alert(err instanceof Error ? err.message : "Не удалось отклонить заявку");
    }
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
        <div className="grid gap-4">
          {members.map((member) => (
            <div
              key={member.id}
              className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                    {[member.lastName, member.firstName, member.middleName]
                      .filter(Boolean)
                      .join(" ")}
                  </h3>
                  <div className="mt-2 space-y-1 text-sm text-gray-600 dark:text-gray-400">
                    {member.email && (
                      <p>
                        <span className="font-medium">Email:</span> {member.email}
                      </p>
                    )}
                    {member.phone && (
                      <p>
                        <span className="font-medium">Телефон:</span> {member.phone}
                      </p>
                    )}
                    <p>
                      <span className="font-medium">Дата подачи заявки:</span>{" "}
                      {new Date(member.createdAt).toLocaleDateString("ru-RU")}
                    </p>
                  </div>
                  {member.documents && member.documents.length > 0 && (
                    <div className="mt-4">
                      <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                        Документы:
                      </p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {member.documents.map((doc) => (
                          <Link
                            key={doc.id}
                            href={doc.filePath || "#"}
                            target="_blank"
                            className="inline-flex items-center gap-1 rounded bg-blue-50 px-2 py-1 text-xs text-blue-700 hover:bg-blue-100 dark:bg-blue-900/30 dark:text-blue-300"
                          >
                            <svg
                              className="h-4 w-4"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                              />
                            </svg>
                            {doc.type}
                          </Link>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
                {activeTab === "validation" && (
                  <div className="ml-4 flex gap-2">
                    <button
                      onClick={() => handleApprove(member.id)}
                      className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700"
                    >
                      Одобрить
                    </button>
                    <button
                      onClick={() => {
                        const reason = prompt("Укажите причину отклонения:");
                        if (reason) {
                          handleReject(member.id, reason);
                        }
                      }}
                      className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
                    >
                      Отклонить
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

