"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

type Member = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  middleName: string | null;
  email: string | null;
  phone: string | null;
  jobTitle: string | null;
  membershipStatus: string;
  unionMembershipStatus: string | null;
  role: string;
  isPPOHead: boolean;
  ppoHeadOrganizationId: string | null;
  createdAt: string;
  organizationId: string | null;
  organization: { id: string; name: string; type: string } | null;
  ppoHeadOrganization: { id: string; name: string } | null;
};

type OrgItem = { id: string; name: string; type: string };

export default function OrgHeadUserDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const [id, setId] = useState<string | null>(null);
  const [member, setMember] = useState<Member | null>(null);
  const [organizations, setOrganizations] = useState<OrgItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    middleName: "",
    email: "",
    phone: "",
    jobTitle: "",
    organizationId: "",
  });

  const resolveParams = useCallback(async () => {
    const p = await params;
    setId(p.id);
  }, [params]);

  useEffect(() => {
    resolveParams();
  }, [resolveParams]);

  const fetchMember = useCallback(async (userId: string) => {
    const res = await fetch(`/api/org-head/members/${userId}`);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || "Ошибка загрузки");
    }
    const data = await res.json();
    const m = data.member as Member;
    setMember(m);
    setForm({
      firstName: m.firstName ?? "",
      lastName: m.lastName ?? "",
      middleName: m.middleName ?? "",
      email: m.email ?? "",
      phone: m.phone ?? "",
      jobTitle: m.jobTitle ?? "",
      organizationId: m.organizationId ?? "",
    });
  }, []);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    setError(null);
    fetchMember(id)
      .catch((e) => setError(e?.message || "Ошибка"))
      .finally(() => setLoading(false));
  }, [id, fetchMember]);

  useEffect(() => {
    if (!editing) return;
    fetch("/api/org-head/organizations")
      .then((r) => r.json())
      .then((data) => setOrganizations(data.organizations || []))
      .catch(() => setOrganizations([]));
  }, [editing]);

  const handleSave = async () => {
    if (!id) return;
    setSaving(true);
    setSaveMessage(null);
    try {
      const res = await fetch(`/api/org-head/members/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName: form.firstName.trim() || null,
          lastName: form.lastName.trim() || null,
          middleName: form.middleName.trim() || null,
          email: form.email.trim() || null,
          phone: form.phone.trim() || null,
          jobTitle: form.jobTitle.trim() || null,
          ...(member && !member.isPPOHead && form.organizationId ? { organizationId: form.organizationId } : {}),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSaveMessage({ type: "error", text: data.error || "Ошибка сохранения" });
        return;
      }
      setSaveMessage({ type: "success", text: "Сохранено" });
      setMember((prev) => (prev ? { ...prev, ...data.member } : null));
      setEditing(false);
    } catch {
      setSaveMessage({ type: "error", text: "Ошибка сети" });
    } finally {
      setSaving(false);
    }
  };

  if (!id || loading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
      </div>
    );
  }

  if (error || !member) {
    return (
      <div className="px-4 py-8 sm:px-8 lg:px-12">
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300">
          {error || "Пользователь не найден"}
        </div>
        <Link
          href="/dashboard/users/org-head"
          className="mt-4 inline-block text-blue-600 hover:underline dark:text-blue-400"
        >
          ← К списку пользователей
        </Link>
      </div>
    );
  }

  const fio = [member.lastName, member.firstName, member.middleName].filter(Boolean).join(" ") || "—";

  return (
    <div className="px-4 py-8 sm:px-8 lg:px-12 max-w-3xl">
      <div className="mb-6 flex items-center gap-4">
        <Link
          href="/dashboard/users/org-head"
          className="text-sm font-medium text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
        >
          ← Пользователи
        </Link>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800 overflow-hidden">
        <div className="border-b border-gray-200 bg-gray-50 px-6 py-4 dark:border-gray-700 dark:bg-gray-900">
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">{fio}</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Карточка пользователя (редактирование без персонализации)
          </p>
        </div>

        <div className="p-6 space-y-6">
          {saveMessage && (
            <div
              className={`rounded-lg p-3 text-sm ${
                saveMessage.type === "success"
                  ? "bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-300"
                  : "bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-300"
              }`}
            >
              {saveMessage.text}
            </div>
          )}

          {!editing ? (
            <>
              <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">ФИО</dt>
                  <dd className="mt-1 text-sm text-gray-900 dark:text-white">{fio}</dd>
                </div>
                <div>
                  <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">Email</dt>
                  <dd className="mt-1 text-sm text-gray-900 dark:text-white">{member.email || "—"}</dd>
                </div>
                <div>
                  <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">Телефон</dt>
                  <dd className="mt-1 text-sm text-gray-900 dark:text-white">{member.phone || "—"}</dd>
                </div>
                <div>
                  <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">Должность</dt>
                  <dd className="mt-1 text-sm text-gray-900 dark:text-white">{member.jobTitle || "—"}</dd>
                </div>
                <div>
                  <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">Организация</dt>
                  <dd className="mt-1 text-sm text-gray-900 dark:text-white">
                    {member.organization?.name || member.ppoHeadOrganization?.name || "—"}
                  </dd>
                </div>
                <div>
                  <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">Статус членства</dt>
                  <dd className="mt-1">
                    <span className="inline-flex rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700 dark:bg-gray-600 dark:text-gray-300">
                      {member.membershipStatus}
                    </span>
                  </dd>
                </div>
                <div>
                  <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">Роль</dt>
                  <dd className="mt-1 text-sm text-gray-900 dark:text-white">
                    {member.isPPOHead ? "Председатель ППО" : member.role}
                  </dd>
                </div>
                <div>
                  <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">Дата регистрации</dt>
                  <dd className="mt-1 text-sm text-gray-900 dark:text-white">
                    {new Date(member.createdAt).toLocaleDateString("ru-RU")}
                  </dd>
                </div>
              </dl>
              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setEditing(true)}
                  className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600"
                >
                  Редактировать
                </button>
                {member.membershipStatus !== "APPROVED" && (
                  <button
                    type="button"
                    onClick={async () => {
                      const res = await fetch(`/api/org-head/members/${id}/approve`, { method: "POST" });
                      if (res.ok) fetchMember(id);
                    }}
                    className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700"
                  >
                    Одобрить
                  </button>
                )}
                {member.membershipStatus === "APPROVED" && (
                  <button
                    type="button"
                    onClick={async () => {
                      if (!confirm("Исключить из профсоюза?")) return;
                      const res = await fetch(`/api/org-head/members/${id}/exclude`, { method: "POST" });
                      if (res.ok) fetchMember(id);
                    }}
                    className="rounded-lg border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 dark:border-red-700 dark:bg-gray-800 dark:text-red-400 dark:hover:bg-red-900/20"
                  >
                    Исключить
                  </button>
                )}
              </div>
            </>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="edit-lastName" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Фамилия</label>
                  <input
                    id="edit-lastName"
                    type="text"
                    value={form.lastName}
                    onChange={(e) => setForm((f) => ({ ...f, lastName: e.target.value }))}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                    aria-label="Фамилия"
                  />
                </div>
                <div>
                  <label htmlFor="edit-firstName" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Имя</label>
                  <input
                    id="edit-firstName"
                    type="text"
                    value={form.firstName}
                    onChange={(e) => setForm((f) => ({ ...f, firstName: e.target.value }))}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                    aria-label="Имя"
                  />
                </div>
                <div>
                  <label htmlFor="edit-middleName" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Отчество</label>
                  <input
                    id="edit-middleName"
                    type="text"
                    value={form.middleName}
                    onChange={(e) => setForm((f) => ({ ...f, middleName: e.target.value }))}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                    aria-label="Отчество"
                  />
                </div>
                <div>
                  <label htmlFor="edit-email" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Email</label>
                  <input
                    id="edit-email"
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                    aria-label="Email"
                  />
                </div>
                <div>
                  <label htmlFor="edit-phone" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Телефон</label>
                  <input
                    id="edit-phone"
                    type="tel"
                    value={form.phone}
                    onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                    aria-label="Телефон"
                  />
                </div>
                <div>
                  <label htmlFor="edit-jobTitle" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Должность</label>
                  <input
                    id="edit-jobTitle"
                    type="text"
                    value={form.jobTitle}
                    onChange={(e) => setForm((f) => ({ ...f, jobTitle: e.target.value }))}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                    aria-label="Должность"
                  />
                </div>
                {!member.isPPOHead && organizations.length > 0 && (
                  <div className="sm:col-span-2">
                    <label htmlFor="edit-organizationId" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Организация</label>
                    <select
                      id="edit-organizationId"
                      value={form.organizationId}
                      onChange={(e) => setForm((f) => ({ ...f, organizationId: e.target.value }))}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                      aria-label="Организация"
                    >
                      {organizations.map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saving}
                  className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {saving ? "Сохранение…" : "Сохранить"}
                </button>
                <button
                  type="button"
                  onClick={() => { setEditing(false); setForm({ firstName: member.firstName ?? "", lastName: member.lastName ?? "", middleName: member.middleName ?? "", email: member.email ?? "", phone: member.phone ?? "", jobTitle: member.jobTitle ?? "", organizationId: member.organizationId ?? "" }); }}
                  className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
                >
                  Отмена
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
