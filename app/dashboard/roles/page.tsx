"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";

interface RoleTemplate {
  id: string;
  name: string;
  description: string | null;
  permissions: Record<string, boolean>;
  isSystem: boolean;
  isActive: boolean;
  isElectedBody: boolean;
  isManagement: boolean;
  staffCount: number;
}

const PERMISSION_LABELS: Record<string, string> = {
  documents_view: "Просмотр документов",
  documents_create: "Создание заседаний и протоколов",
  documents_edit: "Редактирование документов",
  documents_approve: "Согласование документов",
  documents_sign: "Подписание протоколов",
  discounts_view: "Просмотр скидок",
  discounts_manage: "Управление скидками",
  members_view: "Просмотр членов",
  members_edit: "Редактирование членов",
  members_manage: "Управление членами (приём/исключение)",
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

const PERMISSION_GROUPS: { label: string; keys: string[] }[] = [
  { label: "Документы", keys: ["documents_view", "documents_create", "documents_edit", "documents_approve", "documents_sign"] },
  { label: "Члены", keys: ["members_view", "members_edit", "members_manage"] },
  { label: "Обращения", keys: ["appeals_view", "appeals_respond", "appeals_manage"] },
  { label: "Чаты", keys: ["chats_view", "chats_participate", "chats_create"] },
  { label: "Новости", keys: ["news_view", "news_create", "news_manage"] },
  { label: "Скидки", keys: ["discounts_view", "discounts_manage"] },
  { label: "Отчёты", keys: ["reports_view", "reports_create"] },
  { label: "Настройки", keys: ["settings_view", "settings_manage"] },
  { label: "Сотрудники", keys: ["staff_view", "staff_manage"] },
];

export default function RpoRolesPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [roles, setRoles] = useState<RoleTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [editingRole, setEditingRole] = useState<RoleTemplate | null>(null);
  const [publishingId, setPublishingId] = useState<string | null>(null);
  const [publishingAll, setPublishingAll] = useState(false);
  const [publishResult, setPublishResult] = useState<string | null>(null);

  const [form, setForm] = useState({
    name: "",
    description: "",
    permissions: {} as Record<string, boolean>,
    isElectedBody: false,
    isManagement: false,
  });

  const fetchRoles = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch("/api/rpo/roles");
      if (res.status === 403) {
        router.replace("/dashboard");
        return;
      }
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Ошибка загрузки");
      }
      const data = await res.json();
      setRoles(data.roles || []);
    } catch (err: any) {
      setError(err?.message || "Ошибка загрузки");
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    if (status === "authenticated") fetchRoles();
  }, [status, fetchRoles]);

  const openCreateModal = () => {
    setEditingRole(null);
    setForm({ name: "", description: "", permissions: {}, isElectedBody: false, isManagement: false });
    setShowModal(true);
  };

  const openEditModal = (role: RoleTemplate) => {
    setEditingRole(role);
    setForm({
      name: role.name,
      description: role.description || "",
      permissions: { ...role.permissions },
      isElectedBody: role.isElectedBody,
      isManagement: role.isManagement,
    });
    setShowModal(true);
  };

  const handleSave = async () => {
    try {
      const url = editingRole ? `/api/rpo/roles/${editingRole.id}` : "/api/rpo/roles";
      const method = editingRole ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const data = await res.json();
        alert(data.error || "Ошибка сохранения");
        return;
      }
      setShowModal(false);
      fetchRoles();
    } catch {
      alert("Ошибка сети");
    }
  };

  const handleDelete = async (role: RoleTemplate) => {
    if (!confirm(`Удалить роль "${role.name}"?`)) return;
    try {
      const res = await fetch(`/api/rpo/roles/${role.id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json();
        alert(data.error || "Ошибка удаления");
        return;
      }
      fetchRoles();
    } catch {
      alert("Ошибка сети");
    }
  };

  const handlePublish = async (role: RoleTemplate) => {
    if (!confirm(`Опубликовать роль "${role.name}" во все подчинённые ППО?`)) return;
    setPublishingId(role.id);
    setPublishResult(null);
    try {
      const res = await fetch(`/api/rpo/roles/${role.id}/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || "Ошибка публикации");
        return;
      }
      setPublishResult(`Роль "${data.templateName}" опубликована в ${data.publishedCount} организаций`);
    } catch {
      alert("Ошибка сети");
    } finally {
      setPublishingId(null);
    }
  };

  const handlePublishAll = async () => {
    if (!confirm("Опубликовать все роли во все подчинённые ППО?")) return;
    setPublishingAll(true);
    setPublishResult(null);
    try {
      const res = await fetch("/api/rpo/roles/publish-all", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || "Ошибка публикации");
        return;
      }
      setPublishResult(
        `Опубликовано ${data.publishedRoles} ролей в ${data.organizationsCount} организаций`
      );
    } catch {
      alert("Ошибка сети");
    } finally {
      setPublishingAll(false);
    }
  };

  const togglePermission = (key: string) => {
    setForm((prev) => ({
      ...prev,
      permissions: { ...prev.permissions, [key]: !prev.permissions[key] },
    }));
  };

  const toggleGroupAll = (keys: string[]) => {
    const allEnabled = keys.every((k) => form.permissions[k]);
    const newPerms = { ...form.permissions };
    keys.forEach((k) => { newPerms[k] = !allEnabled; });
    setForm((prev) => ({ ...prev, permissions: newPerms }));
  };

  const countActivePermissions = (perms: Record<string, boolean>) =>
    Object.values(perms).filter(Boolean).length;

  if (status === "loading" || loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="px-4 py-8 sm:px-8 lg:px-12">
        <div className="rounded-lg bg-red-50 p-4 text-red-700 dark:bg-red-900/20 dark:text-red-300">
          {error}
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 py-8 sm:px-8 lg:px-12 max-w-6xl">
      <div className="flex items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            Роли и должности
          </h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Управление шаблонами ролей для избирательного органа ППО
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handlePublishAll}
            disabled={publishingAll || roles.length === 0}
            className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors"
          >
            {publishingAll ? "Публикация..." : "Опубликовать все"}
          </button>
          <button
            onClick={openCreateModal}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Создать роль
          </button>
        </div>
      </div>

      {publishResult && (
        <div className="mb-4 rounded-lg bg-green-50 border border-green-200 p-3 text-sm text-green-700 dark:bg-green-900/20 dark:border-green-800 dark:text-green-300">
          {publishResult}
          <button onClick={() => setPublishResult(null)} className="ml-2 underline">Скрыть</button>
        </div>
      )}

      {roles.length === 0 ? (
        <div className="text-center py-12 text-gray-500 dark:text-gray-400">
          <svg className="mx-auto h-12 w-12 mb-3 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
          </svg>
          <p className="font-medium">Ролей пока нет</p>
          <p className="text-sm mt-1">Создайте первую роль для избирательного органа</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {roles.map((role) => (
            <div
              key={role.id}
              className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-gray-900 dark:text-white truncate">
                    {role.name}
                  </h3>
                  {role.description && (
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400 line-clamp-2">
                      {role.description}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-1 ml-2">
                  {role.isSystem && (
                    <span className="inline-flex items-center rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-600 dark:bg-blue-900/30 dark:text-blue-300">
                      Системная
                    </span>
                  )}
                  {role.isElectedBody && (
                    <span className="inline-flex items-center rounded-full bg-purple-50 px-2 py-0.5 text-xs font-medium text-purple-600 dark:bg-purple-900/30 dark:text-purple-300">
                      ИО
                    </span>
                  )}
                </div>
              </div>

              <div className="mt-3 flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
                <span>{countActivePermissions(role.permissions)} прав</span>
                <span>{role.staffCount} сотр.</span>
                {!role.isActive && (
                  <span className="text-red-500">Неактивна</span>
                )}
              </div>

              <div className="mt-4 flex items-center gap-2">
                <button
                  onClick={() => openEditModal(role)}
                  className="flex-1 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700 transition-colors"
                >
                  Редактировать
                </button>
                <button
                  onClick={() => handlePublish(role)}
                  disabled={publishingId === role.id}
                  className="flex-1 rounded-lg bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-50 transition-colors"
                >
                  {publishingId === role.id ? "..." : "Опубликовать"}
                </button>
                {!role.isSystem && role.staffCount === 0 && (
                  <button
                    onClick={() => handleDelete(role)}
                    className="rounded-lg border border-red-200 p-1.5 text-red-500 hover:bg-red-50 dark:border-red-800 dark:hover:bg-red-900/20 transition-colors"
                    title="Удалить"
                  >
                    <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl bg-white p-6 shadow-xl dark:bg-gray-800 mx-4">
            <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-4">
              {editingRole ? "Редактирование роли" : "Новая роль"}
            </h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Название
                </label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                  placeholder="Например: Заместитель председателя"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Описание
                </label>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  rows={2}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                  placeholder="Краткое описание обязанностей"
                />
              </div>

              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={form.isElectedBody}
                    onChange={(e) => setForm({ ...form, isElectedBody: e.target.checked })}
                    className="rounded border-gray-300"
                  />
                  <span className="text-gray-700 dark:text-gray-300">Избирательный орган</span>
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={form.isManagement}
                    onChange={(e) => setForm({ ...form, isManagement: e.target.checked })}
                    className="rounded border-gray-300"
                  />
                  <span className="text-gray-700 dark:text-gray-300">Руководство</span>
                </label>
              </div>

              <div>
                <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Права доступа</h3>
                <div className="space-y-3">
                  {PERMISSION_GROUPS.map((group) => {
                    const allEnabled = group.keys.every((k) => form.permissions[k]);
                    return (
                      <div key={group.label} className="rounded-lg border border-gray-100 p-3 dark:border-gray-700">
                        <button
                          type="button"
                          onClick={() => toggleGroupAll(group.keys)}
                          className="flex items-center gap-2 text-sm font-medium text-gray-800 dark:text-gray-200 mb-2 hover:text-blue-600"
                        >
                          <span
                            aria-hidden
                            className={`inline-block h-4 w-4 rounded border ${allEnabled ? "bg-blue-500 border-blue-500" : "bg-white border-gray-300"}`}
                          />
                          {group.label}
                        </button>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 pl-6">
                          {group.keys.map((key) => (
                            <label key={key} className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
                              <input
                                type="checkbox"
                                checked={!!form.permissions[key]}
                                onChange={() => togglePermission(key)}
                                className="rounded border-gray-300"
                              />
                              {PERMISSION_LABELS[key] || key}
                            </label>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => setShowModal(false)}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
              >
                Отмена
              </button>
              <button
                onClick={handleSave}
                disabled={!form.name.trim()}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {editingRole ? "Сохранить" : "Создать"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
