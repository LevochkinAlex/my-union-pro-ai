"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";

interface StaffMember {
  id: string;
  status: "PENDING" | "ACTIVE" | "INACTIVE";
  invitedAt: string;
  acceptedAt: string | null;
  user: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    middleName: string | null;
    email: string | null;
    phone: string | null;
    avatarUrl: string | null;
  };
  role: {
    id: string;
    name: string;
    permissions: Record<string, boolean>;
  };
}

interface StaffRole {
  id: string;
  name: string;
  description: string | null;
  permissions: Record<string, boolean>;
  isSystem: boolean;
  isActive: boolean;
  staffCount: number;
}

// Названия прав на русском
const PERMISSION_LABELS: Record<string, string> = {
  documents_view: "Просмотр документов",
  documents_create: "Создание документов",
  documents_edit: "Редактирование документов",
  discounts_view: "Просмотр скидок",
  discounts_manage: "Управление скидками",
  members_view: "Просмотр членов",
  members_edit: "Редактирование членов",
  members_manage: "Управление членами",
  appeals_view: "Просмотр обращений",
  appeals_respond: "Ответы на обращения",
  appeals_manage: "Управление обращениями",
  chats_view: "Просмотр чатов",
  chats_participate: "Участие в чатах",
  chats_create: "Создание чатов",
  news_view: "Просмотр новостей",
  news_create: "Создание новостей",
  news_manage: "Управление новостями",
  reports_view: "Просмотр отчётов",
  reports_create: "Создание отчётов",
  settings_view: "Просмотр настроек",
  settings_manage: "Управление настройками",
  staff_view: "Просмотр сотрудников",
  staff_manage: "Управление сотрудниками",
};

export default function StaffManagementPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<"staff" | "roles">("staff");
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [roles, setRoles] = useState<StaffRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Модалки
  const [showAddStaffModal, setShowAddStaffModal] = useState(false);
  const [showEditRoleModal, setShowEditRoleModal] = useState(false);
  const [selectedRole, setSelectedRole] = useState<StaffRole | null>(null);

  // Форма добавления сотрудника
  const [addStaffForm, setAddStaffForm] = useState({
    email: "",
    roleId: "",
  });
  const [addStaffResult, setAddStaffResult] = useState<{
    tempPassword?: string;
    message?: string;
  } | null>(null);

  // Загрузка данных
  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const [staffRes, rolesRes] = await Promise.all([
        fetch("/api/ppo-head/staff"),
        fetch("/api/ppo-head/roles"),
      ]);

      if (!staffRes.ok || !rolesRes.ok) {
        throw new Error("Ошибка загрузки данных");
      }

      const staffData = await staffRes.json();
      const rolesData = await rolesRes.json();

      setStaff(staffData.staff || []);
      setRoles(rolesData.roles || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (status === "authenticated") {
      fetchData();
    }
  }, [status, fetchData]);

  // Добавление сотрудника
  const handleAddStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch("/api/ppo-head/staff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(addStaffForm),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Ошибка добавления");
      }

      setAddStaffResult({
        tempPassword: data.tempPassword,
        message: data.message,
      });

      fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка");
    }
  };

  // Изменение статуса сотрудника
  const handleChangeStaffStatus = async (
    staffId: string,
    newStatus: "ACTIVE" | "INACTIVE"
  ) => {
    try {
      const res = await fetch(`/api/ppo-head/staff/${staffId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });

      if (!res.ok) {
        throw new Error("Ошибка изменения статуса");
      }

      fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка");
    }
  };

  // Удаление сотрудника
  const handleDeleteStaff = async (staffId: string) => {
    if (!confirm("Удалить сотрудника?")) return;

    try {
      const res = await fetch(`/api/ppo-head/staff/${staffId}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        throw new Error("Ошибка удаления");
      }

      fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка");
    }
  };

  // Сохранение роли
  const handleSaveRole = async (roleId: string, permissions: Record<string, boolean>) => {
    try {
      const res = await fetch(`/api/ppo-head/roles/${roleId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ permissions }),
      });

      if (!res.ok) {
        throw new Error("Ошибка сохранения роли");
      }

      setShowEditRoleModal(false);
      setSelectedRole(null);
      fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка");
    }
  };

  if (status === "loading" || loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "ACTIVE":
        return (
          <span className="px-2 py-1 text-xs font-medium rounded-full bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
            Активен
          </span>
        );
      case "PENDING":
        return (
          <span className="px-2 py-1 text-xs font-medium rounded-full bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400">
            Ожидание
          </span>
        );
      case "INACTIVE":
        return (
          <span className="px-2 py-1 text-xs font-medium rounded-full bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-400">
            Неактивен
          </span>
        );
      default:
        return null;
    }
  };

  const getUserName = (user: StaffMember["user"]) => {
    if (user.firstName || user.lastName) {
      return [user.lastName, user.firstName, user.middleName]
        .filter(Boolean)
        .join(" ");
    }
    return user.email || "Без имени";
  };

  return (
    <div className="space-y-6">
      {/* Заголовок */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            Управление сотрудниками
          </h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">
            Добавляйте сотрудников и настраивайте их права доступа
          </p>
        </div>
        
        {activeTab === "staff" && (
          <button
            onClick={() => {
              setShowAddStaffModal(true);
              setAddStaffResult(null);
            }}
            className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-medium transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Добавить сотрудника
          </button>
        )}
      </div>

      {/* Ошибка */}
      {error && (
        <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl text-red-600 dark:text-red-400 flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="text-sm underline hover:no-underline">
            Скрыть
          </button>
        </div>
      )}

      {/* Табы */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="border-b border-gray-200 dark:border-gray-700">
          <div className="flex">
            <button
              onClick={() => setActiveTab("staff")}
              className={`flex-1 sm:flex-none px-6 py-4 text-sm font-medium border-b-2 transition-colors ${
                activeTab === "staff"
                  ? "border-blue-500 text-blue-600 dark:text-blue-400 bg-blue-50/50 dark:bg-blue-900/10"
                  : "border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700/50"
              }`}
            >
              <span className="flex items-center gap-2">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
                Сотрудники
                <span className="px-2 py-0.5 text-xs rounded-full bg-gray-200 dark:bg-gray-600 text-gray-600 dark:text-gray-300">
                  {staff.length}
                </span>
              </span>
            </button>
            <button
              onClick={() => setActiveTab("roles")}
              className={`flex-1 sm:flex-none px-6 py-4 text-sm font-medium border-b-2 transition-colors ${
                activeTab === "roles"
                  ? "border-blue-500 text-blue-600 dark:text-blue-400 bg-blue-50/50 dark:bg-blue-900/10"
                  : "border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700/50"
              }`}
            >
              <span className="flex items-center gap-2">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
                Роли
                <span className="px-2 py-0.5 text-xs rounded-full bg-gray-200 dark:bg-gray-600 text-gray-600 dark:text-gray-300">
                  {roles.length}
                </span>
              </span>
            </button>
          </div>
        </div>

        {/* Контент таба "Сотрудники" */}
        {activeTab === "staff" && (
          <div className="p-4 sm:p-6">
            {/* Список сотрудников */}
            {staff.length === 0 ? (
              <div className="text-center py-16">
                <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center">
                  <svg
                    className="w-8 h-8 text-gray-400"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.5}
                      d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
                    />
                  </svg>
                </div>
                <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-1">
                  Нет добавленных сотрудников
                </h3>
                <p className="text-gray-500 dark:text-gray-400 mb-6">
                  Добавьте первого сотрудника, чтобы делегировать задачи
                </p>
                <button
                  onClick={() => {
                    setShowAddStaffModal(true);
                    setAddStaffResult(null);
                  }}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  Добавить первого сотрудника
                </button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      <th className="pb-3 pr-4">Сотрудник</th>
                      <th className="pb-3 pr-4">Роль</th>
                      <th className="pb-3 pr-4">Статус</th>
                      <th className="pb-3 pr-4">Добавлен</th>
                      <th className="pb-3 text-right">Действия</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                    {staff.map((member) => (
                      <tr key={member.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                        <td className="py-4 pr-4">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center overflow-hidden flex-shrink-0">
                              {member.user.avatarUrl ? (
                                <img
                                  src={member.user.avatarUrl}
                                  alt=""
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                <span className="text-sm font-medium text-white">
                                  {(member.user.firstName?.[0] || member.user.email?.[0] || "?").toUpperCase()}
                                </span>
                              )}
                            </div>
                            <div className="min-w-0">
                              <div className="font-medium text-gray-900 dark:text-white truncate">
                                {getUserName(member.user)}
                              </div>
                              {member.user.email && (
                                <div className="text-sm text-gray-500 dark:text-gray-400 truncate">
                                  {member.user.email}
                                </div>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="py-4 pr-4">
                          <span className="text-gray-700 dark:text-gray-300">
                            {member.role.name}
                          </span>
                        </td>
                        <td className="py-4 pr-4">
                          {getStatusBadge(member.status)}
                        </td>
                        <td className="py-4 pr-4 text-sm text-gray-500 dark:text-gray-400">
                          {new Date(member.invitedAt).toLocaleDateString("ru-RU")}
                        </td>
                        <td className="py-4">
                          <div className="flex items-center justify-end gap-2">
                            {member.status === "ACTIVE" && (
                              <button
                                onClick={() => handleChangeStaffStatus(member.id, "INACTIVE")}
                                className="p-2 text-orange-600 hover:bg-orange-50 dark:hover:bg-orange-900/20 rounded-lg transition-colors"
                                title="Деактивировать"
                              >
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                                </svg>
                              </button>
                            )}
                            {member.status === "INACTIVE" && (
                              <button
                                onClick={() => handleChangeStaffStatus(member.id, "ACTIVE")}
                                className="p-2 text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20 rounded-lg transition-colors"
                                title="Активировать"
                              >
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                              </button>
                            )}
                            <button
                              onClick={() => handleDeleteStaff(member.id)}
                              className="p-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                              title="Удалить"
                            >
                              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Контент таба "Роли" */}
        {activeTab === "roles" && (
          <div className="p-4 sm:p-6">
            <div className="grid gap-4">
              {roles.map((role) => (
                <div
                  key={role.id}
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 bg-gray-50 dark:bg-gray-700/30 rounded-xl border border-gray-100 dark:border-gray-600"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-gray-900 dark:text-white">
                        {role.name}
                      </span>
                      {role.isSystem && (
                        <span className="px-2 py-0.5 text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-full">
                          Системная
                        </span>
                      )}
                      <span className="px-2 py-0.5 text-xs bg-gray-200 dark:bg-gray-600 text-gray-600 dark:text-gray-300 rounded-full">
                        {role.staffCount} чел.
                      </span>
                    </div>
                    {role.description && (
                      <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                        {role.description}
                      </p>
                    )}
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {Object.entries(role.permissions)
                        .filter(([, value]) => value)
                        .slice(0, 5)
                        .map(([key]) => (
                          <span
                            key={key}
                            className="px-2 py-0.5 text-xs bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 rounded border border-gray-200 dark:border-gray-600"
                          >
                            {PERMISSION_LABELS[key] || key}
                          </span>
                        ))}
                      {Object.values(role.permissions).filter(Boolean).length > 5 && (
                        <span className="px-2 py-0.5 text-xs text-gray-500 dark:text-gray-400">
                          +{Object.values(role.permissions).filter(Boolean).length - 5} ещё
                        </span>
                      )}
                    </div>
                  </div>

                  <button
                    onClick={() => {
                      setSelectedRole(role);
                      setShowEditRoleModal(true);
                    }}
                    className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    Настроить права
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Модалка добавления сотрудника */}
      {showAddStaffModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 w-full max-w-md mx-4 max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">
              Добавить сотрудника
            </h2>

            {addStaffResult ? (
              <div>
                <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4 mb-4">
                  <p className="text-green-700 dark:text-green-400">
                    {addStaffResult.message}
                  </p>
                  {addStaffResult.tempPassword && (
                    <div className="mt-3 p-3 bg-white dark:bg-gray-800 rounded border">
                      <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">
                        Временный пароль (покажите сотруднику):
                      </p>
                      <code className="text-lg font-mono font-bold text-gray-900 dark:text-white">
                        {addStaffResult.tempPassword}
                      </code>
                    </div>
                  )}
                </div>
                <button
                  onClick={() => {
                    setShowAddStaffModal(false);
                    setAddStaffForm({ email: "", roleId: "" });
                    setAddStaffResult(null);
                  }}
                  className="w-full py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg"
                >
                  Закрыть
                </button>
              </div>
            ) : (
              <form onSubmit={handleAddStaff}>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Email сотрудника
                    </label>
                    <input
                      type="email"
                      value={addStaffForm.email}
                      onChange={(e) =>
                        setAddStaffForm({ ...addStaffForm, email: e.target.value })
                      }
                      required
                      className="w-full px-4 py-2 border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      placeholder="email@example.com"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Роль (должность)
                    </label>
                    <select
                      value={addStaffForm.roleId}
                      onChange={(e) =>
                        setAddStaffForm({ ...addStaffForm, roleId: e.target.value })
                      }
                      required
                      className="w-full px-4 py-2 border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    >
                      <option value="">Выберите роль</option>
                      {roles.map((role) => (
                        <option key={role.id} value={role.id}>
                          {role.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="flex gap-3 mt-6">
                  <button
                    type="button"
                    onClick={() => setShowAddStaffModal(false)}
                    className="flex-1 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg"
                  >
                    Отмена
                  </button>
                  <button
                    type="submit"
                    className="flex-1 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg"
                  >
                    Добавить
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Модалка редактирования роли */}
      {showEditRoleModal && selectedRole && (
        <EditRoleModal
          role={selectedRole}
          onClose={() => {
            setShowEditRoleModal(false);
            setSelectedRole(null);
          }}
          onSave={handleSaveRole}
        />
      )}
    </div>
  );
}

// Компонент модалки редактирования роли
function EditRoleModal({
  role,
  onClose,
  onSave,
}: {
  role: StaffRole;
  onClose: () => void;
  onSave: (roleId: string, permissions: Record<string, boolean>) => void;
}) {
  const [permissions, setPermissions] = useState<Record<string, boolean>>(
    role.permissions || {}
  );
  const [saving, setSaving] = useState(false);

  const handleToggle = (key: string) => {
    setPermissions((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleSave = async () => {
    setSaving(true);
    await onSave(role.id, permissions);
    setSaving(false);
  };

  // Группировка прав по категориям
  const permissionGroups = [
    {
      name: "Документы",
      keys: ["documents_view", "documents_create", "documents_edit"],
    },
    { name: "Скидки", keys: ["discounts_view", "discounts_manage"] },
    {
      name: "Члены профсоюза",
      keys: ["members_view", "members_edit", "members_manage"],
    },
    {
      name: "Обращения",
      keys: ["appeals_view", "appeals_respond", "appeals_manage"],
    },
    { name: "Чаты", keys: ["chats_view", "chats_participate", "chats_create"] },
    { name: "Новости", keys: ["news_view", "news_create", "news_manage"] },
    { name: "Отчёты", keys: ["reports_view", "reports_create"] },
    { name: "Настройки", keys: ["settings_view", "settings_manage"] },
    { name: "Сотрудники", keys: ["staff_view", "staff_manage"] },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
        <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
          Настройка роли: {role.name}
        </h2>
        {role.description && (
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
            {role.description}
          </p>
        )}

        <div className="space-y-6">
          {permissionGroups.map((group) => (
            <div key={group.name}>
              <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                {group.name}
              </h3>
              <div className="space-y-2">
                {group.keys.map((key) => (
                  <label
                    key={key}
                    className="flex items-center gap-3 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={permissions[key] || false}
                      onChange={() => handleToggle(key)}
                      className="w-4 h-4 rounded border-gray-300 text-blue-500 focus:ring-blue-500"
                    />
                    <span className="text-sm text-gray-600 dark:text-gray-400">
                      {PERMISSION_LABELS[key] || key}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="flex gap-3 mt-6">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg"
          >
            Отмена
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg disabled:opacity-50"
          >
            {saving ? "Сохранение..." : "Сохранить"}
          </button>
        </div>
      </div>
    </div>
  );
}
