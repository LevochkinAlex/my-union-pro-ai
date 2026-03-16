"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import {
  Card,
  PageHeader,
  EmptyState,
  StatusBadge,
  Spinner,
  Tabs,
  DataTable,
} from "@/components/ui";
import { ORG_TYPE_LABELS } from "@/lib/status-labels";

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
  role?: {
    id: string;
    name: string;
    permissions: Record<string, boolean>;
  };
  organization?: { id: string; name: string; type?: string };
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
  documents_view: "Просмотр документов (Входящие / Исходящие)",
  documents_create: "Создание заседаний, повесток, протоколов",
  documents_edit: "Редактирование черновиков документов",
  documents_review: "Согласование документа участником без редактирования",
  documents_approve: "Утверждение документа и запуск подписи",
  documents_sign: "Подписание утверждённых документов",
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

type OrgItem = { id: string; name: string; type?: string };

export default function StaffManagementPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<"staff" | "roles">("staff");
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [roles, setRoles] = useState<StaffRole[]>([]);
  const [rolesReadOnly, setRolesReadOnly] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [regionMode, setRegionMode] = useState(false);
  const [organizations, setOrganizations] = useState<OrgItem[]>([]);
  /** В режиме РПО: выбранная организация — показываем только её сотрудников */
  const [selectedOrganizationId, setSelectedOrganizationId] = useState<string | null>(null);
  const [rolesForOrg, setRolesForOrg] = useState<StaffRole[]>([]);
  const [loadingRolesForOrg, setLoadingRolesForOrg] = useState(false);
  const [loadingStaffForOrg, setLoadingStaffForOrg] = useState(false);
  const showRolesTab = regionMode;

  // Модалки
  const [showAddStaffModal, setShowAddStaffModal] = useState(false);
  const [showEditRoleModal, setShowEditRoleModal] = useState(false);
  const [selectedRole, setSelectedRole] = useState<StaffRole | null>(null);
  const [showEditStaffModal, setShowEditStaffModal] = useState(false);
  const [editingStaff, setEditingStaff] = useState<StaffMember | null>(null);
  const [editStaffRoles, setEditStaffRoles] = useState<StaffRole[]>([]);
  const [loadingEditStaffRoles, setLoadingEditStaffRoles] = useState(false);
  const [resendingId, setResendingId] = useState<string | null>(null);

  // Форма добавления сотрудника
  const [addStaffForm, setAddStaffForm] = useState({
    email: "",
    roleId: "",
    organizationId: "",
  });
  const [addStaffResult, setAddStaffResult] = useState<{
    message?: string;
    isExistingUser?: boolean;
  } | null>(null);
  // Поиск существующего пользователя для добавления в сотрудники
  const [addStaffSearchQuery, setAddStaffSearchQuery] = useState("");
  const [addStaffSearchResults, setAddStaffSearchResults] = useState<Array<{ id: string; firstName: string | null; lastName: string | null; middleName: string | null; email: string | null; phone: string | null; organization?: { name: string } | null }>>([]);
  const [addStaffSearchLoading, setAddStaffSearchLoading] = useState(false);
  const [addStaffSelectedUser, setAddStaffSelectedUser] = useState<{ id: string; firstName: string | null; lastName: string | null; middleName: string | null; email: string | null } | null>(null);
  const addStaffSearchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Загрузка данных: сначала PPO, при 403 — RPO (регион)
  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const staffRes = await fetch("/api/ppo-head/staff");
      if (staffRes.ok) {
        const rolesRes = await fetch("/api/ppo-head/roles");
        if (!rolesRes.ok) throw new Error("Ошибка загрузки ролей");
        const staffData = await staffRes.json();
        const rolesData = await rolesRes.json();
        setStaff(staffData.staff || []);
        setRoles(rolesData.roles || []);
        setRolesReadOnly(rolesData.readOnly === true);
        setRegionMode(false);
      } else {
        setStaff([]);
        setRoles([]);
        setRolesReadOnly(true);
        setRegionMode(true);
        setSelectedOrganizationId(null);
        const orgsRes = await fetch("/api/org-head/organizations?limit=500");
        if (!orgsRes.ok) {
          const data = await orgsRes.json().catch(() => ({}));
          throw new Error(data.error || "Нет доступа к списку организаций");
        }
        const orgsData = await orgsRes.json();
        setOrganizations(orgsData.organizations || []);
      }
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

  // В режиме РПО: загружаем сотрудников только выбранной организации
  const loadStaffForSelectedOrg = useCallback(async () => {
    if (!regionMode || !selectedOrganizationId) {
      setStaff([]);
      return;
    }
    setLoadingStaffForOrg(true);
    try {
      const res = await fetch(`/api/org-head/staff?organizationId=${encodeURIComponent(selectedOrganizationId)}`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Ошибка загрузки сотрудников");
      }
      const data = await res.json();
      setStaff(data.staff || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка загрузки");
      setStaff([]);
    } finally {
      setLoadingStaffForOrg(false);
    }
  }, [regionMode, selectedOrganizationId]);

  useEffect(() => {
    if (!regionMode) return;
    if (!selectedOrganizationId) {
      setStaff([]);
      return;
    }
    loadStaffForSelectedOrg();
  }, [regionMode, selectedOrganizationId, loadStaffForSelectedOrg]);

  const refreshStaff = useCallback(() => {
    if (regionMode && selectedOrganizationId) loadStaffForSelectedOrg();
    else fetchData();
  }, [regionMode, selectedOrganizationId, loadStaffForSelectedOrg, fetchData]);

  const orgIdForRoles = regionMode && showAddStaffModal ? (addStaffForm.organizationId || selectedOrganizationId) : null;
  useEffect(() => {
    if (!orgIdForRoles) {
      setRolesForOrg([]);
      return;
    }
    setLoadingRolesForOrg(true);
    fetch(`/api/org-head/organizations/${orgIdForRoles}/roles`)
      .then((r) => r.json())
      .then((data) => setRolesForOrg(data.roles || []))
      .catch(() => setRolesForOrg([]))
      .finally(() => setLoadingRolesForOrg(false));
  }, [orgIdForRoles]);

  // Поиск пользователей для добавления в сотрудники (debounce)
  useEffect(() => {
    if (!showAddStaffModal) return;
    const q = addStaffSearchQuery.trim();
    if (q.length < 2) {
      setAddStaffSearchResults([]);
      return;
    }
    if (addStaffSearchDebounceRef.current) clearTimeout(addStaffSearchDebounceRef.current);
    addStaffSearchDebounceRef.current = setTimeout(() => {
      setAddStaffSearchLoading(true);
      fetch(`/api/org-head/users/search?q=${encodeURIComponent(q)}&limit=20`)
        .then((r) => r.json())
        .then((data) => {
          if (data.users) setAddStaffSearchResults(data.users);
          else setAddStaffSearchResults([]);
        })
        .catch(() => setAddStaffSearchResults([]))
        .finally(() => {
          setAddStaffSearchLoading(false);
          addStaffSearchDebounceRef.current = null;
        });
    }, 300);
    return () => {
      if (addStaffSearchDebounceRef.current) clearTimeout(addStaffSearchDebounceRef.current);
    };
  }, [showAddStaffModal, addStaffSearchQuery]);

  // В режиме РПО при открытии редактирования сотрудника подгружаем роли его организации
  useEffect(() => {
    if (!regionMode || !editingStaff?.organization?.id) {
      setEditStaffRoles([]);
      return;
    }
    setLoadingEditStaffRoles(true);
    fetch(`/api/org-head/organizations/${editingStaff.organization.id}/roles`)
      .then((r) => r.json())
      .then((data) => setEditStaffRoles(data.roles || []))
      .catch(() => setEditStaffRoles([]))
      .finally(() => setLoadingEditStaffRoles(false));
  }, [regionMode, editingStaff?.id, editingStaff?.organization?.id]);

  const addStaffApi = regionMode ? "/api/org-head/staff" : "/api/ppo-head/staff";
  const staffIdApi = (id: string) => (regionMode ? `/api/org-head/staff/${id}` : `/api/ppo-head/staff/${id}`);

  const handleAddStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const orgId = regionMode ? (addStaffForm.organizationId || selectedOrganizationId) : null;
      if (regionMode && !orgId) {
        setError("Выберите организацию");
        return;
      }
      if (!addStaffForm.roleId) {
        setError("Выберите роль");
        return;
      }
      const body: Record<string, string> = { roleId: addStaffForm.roleId };
      if (regionMode) body.organizationId = orgId!;
      if (addStaffSelectedUser) {
        body.userId = addStaffSelectedUser.id;
      } else if (addStaffForm.email.trim()) {
        body.email = addStaffForm.email.trim();
      } else {
        setError("Найдите пользователя по имени/email или введите email для приглашения");
        return;
      }
      const res = await fetch(addStaffApi, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Ошибка добавления");
      setAddStaffResult({ message: data.message, isExistingUser: data.isExistingUser });
      setAddStaffForm((f) => ({ ...f, email: "", roleId: "", organizationId: regionMode ? (addStaffForm.organizationId || selectedOrganizationId) ?? "" : "" }));
      setAddStaffSelectedUser(null);
      setAddStaffSearchQuery("");
      setAddStaffSearchResults([]);
      refreshStaff();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка");
    }
  };

  const handleChangeStaffStatus = async (
    staffId: string,
    newStatus: "ACTIVE" | "INACTIVE"
  ) => {
    try {
      const res = await fetch(staffIdApi(staffId), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) throw new Error("Ошибка изменения статуса");
      refreshStaff();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка");
    }
  };

  const handleResendInvite = async (staffId: string) => {
    try {
      setResendingId(staffId);
      const res = await fetch(`${staffIdApi(staffId)}/resend-invite`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Ошибка отправки");
      setError(null);
      refreshStaff();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось отправить приглашение");
    } finally {
      setResendingId(null);
    }
  };

  // Редактирование сотрудника (открыть модалку)
  const handleEditStaff = (member: StaffMember) => {
    setEditingStaff(member);
    setShowEditStaffModal(true);
  };

  const handleSaveStaff = async (staffId: string, roleId: string) => {
    try {
      const res = await fetch(staffIdApi(staffId), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roleId }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Ошибка сохранения");
      }
      setShowEditStaffModal(false);
      setEditingStaff(null);
      setError(null);
      refreshStaff();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка сохранения");
    }
  };

  const handleDeleteStaff = async (staffId: string) => {
    if (!confirm("Удалить сотрудника?")) return;
    try {
      const res = await fetch(staffIdApi(staffId), { method: "DELETE" });
      if (!res.ok) throw new Error("Ошибка удаления");
      refreshStaff();
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
      refreshStaff();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка");
    }
  };

  if (status === "loading" || loading) {
    return <Spinner size="lg" fullPage />;
  }

  const getStatusBadge = (memberStatus: string) => {
    switch (memberStatus) {
      case "ACTIVE":
        return <StatusBadge color="green">Активен</StatusBadge>;
      case "PENDING":
        return <StatusBadge color="yellow">Ожидание</StatusBadge>;
      case "INACTIVE":
        return <StatusBadge color="gray">Неактивен</StatusBadge>;
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

  const staffTabs = [
    {
      id: "staff",
      label: "Сотрудники",
      count: staff.length,
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
        </svg>
      ),
    },
    ...(showRolesTab
      ? [
          {
            id: "roles",
            label: "Роли",
            count: roles.length,
            icon: (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            ),
          },
        ]
      : []),
  ];

  const staffColumns = [
    {
      key: "user",
      header: "Сотрудник",
      render: (member: StaffMember) => (
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center overflow-hidden flex-shrink-0">
            {member.user.avatarUrl ? (
              <img src={member.user.avatarUrl} alt="" className="w-full h-full object-cover" />
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
      ),
    },
    {
      key: "role",
      header: "Роль",
      hideOnMobile: true,
      render: (member: StaffMember) => member.role?.name ?? "—",
    },
    {
      key: "status",
      header: "Статус",
      render: (member: StaffMember) => getStatusBadge(member.status),
    },
    {
      key: "invitedAt",
      header: "Добавлен",
      hideOnMobile: true,
      render: (member: StaffMember) => new Date(member.invitedAt).toLocaleDateString("ru-RU"),
    },
    {
      key: "actions",
      header: "Действия",
      className: "text-right",
      render: (member: StaffMember) => {
        const isChairmanRow = typeof member.id === "string" && member.id.startsWith("chairman-");
        if (isChairmanRow) {
          return <span className="text-sm text-gray-500 dark:text-gray-400">Председатель организации</span>;
        }
        return (
        <div className="flex items-center justify-end gap-2 flex-wrap">
          <button
            onClick={() => handleEditStaff(member)}
            className="p-2 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors"
            title="Редактировать"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
          </button>
          {member.status === "PENDING" && (
            <button
              onClick={() => handleResendInvite(member.id)}
              disabled={resendingId === member.id}
              className="p-2 text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 rounded-lg transition-colors disabled:opacity-50"
              title="Отправить приглашение повторно"
            >
              {resendingId === member.id ? (
                <span className="text-xs">Отправка...</span>
              ) : (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              )}
            </button>
          )}
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
        );
      },
    },
  ];

  return (
    <div className="space-y-6">
      {/* Заголовок */}
      <PageHeader
        title="Управление сотрудниками"
        description="Добавляйте сотрудников и настраивайте их права доступа"
        actions={
          activeTab === "staff" ? (
            <button
              onClick={() => {
                if (regionMode) setAddStaffForm((f) => ({ ...f, organizationId: selectedOrganizationId ?? "", roleId: "" }));
                setShowAddStaffModal(true);
                setAddStaffResult(null);
                setAddStaffSelectedUser(null);
                setAddStaffSearchQuery("");
                setAddStaffSearchResults([]);
              }}
              className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-medium transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Добавить сотрудника
            </button>
          ) : undefined
        }
      />

      {/* Ошибка */}
      {error && (
        <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl text-red-600 dark:text-red-400 flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="text-sm underline hover:no-underline">
            Скрыть
          </button>
        </div>
      )}

      {/* Табы + контент */}
      <Card noPadding>
        <Tabs
          tabs={staffTabs}
          activeTab={activeTab}
          onChange={(id) => setActiveTab(id as "staff" | "roles")}
        />

        {/* Контент таба "Сотрудники" */}
        {activeTab === "staff" && (
          <div className="p-4 sm:p-6">
            {regionMode && (
              <div className="mb-6">
                <label htmlFor="staff-org-select" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Организация
                </label>
                <select
                  id="staff-org-select"
                  value={selectedOrganizationId ?? ""}
                  onChange={(e) => setSelectedOrganizationId(e.target.value || null)}
                  className="w-full max-w-md px-4 py-2.5 border border-gray-200 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                >
                  <option value="">Выберите организацию</option>
                  {organizations.map((org) => (
                    <option key={org.id} value={org.id}>
                      {org.name} {org.type ? `(${ORG_TYPE_LABELS[org.type] || org.type})` : ""}
                    </option>
                  ))}
                </select>
                <p className="mt-1.5 text-sm text-gray-500 dark:text-gray-400">
                  Сотрудники отображаются только для выбранной организации. Добавить сотрудника можно в любую организацию (ППО, МПО, РПО) через кнопку выше. Роли настраиваются в разделе «Роли и должности».
                </p>
              </div>
            )}

            {regionMode && !selectedOrganizationId && (
              <EmptyState
                title="Выберите организацию"
                description="Чтобы увидеть и управлять сотрудниками, выберите организацию (ППО) в списке выше."
              />
            )}

            {regionMode && selectedOrganizationId && loadingStaffForOrg && (
              <div className="flex items-center justify-center py-12">
                <Spinner />
              </div>
            )}

            {!regionMode || (selectedOrganizationId && !loadingStaffForOrg) ? (
            <>
            {staff.length === 0 && (regionMode ? selectedOrganizationId : true) ? (
              <EmptyState
                icon={
                  <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.5}
                      d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
                    />
                  </svg>
                }
                title="Нет добавленных сотрудников"
                description="Добавьте первого сотрудника, чтобы делегировать задачи"
                action={
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
                }
              />
            ) : (
              <DataTable<StaffMember>
                columns={staffColumns}
                data={staff}
                keyExtractor={(m) => m.id}
                card={false}
              />
            )}
            </>
            ) : null}
          </div>
        )}

        {/* Контент таба "Роли" */}
        {activeTab === "roles" && (
          <div className="p-4 sm:p-6">
            {regionMode ? (
              <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-6 text-center dark:border-blue-800 dark:bg-blue-900/20 dark:text-blue-300">
                <p className="text-sm text-blue-700 dark:text-blue-300 mb-3">
                  Роли и права настраиваются в разделе «Роли и должности» и действуют для всех ППО региона.
                </p>
                <a
                  href="/dashboard/roles"
                  className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
                >
                  Перейти в «Роли и должности»
                </a>
              </div>
            ) : (
              <>
                {rolesReadOnly && (
                  <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-700 dark:border-blue-800 dark:bg-blue-900/20 dark:text-blue-300">
                    Редактирование ролей перенесено в кабинет РПО. Здесь доступно только назначение сотрудников на уже опубликованные роли.
                  </div>
                )}
                <div className="grid gap-4">
                  {roles.map((role) => (
                    <Card
                      key={role.id}
                      padding="sm"
                      className="bg-gray-50 shadow-none dark:bg-gray-700/30 border-gray-100 dark:border-gray-600"
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium text-gray-900 dark:text-white">
                              {role.name}
                            </span>
                            {role.isSystem && (
                              <StatusBadge color="blue">Системная</StatusBadge>
                            )}
                            <StatusBadge color="gray">{role.staffCount} чел.</StatusBadge>
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

                        {!rolesReadOnly && (
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
                        )}
                      </div>
                    </Card>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </Card>

      {/* Модалка добавления сотрудника */}
      {showAddStaffModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="mx-4 flex w-full max-w-md min-h-0 max-h-[90vh] flex-col overflow-hidden rounded-2xl bg-white dark:bg-gray-800">
            <div className="shrink-0 border-b border-gray-200 px-6 py-4 dark:border-gray-700">
              <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                Добавить сотрудника
              </h2>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
            {addStaffResult ? (
              <div>
                <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4 mb-4">
                  <div className="flex items-center gap-3 mb-2">
                    <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <p className="text-green-700 dark:text-green-400 font-medium">
                      {addStaffResult.message}
                    </p>
                  </div>
                  {addStaffResult.isExistingUser ? (
                    <p className="text-sm text-green-600 dark:text-green-400 mt-2">
                      Пользователь уже зарегистрирован в системе и получил уведомление о назначении.
                    </p>
                  ) : (
                    <p className="text-sm text-green-600 dark:text-green-400 mt-2">
                      Новый пользователь получит email с приглашением. Для входа используется одноразовый код на email или телефон.
                    </p>
                  )}
                </div>
                <button
                  onClick={() => {
                    setShowAddStaffModal(false);
                    setAddStaffForm({ email: "", roleId: "", organizationId: "" });
                    setAddStaffResult(null);
                    setAddStaffSelectedUser(null);
                    setAddStaffSearchQuery("");
                    setAddStaffSearchResults([]);
                  }}
                  className="w-full py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                >
                  Закрыть
                </button>
              </div>
            ) : (
              <form onSubmit={handleAddStaff}>
                <div className="space-y-4">
                  {regionMode && (
                    <div>
                      <label htmlFor="add-staff-organization" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Организация
                      </label>
                      <select
                        id="add-staff-organization"
                        value={addStaffForm.organizationId}
                        onChange={(e) =>
                          setAddStaffForm((f) => ({ ...f, organizationId: e.target.value }))
                        }
                        required
                        className="w-full px-4 py-2 border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      >
                        <option value="">Выберите организацию</option>
                        {organizations.map((org) => (
                          <option key={org.id} value={org.id}>
                            {org.name} {org.type ? `(${ORG_TYPE_LABELS[org.type] || org.type})` : ""}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  <div>
                    <label htmlFor="add-staff-search" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Найти существующего пользователя
                    </label>
                    <input
                      id="add-staff-search"
                      type="text"
                      value={addStaffSearchQuery}
                      onChange={(e) => setAddStaffSearchQuery(e.target.value)}
                      placeholder="Поиск по имени, email или телефону (мин. 2 символа)"
                      className="w-full px-4 py-2 border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    />
                    {addStaffSearchLoading && (
                      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Поиск...</p>
                    )}
                    {addStaffSearchResults.length > 0 && !addStaffSelectedUser && (
                      <ul className="mt-2 max-h-48 overflow-y-auto rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 divide-y divide-gray-100 dark:divide-gray-700">
                        {addStaffSearchResults.map((u) => {
                          const name = [u.lastName, u.firstName, u.middleName].filter(Boolean).join(" ") || "—";
                          return (
                            <li key={u.id}>
                              <button
                                type="button"
                                onClick={() => {
                                  setAddStaffSelectedUser({ id: u.id, firstName: u.firstName, lastName: u.lastName, middleName: u.middleName, email: u.email });
                                  setAddStaffSearchQuery("");
                                  setAddStaffSearchResults([]);
                                }}
                                className="w-full text-left px-3 py-2.5 text-sm hover:bg-gray-50 dark:hover:bg-gray-700/50 flex flex-col"
                              >
                                <span className="font-medium text-gray-900 dark:text-white">{name}</span>
                                <span className="text-gray-500 dark:text-gray-400 text-xs">{u.email || u.phone || ""}</span>
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                    {addStaffSelectedUser && (
                      <div className="mt-2 flex items-center gap-2 rounded-lg border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/20 px-3 py-2">
                        <span className="text-sm text-green-800 dark:text-green-300 flex-1">
                          Выбран: {[addStaffSelectedUser.lastName, addStaffSelectedUser.firstName, addStaffSelectedUser.middleName].filter(Boolean).join(" ")} ({addStaffSelectedUser.email || "—"})
                        </span>
                        <button
                          type="button"
                          onClick={() => setAddStaffSelectedUser(null)}
                          className="text-xs text-green-600 dark:text-green-400 hover:underline"
                        >
                          Сменить
                        </button>
                      </div>
                    )}
                  </div>

                  <div>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Или пригласить по email</p>
                    <input
                      type="email"
                      value={addStaffForm.email}
                      onChange={(e) =>
                        setAddStaffForm({ ...addStaffForm, email: e.target.value })
                      }
                      disabled={!!addStaffSelectedUser}
                      className="w-full px-4 py-2 border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white disabled:opacity-50 disabled:bg-gray-100 dark:disabled:bg-gray-800"
                      placeholder="email@example.com"
                    />
                    {addStaffSelectedUser && (
                      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Выбран пользователь выше. Чтобы пригласить нового — нажмите «Сменить».</p>
                    )}
                  </div>

                  <div>
                    <label htmlFor="add-staff-role" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Роль (должность)
                    </label>
                    <select
                      id="add-staff-role"
                      value={addStaffForm.roleId}
                      onChange={(e) =>
                        setAddStaffForm({ ...addStaffForm, roleId: e.target.value })
                      }
                      required
                      disabled={regionMode && loadingRolesForOrg}
                      className="w-full px-4 py-2 border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white disabled:opacity-50"
                    >
                      <option value="">
                        {regionMode && loadingRolesForOrg ? "Загрузка ролей..." : "Выберите роль"}
                      </option>
                      {(regionMode ? rolesForOrg : roles).map((role) => (
                        <option key={role.id} value={role.id}>
                          {role.name}
                        </option>
                      ))}
                    </select>
                    {regionMode && loadingRolesForOrg && (
                      <p className="text-xs text-gray-500 mt-1">Загрузка ролей...</p>
                    )}
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

      {/* Модалка редактирования сотрудника */}
      {showEditStaffModal && editingStaff && (
        <EditStaffModal
          member={editingStaff}
          roles={regionMode ? editStaffRoles : roles}
          loadingRoles={regionMode && loadingEditStaffRoles}
          onClose={() => {
            setShowEditStaffModal(false);
            setEditingStaff(null);
            setEditStaffRoles([]);
          }}
          onSave={handleSaveStaff}
        />
      )}
    </div>
  );
}

// Модалка редактирования сотрудника (роль)
function EditStaffModal({
  member,
  roles,
  loadingRoles = false,
  onClose,
  onSave,
}: {
  member: StaffMember;
  roles: StaffRole[];
  loadingRoles?: boolean;
  onClose: () => void;
  onSave: (staffId: string, roleId: string) => void;
}) {
  const [roleId, setRoleId] = useState(member.role?.id ?? "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setRoleId(member.role?.id ?? "");
  }, [member.id, member.role?.id]);

  const handleSave = async () => {
    const currentRoleId = member.role?.id ?? "";
    if (roleId === currentRoleId || !roleId) {
      onClose();
      return;
    }
    setSaving(true);
    await onSave(member.id, roleId);
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="mx-4 flex w-full max-w-md min-h-0 max-h-[90vh] flex-col overflow-hidden rounded-2xl bg-white dark:bg-gray-800">
        <div className="shrink-0 border-b border-gray-200 px-6 py-4 dark:border-gray-700">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
            Редактировать сотрудника
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {[member.user.lastName, member.user.firstName, member.user.middleName].filter(Boolean).join(" ") || member.user.email || "Без имени"}
            {member.user.email && (
              <span className="block text-gray-600 dark:text-gray-300 mt-1">{member.user.email}</span>
            )}
          </p>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
        <div>
          <label htmlFor="edit-member-role" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Роль (должность)
          </label>
          {loadingRoles ? (
            <p className="text-sm text-gray-500 dark:text-gray-400 py-2">Загрузка ролей...</p>
          ) : (
            <select
              id="edit-member-role"
              value={roleId}
              onChange={(e) => setRoleId(e.target.value)}
              className="w-full px-4 py-2 border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            >
              <option value="">Выберите роль</option>
              {roles.map((role) => (
                <option key={role.id} value={role.id}>
                  {role.name}
                </option>
              ))}
            </select>
          )}
        </div>
        </div>
        <div className="shrink-0 border-t border-gray-200 px-6 py-4 dark:border-gray-700">
        <div className="flex gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg"
          >
            Отмена
          </button>
          <button
            onClick={handleSave}
            disabled={saving || loadingRoles || !roleId}
            className="flex-1 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg disabled:opacity-50"
          >
            {saving ? "Сохранение..." : "Сохранить"}
          </button>
        </div>
        </div>
      </div>
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
      keys: ["documents_view", "documents_create", "documents_edit", "documents_review", "documents_approve", "documents_sign"],
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
      <div className="mx-4 flex w-full max-w-lg min-h-0 max-h-[90vh] flex-col overflow-hidden rounded-2xl bg-white dark:bg-gray-800">
        <div className="shrink-0 border-b border-gray-200 px-6 py-4 dark:border-gray-700">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
            Настройка роли: {role.name}
          </h2>
          {role.description && (
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {role.description}
            </p>
          )}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
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
        </div>
        <div className="shrink-0 border-t border-gray-200 px-6 py-4 dark:border-gray-700">
        <div className="flex gap-3">
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
    </div>
  );
}
