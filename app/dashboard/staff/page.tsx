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
    <div className="p-4 md:p-6 max-w-7xl mx-auto">
      {/* Заголовок */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          Управление сотрудниками
        </h1>
        <p className="text-gray-500 dark:text-gray-400 mt-1">
          Добавляйте сотрудников и настраивайте их права доступа
        </p>
      </div>

      {/* Табы */}
      <div className="border-b border-gray-200 dark:border-gray-700 mb-6">
        <div className="flex gap-4">
          <button
            onClick={() => setActiveTab("staff")}
            className={`pb-3 px-1 text-sm font-medium border-b-2 transition-colors ${
              activeTab === "staff"
                ? "border-blue-500 text-blue-600 dark:text-blue-400"
                : "border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400"
            }`}
          >
            Сотрудники ({staff.length})
          </button>
          <button
            onClick={() => setActiveTab("roles")}
            className={`pb-3 px-1 text-sm font-medium border-b-2 transition-colors ${
              activeTab === "roles"
                ? "border-blue-500 text-blue-600 dark:text-blue-400"
                : "border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400"
            }`}
          >
            Роли ({roles.length})
          </button>
        </div>
      </div>

      {/* Ошибка */}
      {error && (
        <div className="mb-4 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-600 dark:text-red-400">
          {error}
          <button onClick={() => setError(null)} className="ml-2 underline">
            Скрыть
          </button>
        </div>
      )}

      {/* Контент таба "Сотрудники" */}
      {activeTab === "staff" && (
        <div>
          {/* Кнопка добавления */}
          <div className="mb-4">
            <button
              onClick={() => {
                setShowAddStaffModal(true);
                setAddStaffResult(null);
              }}
              className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg font-medium transition-colors"
            >
              + Добавить сотрудника
            </button>
          </div>

          {/* Список сотрудников */}
          {staff.length === 0 ? (
            <div className="text-center py-12 bg-gray-50 dark:bg-gray-800 rounded-xl">
              <div className="text-gray-400 mb-2">
                <svg
                  className="w-12 h-12 mx-auto"
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
              <p className="text-gray-500 dark:text-gray-400">
                Нет добавленных сотрудников
              </p>
              <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">
                Добавьте первого сотрудника, чтобы делегировать задачи
              </p>
            </div>
          ) : (
            <div className="grid gap-4">
              {staff.map((member) => (
                <div
                  key={member.id}
                  className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      {/* Аватар */}
                      <div className="w-12 h-12 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center overflow-hidden">
                        {member.user.avatarUrl ? (
                          <img
                            src={member.user.avatarUrl}
                            alt=""
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <span className="text-lg font-medium text-gray-500">
                            {(member.user.firstName?.[0] || member.user.email?.[0] || "?").toUpperCase()}
                          </span>
                        )}
                      </div>

                      {/* Инфо */}
                      <div>
                        <div className="font-medium text-gray-900 dark:text-white">
                          {getUserName(member.user)}
                        </div>
                        <div className="text-sm text-gray-500 dark:text-gray-400">
                          {member.role.name}
                        </div>
                        {member.user.email && (
                          <div className="text-xs text-gray-400">
                            {member.user.email}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      {getStatusBadge(member.status)}

                      {/* Действия */}
                      <div className="flex gap-2">
                        {member.status === "ACTIVE" && (
                          <button
                            onClick={() =>
                              handleChangeStaffStatus(member.id, "INACTIVE")
                            }
                            className="px-3 py-1.5 text-sm text-orange-600 hover:bg-orange-50 dark:hover:bg-orange-900/20 rounded-lg transition-colors"
                          >
                            Деактивировать
                          </button>
                        )}
                        {member.status === "INACTIVE" && (
                          <button
                            onClick={() =>
                              handleChangeStaffStatus(member.id, "ACTIVE")
                            }
                            className="px-3 py-1.5 text-sm text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20 rounded-lg transition-colors"
                          >
                            Активировать
                          </button>
                        )}
                        <button
                          onClick={() => handleDeleteStaff(member.id)}
                          className="px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                        >
                          Удалить
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Контент таба "Роли" */}
      {activeTab === "roles" && (
        <div className="grid gap-4">
          {roles.map((role) => (
            <div
              key={role.id}
              className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4"
            >
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-gray-900 dark:text-white">
                      {role.name}
                    </span>
                    {role.isSystem && (
                      <span className="px-2 py-0.5 text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded">
                        Системная
                      </span>
                    )}
                  </div>
                  {role.description && (
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                      {role.description}
                    </p>
                  )}
                  <p className="text-xs text-gray-400 mt-1">
                    Сотрудников: {role.staffCount}
                  </p>
                </div>

                <button
                  onClick={() => {
                    setSelectedRole(role);
                    setShowEditRoleModal(true);
                  }}
                  className="px-4 py-2 text-sm text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors"
                >
                  Настроить права
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

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
