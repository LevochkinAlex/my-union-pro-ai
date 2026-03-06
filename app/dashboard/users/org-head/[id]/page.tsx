"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  getMembershipStatusBadgeClass,
  getMembershipStatusLabel,
  getUserRoleLabel,
} from "@/lib/status-labels";

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
  membershipJoinedAt: string | null;
  membershipExcludedAt: string | null;
  membershipExclusionReason: string | null;
  dateOfBirth: string | null;
  address: string | null;
  workplace: string | null;
  unionCardNumber: string | null;
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
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [showRejectForm, setShowRejectForm] = useState(false);
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    middleName: "",
    email: "",
    phone: "",
    jobTitle: "",
    organizationId: "",
    membershipJoinedAt: "",
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
      membershipJoinedAt: m.membershipJoinedAt ? m.membershipJoinedAt.slice(0, 10) : "",
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
          membershipJoinedAt: form.membershipJoinedAt || null,
          ...(member && !member.isPPOHead && form.organizationId ? { organizationId: form.organizationId } : {}),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSaveMessage({ type: "error", text: data.error || "Ошибка сохранения" });
        return;
      }
      setSaveMessage({ type: "success", text: "Сохранено" });
      await fetchMember(id);
      setEditing(false);
    } catch {
      setSaveMessage({ type: "error", text: "Ошибка сети" });
    } finally {
      setSaving(false);
    }
  };

  const handleApprove = async () => {
    if (!id) return;
    setActionLoading("approve");
    const res = await fetch(`/api/org-head/members/${id}/approve`, { method: "POST" });
    if (res.ok) await fetchMember(id);
    setActionLoading(null);
  };

  const handleReject = async () => {
    if (!id || !rejectReason.trim()) return;
    setActionLoading("reject");
    const res = await fetch(`/api/org-head/members/${id}/reject`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason: rejectReason.trim() }),
    });
    if (res.ok) {
      setShowRejectForm(false);
      setRejectReason("");
      await fetchMember(id);
    } else {
      const data = await res.json().catch(() => ({}));
      setSaveMessage({ type: "error", text: data.error || "Ошибка отклонения" });
    }
    setActionLoading(null);
  };

  const handleExclude = async () => {
    if (!id || !confirm("Исключить из профсоюза?")) return;
    setActionLoading("exclude");
    const res = await fetch(`/api/org-head/members/${id}/exclude`, { method: "POST" });
    if (res.ok) await fetchMember(id);
    setActionLoading(null);
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
  const isAccepted = member.unionMembershipStatus === "ACCEPTED" || member.membershipStatus === "APPROVED";
  const isPending = !isAccepted && !["EXCLUDED", "REJECTED", "REMOVED"].includes(member.membershipStatus);
  const isExcluded = member.membershipStatus === "EXCLUDED" || member.membershipStatus === "REJECTED";

  const effectiveStatus =
    member.unionMembershipStatus === "ACCEPTED"
      ? "ACCEPTED"
      : member.unionMembershipStatus === "REMOVED"
        ? "REMOVED"
        : member.membershipStatus;

  return (
    <div className="px-4 py-8 sm:px-8 lg:px-12 max-w-4xl">
      <div className="mb-6 flex items-center justify-between gap-4">
        <Link
          href="/dashboard/users/org-head"
          className="text-sm font-medium text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
        >
          ← Пользователи
        </Link>
        <a
          href={`/api/org-head/members/${id}/pdf`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          Скачать PDF
        </a>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800 overflow-hidden">
        {/* Header */}
        <div className="border-b border-gray-200 bg-gray-50 px-6 py-4 dark:border-gray-700 dark:bg-gray-900">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h1 className="text-xl font-bold text-gray-900 dark:text-white">{fio}</h1>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${getMembershipStatusBadgeClass(effectiveStatus)}`}>
                  {getMembershipStatusLabel(effectiveStatus)}
                </span>
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  {getUserRoleLabel(member.role, member.isPPOHead)}
                </span>
                {member.unionCardNumber && (
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    Билет: {member.unionCardNumber}
                  </span>
                )}
              </div>
            </div>
          </div>
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
              {/* Info grid */}
              <dl className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
                <InfoItem label="ФИО" value={fio} />
                <InfoItem label="Email" value={member.email} />
                <InfoItem label="Телефон" value={member.phone} />
                <InfoItem label="Должность" value={member.jobTitle} />
                <InfoItem label="Организация" value={member.organization?.name || member.ppoHeadOrganization?.name} />
                <InfoItem
                  label="Дата вступления"
                  value={member.membershipJoinedAt ? new Date(member.membershipJoinedAt).toLocaleDateString("ru-RU") : null}
                />
                <InfoItem label="Дата рождения" value={member.dateOfBirth ? new Date(member.dateOfBirth).toLocaleDateString("ru-RU") : null} />
                <InfoItem label="Адрес" value={member.address} />
                <InfoItem label="Место работы" value={member.workplace} />
                <InfoItem
                  label="Дата регистрации"
                  value={new Date(member.createdAt).toLocaleDateString("ru-RU")}
                />
                {isExcluded && (
                  <>
                    <InfoItem
                      label="Дата исключения"
                      value={member.membershipExcludedAt ? new Date(member.membershipExcludedAt).toLocaleDateString("ru-RU") : null}
                    />
                    <InfoItem label="Причина исключения" value={member.membershipExclusionReason} />
                  </>
                )}
              </dl>

              {/* Actions */}
              <div className="flex flex-wrap gap-3 border-t border-gray-200 pt-4 dark:border-gray-700">
                <button
                  type="button"
                  onClick={() => setEditing(true)}
                  className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
                >
                  Редактировать
                </button>

                {isPending && (
                  <>
                    <button
                      type="button"
                      onClick={handleApprove}
                      disabled={!!actionLoading}
                      className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
                    >
                      {actionLoading === "approve" ? "..." : "Одобрить"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowRejectForm(!showRejectForm)}
                      className="rounded-lg border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 dark:border-red-700 dark:bg-gray-800 dark:text-red-400"
                    >
                      Отклонить
                    </button>
                  </>
                )}

                {isAccepted && (
                  <button
                    type="button"
                    onClick={handleExclude}
                    disabled={!!actionLoading}
                    className="rounded-lg border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 dark:border-red-700 dark:bg-gray-800 dark:text-red-400 disabled:opacity-50"
                  >
                    {actionLoading === "exclude" ? "..." : "Исключить"}
                  </button>
                )}
              </div>

              {/* Reject form */}
              {showRejectForm && isPending && (
                <div className="rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-800 dark:bg-red-900/20">
                  <label className="mb-2 block text-sm font-medium text-red-700 dark:text-red-300">
                    Причина отклонения <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                    rows={3}
                    placeholder="Укажите причину отклонения заявки..."
                    className="w-full rounded-lg border border-red-300 bg-white px-3 py-2 text-sm dark:border-red-600 dark:bg-gray-700 dark:text-white"
                  />
                  <div className="mt-2 flex gap-2">
                    <button
                      type="button"
                      onClick={handleReject}
                      disabled={!rejectReason.trim() || !!actionLoading}
                      className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
                    >
                      {actionLoading === "reject" ? "Отклонение..." : "Подтвердить отклонение"}
                    </button>
                    <button
                      type="button"
                      onClick={() => { setShowRejectForm(false); setRejectReason(""); }}
                      className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300"
                    >
                      Отмена
                    </button>
                  </div>
                </div>
              )}
            </>
          ) : (
            /* Edit form */
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <FormField id="edit-lastName" label="Фамилия" value={form.lastName} onChange={(v) => setForm((f) => ({ ...f, lastName: v }))} />
                <FormField id="edit-firstName" label="Имя" value={form.firstName} onChange={(v) => setForm((f) => ({ ...f, firstName: v }))} />
                <FormField id="edit-middleName" label="Отчество" value={form.middleName} onChange={(v) => setForm((f) => ({ ...f, middleName: v }))} />
                <FormField id="edit-email" label="Email" type="email" value={form.email} onChange={(v) => setForm((f) => ({ ...f, email: v }))} />
                <FormField id="edit-phone" label="Телефон" type="tel" value={form.phone} onChange={(v) => setForm((f) => ({ ...f, phone: v }))} />
                <FormField id="edit-jobTitle" label="Должность" value={form.jobTitle} onChange={(v) => setForm((f) => ({ ...f, jobTitle: v }))} />
                <div>
                  <label htmlFor="edit-membershipJoinedAt" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Дата вступления
                  </label>
                  <input
                    id="edit-membershipJoinedAt"
                    type="date"
                    value={form.membershipJoinedAt}
                    onChange={(e) => setForm((f) => ({ ...f, membershipJoinedAt: e.target.value }))}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                  />
                </div>
                {!member.isPPOHead && organizations.length > 0 && (
                  <div>
                    <label htmlFor="edit-organizationId" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Организация
                    </label>
                    <select
                      id="edit-organizationId"
                      value={form.organizationId}
                      onChange={(e) => setForm((f) => ({ ...f, organizationId: e.target.value }))}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                    >
                      {organizations.map((o) => (
                        <option key={o.id} value={o.id}>{o.name}</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
              <div className="flex gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
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
                  onClick={() => {
                    setEditing(false);
                    setForm({
                      firstName: member.firstName ?? "",
                      lastName: member.lastName ?? "",
                      middleName: member.middleName ?? "",
                      email: member.email ?? "",
                      phone: member.phone ?? "",
                      jobTitle: member.jobTitle ?? "",
                      organizationId: member.organizationId ?? "",
                      membershipJoinedAt: member.membershipJoinedAt ? member.membershipJoinedAt.slice(0, 10) : "",
                    });
                  }}
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

function InfoItem({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">{label}</dt>
      <dd className="mt-1 text-sm text-gray-900 dark:text-white">{value || "—"}</dd>
    </div>
  );
}

function FormField({
  id,
  label,
  value,
  onChange,
  type = "text",
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
}) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
        {label}
      </label>
      <input
        id={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white"
      />
    </div>
  );
}
