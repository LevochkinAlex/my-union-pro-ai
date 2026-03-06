"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  getMembershipStatusBadgeClass,
  getMembershipStatusLabel,
  getUserRoleLabel,
  getEffectiveMemberStatus,
  ORG_TYPE_LABELS,
  EMPLOYMENT_STATUS_LABELS,
  MARITAL_STATUS_LABELS,
  DOCUMENT_TYPE_LABELS,
  APPEAL_STATUS_CONFIG,
  BEST_BENEFITS_STATUS_LABELS,
  getDocumentStatusInfo,
} from "@/lib/status-labels";

type Doc = {
  id: string;
  type: string;
  status: string;
  title: string | null;
  fileName: string | null;
  filePath: string | null;
  signedFilePath: string | null;
  createdAt: string;
};

type Appeal = {
  id: string;
  publicId: string;
  title: string;
  content: string | null;
  status: string;
  type: string | null;
  priority: string | null;
  chatId: string | null;
  createdAt: string;
  rejectionReason: string | null;
  helpfulRating: number | null;
  helpfulRatingComment: string | null;
};

type Member = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  middleName: string | null;
  email: string | null;
  phone: string | null;
  authPhone: string | null;
  jobTitle: string | null;
  profession: string | null;
  education: string | null;
  workplace: string | null;
  workplaceInn: string | null;
  directorName: string | null;
  directorPosition: string | null;
  employmentStatus: string | null;
  avatarUrl: string | null;
  dateOfBirth: string | null;
  address: string | null;
  preferredDiscountCity: string | null;
  aboutMe: string | null;
  hobbies: string | null;
  maritalStatus: string | null;
  spouseInfo: string | null;
  hasChildren: boolean | null;
  childrenInfo: string | null;
  childrenBirthDates: string | null;
  training: string | null;
  additionalInfo: string | null;
  professions: string | null;
  educations: string | null;
  awards: string | null;
  membershipStatus: string;
  unionMembershipStatus: string | null;
  unionCardNumber: string | null;
  membershipJoinedAt: string | null;
  membershipExcludedAt: string | null;
  membershipExclusionReason: string | null;
  bestBenefitsUserId: string | null;
  bestBenefitsStatus: string | null;
  emailVerified: string | null;
  role: string;
  isPPOHead: boolean;
  ppoHeadOrganizationId: string | null;
  createdAt: string;
  updatedAt: string | null;
  organizationId: string | null;
  organization: { id: string; name: string; type: string } | null;
  ppoHeadOrganization: { id: string; name: string } | null;
  documents: Doc[];
};

type OrgItem = { id: string; name: string; type: string };
type DetailTab = "profile" | "work" | "family" | "education" | "awards" | "membership" | "documents" | "appeals";

function parseJson(v: string | null): unknown[] | null {
  if (!v) return null;
  try {
    const p = JSON.parse(v);
    return Array.isArray(p) ? p : null;
  } catch {
    return null;
  }
}

export default function OrgHeadUserDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const [id, setId] = useState<string | null>(null);
  const [member, setMember] = useState<Member | null>(null);
  const [organizations, setOrganizations] = useState<OrgItem[]>([]);
  const [appeals, setAppeals] = useState<Appeal[]>([]);
  const [loadingAppeals, setLoadingAppeals] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [detailTab, setDetailTab] = useState<DetailTab>("profile");
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [showRejectForm, setShowRejectForm] = useState(false);
  const [form, setForm] = useState({
    firstName: "", lastName: "", middleName: "", email: "", phone: "",
    jobTitle: "", organizationId: "", membershipJoinedAt: "",
  });

  useEffect(() => { params.then((p) => setId(p.id)); }, [params]);

  const fetchMember = useCallback(async (userId: string) => {
    const res = await fetch(`/api/org-head/members/${userId}`);
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      throw new Error(d.error || "Ошибка");
    }
    const data = await res.json();
    const m = data.member as Member;
    setMember(m);
    setForm({
      firstName: m.firstName ?? "", lastName: m.lastName ?? "", middleName: m.middleName ?? "",
      email: m.email ?? "", phone: m.phone ?? "", jobTitle: m.jobTitle ?? "",
      organizationId: m.organizationId ?? "",
      membershipJoinedAt: m.membershipJoinedAt ? m.membershipJoinedAt.slice(0, 10) : "",
    });
  }, []);

  const loadAppeals = useCallback(async (userId: string) => {
    setLoadingAppeals(true);
    try {
      let res = await fetch(`/api/ppo-head/appeals?userId=${userId}`);
      if (res.status === 403) {
        res = await fetch(`/api/org-head/appeals?userId=${userId}`);
      }
      if (res.ok) {
        const data = await res.json();
        setAppeals(data.appeals || data.tickets || []);
      }
    } catch {
      // non-critical
    }
    setLoadingAppeals(false);
  }, []);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    setError(null);
    fetchMember(id)
      .then(() => loadAppeals(id))
      .catch((e) => setError(e instanceof Error ? e.message : "Ошибка"))
      .finally(() => setLoading(false));
  }, [id, fetchMember, loadAppeals]);

  useEffect(() => {
    if (!editing) return;
    fetch("/api/org-head/organizations").then((r) => r.json())
      .then((d) => setOrganizations(d.organizations || [])).catch(() => setOrganizations([]));
  }, [editing]);

  const handleSave = async () => {
    if (!id) return;
    setSaving(true);
    setMessage(null);
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
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage({ type: "error", text: d.error || "Ошибка" });
        return;
      }
      setMessage({ type: "success", text: "Сохранено" });
      await fetchMember(id);
      setEditing(false);
    } catch {
      setMessage({ type: "error", text: "Ошибка сети" });
    } finally {
      setSaving(false);
    }
  };

  const handleAction = async (action: string, url: string, body?: Record<string, unknown>) => {
    if (!id) return;
    setActionLoading(action);
    setMessage(null);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage({ type: "error", text: d.error || "Ошибка" });
        return;
      }
      setMessage({ type: "success", text: d.message || "Готово" });
      if (action === "reject") {
        setShowRejectForm(false);
        setRejectReason("");
      }
      await fetchMember(id);
    } catch {
      setMessage({ type: "error", text: "Ошибка сети" });
    } finally {
      setActionLoading(null);
    }
  };

  if (!id || loading) return (
    <div className="flex items-center justify-center min-h-[40vh]">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
    </div>
  );
  if (error || !member) return (
    <div className="px-4 py-8 sm:px-8 lg:px-12">
      <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300">
        {error || "Пользователь не найден"}
      </div>
      <Link href="/dashboard/users/org-head" className="mt-4 inline-block text-blue-600 hover:underline dark:text-blue-400">
        ← К списку
      </Link>
    </div>
  );

  const fio = [member.lastName, member.firstName, member.middleName].filter(Boolean).join(" ") || "—";
  const effectiveStatus = getEffectiveMemberStatus(member.membershipStatus, member.unionMembershipStatus);
  const isAccepted = effectiveStatus === "ACCEPTED" || effectiveStatus === "APPROVED";
  const isPending = !isAccepted && !["EXCLUDED", "REJECTED", "REMOVED"].includes(effectiveStatus);

  const tabs: { key: DetailTab; label: string }[] = [
    { key: "profile", label: "Профиль" },
    { key: "work", label: "Работа" },
    { key: "family", label: "Семья" },
    { key: "education", label: "Образование" },
    { key: "awards", label: "Награды" },
    { key: "membership", label: "Членство" },
    { key: "documents", label: `Документы (${member.documents?.length || 0})` },
    { key: "appeals", label: `Обращения (${appeals.length})` },
  ];

  return (
    <div className="px-4 py-8 sm:px-8 lg:px-12 max-w-5xl">
      <div className="mb-4 flex items-center justify-between">
        <Link href="/dashboard/users/org-head" className="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400">
          ← Пользователи
        </Link>
        <div className="flex gap-2">
          <a href={`/api/org-head/members/${id}/pdf`} target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-300">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            PDF
          </a>
          <button onClick={() => setEditing(true)} className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700">
            Редактировать
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800 overflow-hidden">
        {/* Header */}
        <div className="border-b border-gray-200 bg-gray-50 px-6 py-5 dark:border-gray-700 dark:bg-gray-900">
          <div className="flex items-start gap-4">
            {member.avatarUrl ? (
              <img src={member.avatarUrl} alt="" className="h-16 w-16 rounded-full object-cover" />
            ) : (
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900/30">
                <span className="text-xl font-bold text-blue-700 dark:text-blue-300">{member.firstName?.[0]}{member.lastName?.[0]}</span>
              </div>
            )}
            <div className="flex-1 min-w-0">
              <h1 className="text-xl font-bold text-gray-900 dark:text-white">{fio}</h1>
              <div className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                {member.email && <span>{member.email}</span>}
                {member.email && member.phone && <span> · </span>}
                {member.phone && <span>{member.phone}</span>}
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${getMembershipStatusBadgeClass(effectiveStatus)}`}>
                  {getMembershipStatusLabel(effectiveStatus)}
                </span>
                <span className="text-xs text-gray-500 dark:text-gray-400">{getUserRoleLabel(member.role, member.isPPOHead)}</span>
                {member.unionCardNumber && (
                  <span className="inline-flex rounded-full bg-indigo-100 px-2.5 py-0.5 text-xs font-medium text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300">
                    № {member.unionCardNumber}
                  </span>
                )}
              </div>
            </div>
            {isPending && (
              <div className="flex flex-col gap-2 shrink-0">
                <button onClick={() => handleAction("approve", `/api/org-head/members/${id}/approve`)}
                  disabled={!!actionLoading} className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50">
                  {actionLoading === "approve" ? "..." : "Одобрить"}
                </button>
                <button onClick={() => setShowRejectForm(!showRejectForm)}
                  className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700">
                  Отклонить
                </button>
              </div>
            )}
            {isAccepted && (
              <button onClick={() => { if (confirm("Исключить из профсоюза?")) handleAction("exclude", `/api/org-head/members/${id}/exclude`); }}
                disabled={!!actionLoading} className="rounded-lg border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 dark:border-red-700 dark:bg-gray-800 dark:text-red-400 disabled:opacity-50 shrink-0">
                {actionLoading === "exclude" ? "..." : "Исключить"}
              </button>
            )}
          </div>
        </div>

        {message && (
          <div className={`mx-6 mt-4 rounded-lg p-3 text-sm ${message.type === "success" ? "bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-300" : "bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-300"}`}>
            {message.text}
          </div>
        )}

        {showRejectForm && isPending && (
          <div className="mx-6 mt-4 rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-800 dark:bg-red-900/20">
            <label className="mb-2 block text-sm font-medium text-red-700 dark:text-red-300">Причина отклонения *</label>
            <textarea value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} rows={3} placeholder="Укажите причину отклонения..."
              className="w-full rounded-lg border border-red-300 bg-white px-3 py-2 text-sm dark:border-red-600 dark:bg-gray-700 dark:text-white" />
            <div className="mt-2 flex gap-2">
              <button onClick={() => handleAction("reject", `/api/org-head/members/${id}/reject`, { reason: rejectReason.trim() })}
                disabled={!rejectReason.trim() || !!actionLoading} className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50">
                {actionLoading === "reject" ? "..." : "Подтвердить отклонение"}
              </button>
              <button onClick={() => { setShowRejectForm(false); setRejectReason(""); }}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 dark:border-gray-600 dark:text-gray-300">
                Отмена
              </button>
            </div>
          </div>
        )}

        {editing ? (
          <EditForm form={form} setForm={setForm} member={member} organizations={organizations}
            saving={saving} onSave={handleSave} onCancel={() => {
              setEditing(false);
              setForm({
                firstName: member.firstName ?? "", lastName: member.lastName ?? "",
                middleName: member.middleName ?? "", email: member.email ?? "",
                phone: member.phone ?? "", jobTitle: member.jobTitle ?? "",
                organizationId: member.organizationId ?? "",
                membershipJoinedAt: member.membershipJoinedAt ? member.membershipJoinedAt.slice(0, 10) : "",
              });
            }} />
        ) : (
          <>
            <div className="border-b border-gray-200 dark:border-gray-700 px-6">
              <nav className="-mb-px flex gap-1 overflow-x-auto">
                {tabs.map((t) => (
                  <button key={t.key} onClick={() => setDetailTab(t.key)}
                    className={`whitespace-nowrap border-b-2 px-3 py-3 text-sm font-medium ${detailTab === t.key ? "border-blue-500 text-blue-600 dark:text-blue-400" : "border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400"}`}>
                    {t.label}
                  </button>
                ))}
              </nav>
            </div>

            <div className="p-6">
              {detailTab === "profile" && <ProfileTab member={member} />}
              {detailTab === "work" && <WorkTab member={member} />}
              {detailTab === "family" && <FamilyTab member={member} />}
              {detailTab === "education" && <EducationTab member={member} />}
              {detailTab === "awards" && <AwardsTab member={member} />}
              {detailTab === "membership" && <MembershipTab member={member} />}
              {detailTab === "documents" && <DocumentsTab documents={member.documents} />}
              {detailTab === "appeals" && <AppealsTab appeals={appeals} loading={loadingAppeals} />}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* ================================================================
 * Tab Components
 * ================================================================ */

function ProfileTab({ member: m }: { member: Member }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <IF label="Email" value={m.email} />
        <IF label="Телефон" value={m.phone} />
        <IF label="Телефон регистрации" value={m.authPhone} />
        <IF label="Дата рождения" value={m.dateOfBirth ? new Date(m.dateOfBirth).toLocaleDateString("ru-RU") : null} />
        <IF label="Адрес" value={m.address} />
        <IF label="Город для скидок" value={m.preferredDiscountCity} />
        <IF label="Дата вступления" value={m.membershipJoinedAt ? new Date(m.membershipJoinedAt).toLocaleDateString("ru-RU") : null} />
        <IF label="Дата регистрации" value={new Date(m.createdAt).toLocaleDateString("ru-RU")} />
      </div>
      {(m.aboutMe || m.hobbies) && (
        <div className="mt-4 border-t border-gray-200 pt-4 dark:border-gray-700">
          <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">О себе</h4>
          <div className="space-y-3">
            <IF label="О себе" value={m.aboutMe} />
            <IF label="Хобби" value={m.hobbies} />
          </div>
        </div>
      )}
    </div>
  );
}

function WorkTab({ member: m }: { member: Member }) {
  const professions = parseJson(m.professions) as { name: string; experience?: string }[] | null;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <IF label="Организация (Профсоюз)" value={m.organization?.name} />
        <IF label="Статус занятости" value={m.employmentStatus ? EMPLOYMENT_STATUS_LABELS[m.employmentStatus] || m.employmentStatus : null} />
        <IF label="Место работы" value={m.workplace} />
        <IF label="ИНН работодателя" value={m.workplaceInn} />
        <IF label="Руководитель" value={m.directorName} />
        <IF label="Должность руководителя" value={m.directorPosition} />
        <IF label="Должность" value={m.jobTitle} />
        <IF label="Профессия" value={m.profession} />
      </div>
      {professions && professions.length > 0 && (
        <div className="mt-4 border-t border-gray-200 pt-4 dark:border-gray-700">
          <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">Профессии</h4>
          <div className="space-y-2">
            {professions.map((p, i) => (
              <div key={i} className="rounded-lg border border-gray-200 p-3 dark:border-gray-700">
                <p className="font-medium text-gray-900 dark:text-white">{p.name}</p>
                {p.experience && <p className="text-sm text-gray-600 dark:text-gray-400">Опыт: {p.experience}</p>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function FamilyTab({ member: m }: { member: Member }) {
  const children = parseJson(m.childrenBirthDates) as { name: string; gender?: string; birthDate?: string }[] | null;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <IF label="Семейное положение" value={m.maritalStatus ? MARITAL_STATUS_LABELS[m.maritalStatus] || m.maritalStatus : null} />
        <IF label="Информация о супруге" value={m.spouseInfo} />
        <IF label="Есть дети" value={m.hasChildren === true ? "Да" : m.hasChildren === false ? "Нет" : null} />
        <IF label="О детях" value={m.childrenInfo} />
      </div>
      {children && children.length > 0 && (
        <div className="mt-4 border-t border-gray-200 pt-4 dark:border-gray-700">
          <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">Дети</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {children.map((c, i) => (
              <div key={i} className="rounded-lg border border-gray-200 p-3 dark:border-gray-700">
                <p className="font-medium text-gray-900 dark:text-white">{c.name}</p>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  {c.gender === "М" ? "М" : "Ж"}{" "}
                  {c.birthDate ? new Date(c.birthDate).toLocaleDateString("ru-RU") : ""}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function EducationTab({ member: m }: { member: Member }) {
  const educations = parseJson(m.educations) as { institution: string; level?: string; specialty?: string; year?: string }[] | null;
  const trainings = parseJson(m.training) as { name: string; year?: string; description?: string }[] | null;
  return (
    <div className="space-y-4">
      <IF label="Образование" value={m.education} />
      {educations && educations.length > 0 && (
        <div className="mt-4 border-t border-gray-200 pt-4 dark:border-gray-700">
          <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">Учебные заведения</h4>
          <div className="space-y-3">
            {educations.map((e, i) => (
              <div key={i} className="rounded-lg border border-gray-200 p-3 dark:border-gray-700">
                <p className="font-medium text-gray-900 dark:text-white">{e.institution}</p>
                <p className="text-sm text-gray-600 dark:text-gray-400">{[e.level, e.specialty, e.year].filter(Boolean).join(" · ")}</p>
              </div>
            ))}
          </div>
        </div>
      )}
      {trainings && trainings.length > 0 && (
        <div className="mt-4 border-t border-gray-200 pt-4 dark:border-gray-700">
          <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">Повышение квалификации</h4>
          <div className="space-y-3">
            {trainings.map((t, i) => (
              <div key={i} className="rounded-lg border border-gray-200 p-3 dark:border-gray-700">
                <p className="font-medium text-gray-900 dark:text-white">{t.name}</p>
                <p className="text-sm text-gray-600 dark:text-gray-400">{[t.year, t.description].filter(Boolean).join(" · ")}</p>
              </div>
            ))}
          </div>
        </div>
      )}
      {m.additionalInfo && (
        <div className="mt-4 border-t border-gray-200 pt-4 dark:border-gray-700">
          <IF label="Дополнительная информация" value={m.additionalInfo} />
        </div>
      )}
    </div>
  );
}

function AwardsTab({ member: m }: { member: Member }) {
  const awards = parseJson(m.awards) as { type?: string; year?: string; description?: string }[] | null;
  if (!awards || awards.length === 0) {
    return <p className="text-gray-500 text-center py-8">Наград нет</p>;
  }
  const typeColors: Record<string, string> = {
    "государственная": "bg-yellow-100 text-yellow-800",
    "ведомственная": "bg-blue-100 text-blue-800",
    "профсоюзная": "bg-purple-100 text-purple-800",
  };
  return (
    <div className="space-y-3">
      {awards.map((a, i) => (
        <div key={i} className="rounded-lg border border-gray-200 p-4 dark:border-gray-700">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-lg">🏆</span>
            <span className={`rounded-full px-3 py-1 text-xs font-medium ${typeColors[a.type || ""] || "bg-green-100 text-green-800"}`}>
              {a.type || "Награда"}
            </span>
            {a.year && <span className="text-sm text-gray-500">{a.year} г.</span>}
          </div>
          <p className="text-gray-900 dark:text-white">{a.description}</p>
        </div>
      ))}
    </div>
  );
}

function MembershipTab({ member: m }: { member: Member }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <IF label="Статус членства" value={getMembershipStatusLabel(m.membershipStatus)} />
      <IF label="Номер профсоюзного билета" value={m.unionCardNumber} />
      <IF label="Дата вступления" value={m.membershipJoinedAt ? new Date(m.membershipJoinedAt).toLocaleDateString("ru-RU") : null} />
      <IF label="Статус в профсоюзе" value={m.unionMembershipStatus ? getMembershipStatusLabel(m.unionMembershipStatus) : null} />
      <IF label="Организация" value={m.organization?.name} />
      <IF label="Best Benefits ID" value={m.bestBenefitsUserId} />
      <IF label="Best Benefits статус" value={m.bestBenefitsStatus ? BEST_BENEFITS_STATUS_LABELS[m.bestBenefitsStatus] || m.bestBenefitsStatus : null} />
      <IF label="Email подтверждён" value={m.emailVerified ? new Date(m.emailVerified).toLocaleDateString("ru-RU") : "Нет"} />
      {m.membershipExcludedAt && <IF label="Дата исключения" value={new Date(m.membershipExcludedAt).toLocaleDateString("ru-RU")} />}
      {m.membershipExclusionReason && <IF label="Причина исключения" value={m.membershipExclusionReason} />}
    </div>
  );
}

function DocumentsTab({ documents }: { documents: Doc[] }) {
  if (!documents || documents.length === 0) {
    return <p className="text-gray-500 text-center py-8">Документов нет</p>;
  }
  return (
    <div className="space-y-4">
      {documents.map((doc) => {
        const statusInfo = getDocumentStatusInfo(doc);
        return (
          <div key={doc.id} className="rounded-lg border border-gray-200 p-4 dark:border-gray-700">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <h4 className="font-medium text-gray-900 dark:text-white">{doc.title || doc.fileName || "Документ"}</h4>
                <div className="mt-2 flex flex-wrap gap-2">
                  <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-medium text-blue-700 dark:bg-blue-900 dark:text-blue-300">
                    {DOCUMENT_TYPE_LABELS[doc.type] || doc.type}
                  </span>
                  <span className={`rounded-full px-3 py-1 text-xs font-medium ${statusInfo.color}`}>{statusInfo.text}</span>
                </div>
                <p className="mt-2 text-xs text-gray-500">{new Date(doc.createdAt).toLocaleString("ru-RU")}</p>
                {!doc.signedFilePath && doc.filePath && (
                  <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">Пользователь ещё не загрузил подписанную версию</p>
                )}
              </div>
              <div className="flex flex-col gap-2 shrink-0">
                {doc.filePath && (
                  <a href={`/api/documents/${doc.id}/download`} target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs text-white hover:bg-blue-700">Шаблон</a>
                )}
                {doc.signedFilePath && (
                  <a href={`/api/documents/${doc.id}/download?signed=true`} target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-lg bg-green-600 px-3 py-1.5 text-xs text-white hover:bg-green-700">Подписанный</a>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function AppealsTab({ appeals, loading }: { appeals: Appeal[]; loading: boolean }) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="h-6 w-6 animate-spin rounded-full border-4 border-blue-500 border-r-transparent" />
      </div>
    );
  }
  if (appeals.length === 0) {
    return <p className="text-gray-500 text-center py-8">Обращений нет</p>;
  }
  return (
    <div className="space-y-3">
      {appeals.map((a) => {
        const st = APPEAL_STATUS_CONFIG[a.status] || { label: a.status, cls: "bg-gray-100 text-gray-800" };
        return (
          <div key={a.id} className="rounded-lg border border-gray-200 p-4 dark:border-gray-700 hover:shadow-md transition-shadow">
            <div className="flex items-center flex-wrap gap-2 mb-2">
              <span className="text-sm font-semibold text-blue-600 dark:text-blue-400">#{a.publicId}</span>
              <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${st.cls}`}>{st.label}</span>
              {a.type && <span className="text-xs text-gray-500 bg-gray-50 dark:bg-gray-700 px-2 py-1 rounded">{a.type}</span>}
            </div>
            <h4 className="text-base font-semibold text-gray-900 dark:text-white mb-1">{a.title}</h4>
            <p className="text-xs text-gray-500">{new Date(a.createdAt).toLocaleString("ru-RU")}</p>
            {a.rejectionReason && (
              <div className="mt-2 p-2 bg-red-50 dark:bg-red-900/20 rounded text-xs text-red-700 dark:text-red-400 border-l-2 border-red-400">
                Причина отклонения: {a.rejectionReason}
              </div>
            )}
            <div className="mt-2 flex gap-2">
              {a.chatId && (
                <Link href={`/dashboard/chat?chatId=${a.chatId}&ticketId=${a.publicId}`}
                  className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs text-white hover:bg-blue-700">Открыть чат</Link>
              )}
              <Link href={`/dashboard/appeals/ppo-head?id=${a.publicId}`}
                className="rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-1.5 text-xs text-gray-700 dark:text-gray-300 hover:bg-gray-50">Подробнее</Link>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ================================================================
 * Shared Components
 * ================================================================ */

function IF({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div>
      <label className="block text-sm font-medium text-gray-500 dark:text-gray-400">{label}</label>
      <p className="mt-1 text-gray-900 dark:text-white whitespace-pre-wrap break-words">{value}</p>
    </div>
  );
}

function EditForm({ form, setForm, member, organizations, saving, onSave, onCancel }: {
  form: { firstName: string; lastName: string; middleName: string; email: string; phone: string; jobTitle: string; organizationId: string; membershipJoinedAt: string };
  setForm: React.Dispatch<React.SetStateAction<typeof form>>;
  member: Member;
  organizations: OrgItem[];
  saving: boolean;
  onSave: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="p-6 space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <EF id="e-ln" label="Фамилия" value={form.lastName} onChange={(v) => setForm((f) => ({ ...f, lastName: v }))} />
        <EF id="e-fn" label="Имя" value={form.firstName} onChange={(v) => setForm((f) => ({ ...f, firstName: v }))} />
        <EF id="e-mn" label="Отчество" value={form.middleName} onChange={(v) => setForm((f) => ({ ...f, middleName: v }))} />
        <EF id="e-em" label="Email" type="email" value={form.email} onChange={(v) => setForm((f) => ({ ...f, email: v }))} />
        <EF id="e-ph" label="Телефон" type="tel" value={form.phone} onChange={(v) => setForm((f) => ({ ...f, phone: v }))} />
        <EF id="e-jt" label="Должность" value={form.jobTitle} onChange={(v) => setForm((f) => ({ ...f, jobTitle: v }))} />
        <div>
          <label htmlFor="e-mj" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Дата вступления</label>
          <input id="e-mj" type="date" value={form.membershipJoinedAt}
            onChange={(e) => setForm((f) => ({ ...f, membershipJoinedAt: e.target.value }))}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white" />
        </div>
        {!member.isPPOHead && organizations.length > 0 && (
          <div>
            <label htmlFor="e-org" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Организация</label>
            <select id="e-org" value={form.organizationId} onChange={(e) => setForm((f) => ({ ...f, organizationId: e.target.value }))}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white">
              {organizations.map((o) => (
                <option key={o.id} value={o.id}>{o.name} ({ORG_TYPE_LABELS[o.type] || o.type})</option>
              ))}
            </select>
          </div>
        )}
      </div>
      <div className="flex gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
        <button onClick={onSave} disabled={saving}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
          {saving ? "Сохранение…" : "Сохранить"}
        </button>
        <button onClick={onCancel} className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 dark:border-gray-600 dark:text-gray-300">
          Отмена
        </button>
      </div>
    </div>
  );
}

function EF({ id, label, value, onChange, type = "text" }: { id: string; label: string; value: string; onChange: (v: string) => void; type?: string }) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{label}</label>
      <input id={id} type={type} value={value} onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white" />
    </div>
  );
}
