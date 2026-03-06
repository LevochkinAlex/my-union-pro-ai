"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { OrganizationType } from "@prisma/client";
import { Building2 } from "lucide-react";
import { ORG_TYPE_LABELS } from "@/lib/status-labels";

interface OrganizationDetail {
  id: string;
  name: string;
  type: OrganizationType;
  parentId: string | null;
  inn: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  chairmanName: string | null;
  chairmanJobTitle: string | null;
  totalEmployees: number | null;
  isActive: boolean;
  parent?: { id: string; name: string; type: string } | null;
  membersCount: number;
  reportsCount: number;
  documentsCount: number;
  ticketsCount: number;
}

export default function OrganizationDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const [id, setId] = useState<string | null>(null);
  const [organization, setOrganization] = useState<OrganizationDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [form, setForm] = useState({
    name: "",
    address: "",
    email: "",
    phone: "",
    inn: "",
    chairmanName: "",
    chairmanJobTitle: "",
    totalEmployees: "",
  });
  const [assignOpen, setAssignOpen] = useState(false);
  const [headSearch, setHeadSearch] = useState("");
  const [headCandidates, setHeadCandidates] = useState<Array<{ id: string; firstName: string | null; lastName: string | null; email: string | null; phone: string | null }>>([]);
  const [selectedHeadUserId, setSelectedHeadUserId] = useState<string | null>(null);
  const [headJobTitle, setHeadJobTitle] = useState("");
  const [isAssigningHead, setIsAssigningHead] = useState(false);

  const resolveParams = useCallback(async () => {
    const p = await params;
    setId(p.id);
  }, [params]);

  useEffect(() => {
    resolveParams();
  }, [resolveParams]);

  const fetchOrg = useCallback(async (orgId: string) => {
    const res = await fetch(`/api/org-head/organizations/${orgId}`);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || "Ошибка загрузки");
    }
    const data = await res.json();
    const org = data.organization as OrganizationDetail;
    setOrganization(org);
    setForm({
      name: org.name ?? "",
      address: org.address ?? "",
      email: org.email ?? "",
      phone: org.phone ?? "",
      inn: org.inn ?? "",
      chairmanName: org.chairmanName ?? "",
      chairmanJobTitle: org.chairmanJobTitle ?? "",
      totalEmployees: String(org.totalEmployees ?? 0),
    });
  }, []);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    setError(null);
    fetchOrg(id).catch((e) => setError(e?.message)).finally(() => setLoading(false));
  }, [id, fetchOrg]);

  useEffect(() => {
    if (!assignOpen || !id) return;
    const q = headSearch.trim();
    if (q.length < 2) {
      setHeadCandidates([]);
      return;
    }
    fetch(`/api/chat/users/search?q=${encodeURIComponent(q)}&limit=20`)
      .then((r) => r.json())
      .then((data) => setHeadCandidates(data.users || []))
      .catch(() => setHeadCandidates([]));
  }, [assignOpen, headSearch, id]);

  const handleSave = async () => {
    if (!id) return;
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/org-head/organizations/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim() || undefined,
          address: form.address.trim() || null,
          email: form.email.trim() || null,
          phone: form.phone.trim() || null,
          inn: form.inn.trim() || null,
          chairmanName: form.chairmanName.trim() || null,
          chairmanJobTitle: form.chairmanJobTitle.trim() || null,
          totalEmployees: form.totalEmployees ? Number(form.totalEmployees) : null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage({ type: "error", text: data.error || "Ошибка сохранения" });
        return;
      }
      setMessage({ type: "success", text: "Сохранено" });
      setEditing(false);
      if (data.organization) setOrganization((prev) => (prev ? { ...prev, ...data.organization } : null));
    } catch {
      setMessage({ type: "error", text: "Ошибка сети" });
    } finally {
      setSaving(false);
    }
  };

  const assignHead = async () => {
    if (!id || !selectedHeadUserId) return;
    setIsAssigningHead(true);
    try {
      const res = await fetch(`/api/org-head/organizations/${id}/assign-head`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: selectedHeadUserId, chairmanJobTitle: headJobTitle.trim() || null }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Ошибка назначения");
      }
      setAssignOpen(false);
      setHeadSearch("");
      setHeadCandidates([]);
      setSelectedHeadUserId(null);
      setHeadJobTitle("");
      fetchOrg(id);
    } catch (e: any) {
      alert(e?.message || "Не удалось назначить председателя");
    } finally {
      setIsAssigningHead(false);
    }
  };

  if (!id || loading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
      </div>
    );
  }

  if (error || !organization) {
    return (
      <div className="px-4 py-8 sm:px-8 lg:px-12">
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300">
          {error || "Организация не найдена"}
        </div>
        <Link href="/dashboard/organizations" className="mt-4 inline-block text-blue-600 hover:underline dark:text-blue-400">
          ← К списку организаций
        </Link>
      </div>
    );
  }

  return (
    <div className="px-4 py-8 sm:px-8 lg:px-12 max-w-4xl">
      <div className="mb-6">
        <Link href="/dashboard/organizations" className="text-sm font-medium text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300">
          ← Организации
        </Link>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800 overflow-hidden">
        <div className="border-b border-gray-200 bg-gray-50 px-6 py-4 dark:border-gray-700 dark:bg-gray-900">
          <h1 className="flex items-center gap-2 text-xl font-bold text-gray-900 dark:text-white">
            <Building2 className="h-6 w-6" /> {organization.name}
          </h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Тип: {ORG_TYPE_LABELS[organization.type]} · Членов: {organization.membersCount} · Отчётов: {organization.reportsCount}
          </p>
        </div>

        <div className="p-6 space-y-6">
          {message && (
            <div className={`rounded-lg p-3 text-sm ${message.type === "success" ? "bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-300" : "bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-300"}`}>
              {message.text}
            </div>
          )}

          {!editing ? (
            <>
              <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div><dt className="text-sm font-medium text-gray-500 dark:text-gray-400">Название</dt><dd className="mt-1 text-gray-900 dark:text-white">{organization.name}</dd></div>
                <div><dt className="text-sm font-medium text-gray-500 dark:text-gray-400">Тип</dt><dd className="mt-1 text-gray-900 dark:text-white">{ORG_TYPE_LABELS[organization.type]}</dd></div>
                <div><dt className="text-sm font-medium text-gray-500 dark:text-gray-400">ИНН</dt><dd className="mt-1 text-gray-900 dark:text-white">{organization.inn || "—"}</dd></div>
                <div><dt className="text-sm font-medium text-gray-500 dark:text-gray-400">Адрес</dt><dd className="mt-1 text-gray-900 dark:text-white">{organization.address || "—"}</dd></div>
                <div><dt className="text-sm font-medium text-gray-500 dark:text-gray-400">Email</dt><dd className="mt-1 text-gray-900 dark:text-white">{organization.email || "—"}</dd></div>
                <div><dt className="text-sm font-medium text-gray-500 dark:text-gray-400">Телефон</dt><dd className="mt-1 text-gray-900 dark:text-white">{organization.phone || "—"}</dd></div>
                <div><dt className="text-sm font-medium text-gray-500 dark:text-gray-400">Председатель</dt><dd className="mt-1 text-gray-900 dark:text-white">{organization.chairmanName || "—"}</dd></div>
                <div><dt className="text-sm font-medium text-gray-500 dark:text-gray-400">Должность председателя</dt><dd className="mt-1 text-gray-900 dark:text-white">{organization.chairmanJobTitle || "—"}</dd></div>
                <div><dt className="text-sm font-medium text-gray-500 dark:text-gray-400">Численность</dt><dd className="mt-1 text-gray-900 dark:text-white">{organization.totalEmployees ?? "—"}</dd></div>
                <div><dt className="text-sm font-medium text-gray-500 dark:text-gray-400">Членов / Отчётов / Документов / Обращений</dt><dd className="mt-1 text-gray-900 dark:text-white">{organization.membersCount} / {organization.reportsCount} / {organization.documentsCount} / {organization.ticketsCount}</dd></div>
              </dl>
              <div className="flex gap-3 pt-4">
                <button type="button" onClick={() => setEditing(true)} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
                  Редактировать
                </button>
                <button type="button" onClick={() => { setAssignOpen(true); setHeadJobTitle(organization.chairmanJobTitle || ""); }} className="rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-700">
                  Назначить председателя
                </button>
              </div>
            </>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="org-name" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Название</label>
                  <input id="org-name" type="text" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white" />
                </div>
                <div>
                  <label htmlFor="org-inn" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">ИНН</label>
                  <input id="org-inn" type="text" value={form.inn} onChange={(e) => setForm((f) => ({ ...f, inn: e.target.value }))} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white" />
                </div>
                <div className="sm:col-span-2">
                  <label htmlFor="org-address" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Адрес</label>
                  <input id="org-address" type="text" value={form.address} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white" />
                </div>
                <div>
                  <label htmlFor="org-email" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Email</label>
                  <input id="org-email" type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white" />
                </div>
                <div>
                  <label htmlFor="org-phone" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Телефон</label>
                  <input id="org-phone" type="tel" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white" />
                </div>
                <div>
                  <label htmlFor="org-chairman" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">ФИО председателя</label>
                  <input id="org-chairman" type="text" value={form.chairmanName} onChange={(e) => setForm((f) => ({ ...f, chairmanName: e.target.value }))} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white" />
                </div>
                <div>
                  <label htmlFor="org-chairman-job" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Должность председателя</label>
                  <input id="org-chairman-job" type="text" value={form.chairmanJobTitle} onChange={(e) => setForm((f) => ({ ...f, chairmanJobTitle: e.target.value }))} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white" />
                </div>
                <div>
                  <label htmlFor="org-total" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Численность</label>
                  <input id="org-total" type="number" min={0} value={form.totalEmployees} onChange={(e) => setForm((f) => ({ ...f, totalEmployees: e.target.value }))} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white" />
                </div>
              </div>
              <div className="flex gap-3 pt-4">
                <button type="button" onClick={handleSave} disabled={saving} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">{saving ? "Сохранение…" : "Сохранить"}</button>
                <button type="button" onClick={() => setEditing(false)} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700">Отмена</button>
              </div>
            </div>
          )}
        </div>
      </div>

      {assignOpen && (
        <div className="mt-6 rounded-xl bg-white p-4 shadow-sm dark:bg-gray-800">
          <h3 className="mb-3 text-base font-semibold text-gray-900 dark:text-white">Назначение председателя</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <input value={headSearch} onChange={(e) => setHeadSearch(e.target.value)} placeholder="Поиск пользователя (ФИО, email, телефон)" className="rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white" aria-label="Поиск пользователя" />
            <input value={headJobTitle} onChange={(e) => setHeadJobTitle(e.target.value)} placeholder="Должность председателя" className="rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white" aria-label="Должность председателя" />
          </div>
          <div className="mt-3 max-h-56 overflow-y-auto rounded-lg border border-gray-200 dark:border-gray-700">
            {headCandidates.length === 0 ? (
              <p className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400">Введите минимум 2 символа для поиска</p>
            ) : (
              headCandidates.map((u) => {
                const fullName = [u.lastName, u.firstName].filter(Boolean).join(" ").trim() || "Без имени";
                return (
                  <button key={u.id} type="button" onClick={() => setSelectedHeadUserId(u.id)} className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-gray-50 dark:hover:bg-gray-700 ${selectedHeadUserId === u.id ? "bg-blue-50 dark:bg-blue-900/20" : ""}`}>
                    <span className="font-medium text-gray-900 dark:text-white">{fullName}</span>
                    <span className="text-xs text-gray-500 dark:text-gray-400">{u.email || u.phone || "—"}</span>
                  </button>
                );
              })
            )}
          </div>
          <div className="mt-3 flex justify-end gap-2">
            <button type="button" onClick={() => setAssignOpen(false)} className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700">Отмена</button>
            <button type="button" onClick={assignHead} disabled={!selectedHeadUserId || isAssigningHead} className="rounded-lg bg-purple-600 px-3 py-1.5 text-sm text-white hover:bg-purple-700 disabled:opacity-50">{isAssigningHead ? "Назначение…" : "Назначить"}</button>
          </div>
        </div>
      )}
    </div>
  );
}
