"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import { useSession } from "next-auth/react";
import Link from "next/link";

interface ReportField {
  id: string;
  code: string;
  name: string;
  title: string;
  num: string | null;
  description: string | null;
  help: string | null;
  fieldType: string;
  isRequired: boolean;
  isMultiple: boolean;
  columnsCount: number;
  columnHeaders: string[] | null;
  formula: string | null;
  autoFillFrom: string | null;
  order: number;
}

interface ReportSection {
  id: string;
  code: string;
  title: string;
  order: number;
  fields: ReportField[];
}

interface Report {
  id: string;
  periodYear: number;
  periodMonth: number | null;
  status: "DRAFT" | "SUBMITTED" | "REVISION" | "APPROVED" | "CONFIRMED";
  data: Record<string, any>;
  revisionReason: string | null;
  deadline: string | null;
  submittedAt: string | null;
  approvedAt: string | null;
  confirmedAt: string | null;
  template: {
    id: string;
    code: string;
    name: string;
    periodicity: string;
    sections: ReportSection[];
  };
  organization: {
    id: string;
    name: string;
    address: string | null;
    phone: string | null;
    email: string | null;
    chairmanName: string | null;
    parent: { name: string } | null;
  };
  statusHistory: Array<{
    id: string;
    fromStatus: string | null;
    toStatus: string;
    comment: string | null;
    createdAt: string;
  }>;
}

const STATUS_LABELS: Record<Report["status"], string> = {
  DRAFT: "Черновик",
  SUBMITTED: "На согласовании",
  REVISION: "На доработке",
  APPROVED: "Согласован",
  CONFIRMED: "Утверждён",
};

const STATUS_COLORS: Record<Report["status"], string> = {
  DRAFT: "bg-gray-100 text-gray-700",
  SUBMITTED: "bg-blue-100 text-blue-700",
  REVISION: "bg-orange-100 text-orange-700",
  APPROVED: "bg-green-100 text-green-700",
  CONFIRMED: "bg-emerald-100 text-emerald-700",
};

export default function ReportDetailPage() {
  const router = useRouter();
  const params = useParams();
  const { data: session } = useSession();
  const reportId = params.id as string;

  const viewMode = (session?.user as { viewMode?: string })?.viewMode ?? "MEMBER";
  const isOrgHead = viewMode === "RPO_HEAD" || viewMode === "MPO_HEAD";
  const reportsListHref = isOrgHead ? "/dashboard/reports/org-head" : "/dashboard/reports";
  const reportApiBase = isOrgHead ? "/api/org-head/reports" : "/api/ppo-head/reports";

  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [canEdit, setCanEdit] = useState(false);
  const [canApprove, setCanApprove] = useState(false);
  const [formData, setFormData] = useState<Record<string, any>>({});
  const [activeSection, setActiveSection] = useState<string>("");
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [hasChanges, setHasChanges] = useState(false);

  const fetchReport = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch(`${reportApiBase}/${reportId}`);

      if (!response.ok) {
        throw new Error("Failed to fetch report");
      }

      const data = await response.json();
      setReport(data.report);
      setCanEdit(data.canEdit ?? false);
      setCanApprove(data.canApprove ?? false);
      setFormData(data.report.data || {});
      
      // Устанавливаем первую секцию активной
      if (data.report.template.sections.length > 0) {
        setActiveSection(data.report.template.sections[0].code);
      }
    } catch (error) {
      console.error("Ошибка загрузки отчёта:", error);
    } finally {
      setLoading(false);
    }
  }, [reportId, reportApiBase]);

  useEffect(() => {
    fetchReport();
  }, [fetchReport]);

  // Автосохранение при изменениях
  useEffect(() => {
    if (!hasChanges || !canEdit) return;

    const timer = setTimeout(async () => {
      await saveReport();
    }, 2000);

    return () => clearTimeout(timer);
  }, [formData, hasChanges, canEdit]);

  const handleFieldChange = (code: string, value: any, columnIndex?: number) => {
    setHasChanges(true);
    setFormData((prev) => {
      if (columnIndex !== undefined) {
        // Для многоколоночных полей
        const existing = Array.isArray(prev[code]) ? [...prev[code]] : [];
        existing[columnIndex] = value;
        return { ...prev, [code]: existing };
      }
      return { ...prev, [code]: value };
    });
  };

  const saveReport = async () => {
    if (!canEdit || saving || isOrgHead) return;

    setSaving(true);
    try {
      const response = await fetch(`${reportApiBase}/${reportId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data: formData }),
      });

      if (response.ok) {
        setHasChanges(false);
      }
    } catch (error) {
      console.error("Ошибка сохранения:", error);
    } finally {
      setSaving(false);
    }
  };

  const handleSubmit = async () => {
    if (isOrgHead) return; // Руководитель МПО/РПО не отправляет отчёты
    if (!confirm("Отправить отчёт на согласование?")) return;

    setSubmitting(true);
    try {
      await saveReport();

      const response = await fetch(`/api/ppo-head/reports/${reportId}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "submit" }),
      });

      const data = await response.json();

      if (response.ok) {
        alert(data.message);
        fetchReport();
      } else {
        if (data.missingFields) {
          alert(`Не заполнены обязательные поля:\n${data.missingFields.join("\n")}`);
        } else {
          alert(data.error || "Ошибка отправки");
        }
      }
    } catch (error) {
      console.error("Ошибка:", error);
      alert("Ошибка отправки отчёта");
    } finally {
      setSubmitting(false);
    }
  };

  const handleApprove = async () => {
    if (!confirm("Согласовать отчёт?")) return;

    setSubmitting(true);
    try {
      const url = isOrgHead
        ? `/api/org-head/reports/${reportId}/approve`
        : `/api/ppo-head/reports/${reportId}/status`;
      const body = isOrgHead
        ? { action: "approve" }
        : { action: "approve" };

      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await response.json();

      if (response.ok) {
        alert(data.message ?? "Отчёт согласован");
        fetchReport();
      } else {
        alert(data.error || "Ошибка");
      }
    } catch (error) {
      console.error("Ошибка:", error);
    } finally {
      setSubmitting(false);
    }
  };

  const handleReject = async () => {
    if (!rejectReason.trim()) {
      alert("Укажите причину возврата");
      return;
    }

    setSubmitting(true);
    try {
      const url = isOrgHead
        ? `/api/org-head/reports/${reportId}/approve`
        : `/api/ppo-head/reports/${reportId}/status`;
      const body = isOrgHead
        ? { action: "reject", comment: rejectReason }
        : { action: "reject", comment: rejectReason };

      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await response.json();

      if (response.ok) {
        setShowRejectModal(false);
        setRejectReason("");
        alert(data.message ?? "Отчёт возвращён на доработку");
        fetchReport();
      } else {
        alert(data.error || "Ошибка");
      }
    } catch (error) {
      console.error("Ошибка:", error);
    } finally {
      setSubmitting(false);
    }
  };

  const renderField = (field: ReportField) => {
    const value = formData[field.code];

    if (field.isMultiple && field.columnsCount > 1) {
      return (
        <div key={field.id} className="py-3 border-b border-gray-100 dark:border-gray-700 last:border-0">
          <div className="flex items-start gap-2 mb-2">
            {field.num && (
              <span className="text-sm font-medium text-gray-500 dark:text-gray-400 min-w-[2rem]">
                {field.num}
              </span>
            )}
            <div className="flex-1">
              <span className="text-sm text-gray-700 dark:text-gray-300">
                {field.title}
                {field.isRequired && <span className="text-red-500 ml-1">*</span>}
              </span>
              {field.help && (
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{field.help}</p>
              )}
            </div>
          </div>

          <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${field.columnsCount}, minmax(0, 1fr))` }}>
            {field.columnHeaders?.map((header, i) => (
              <div key={i} className="text-xs text-center text-gray-500 dark:text-gray-400 mb-1">
                {header}
              </div>
            ))}
            {Array.from({ length: field.columnsCount }).map((_, i) => (
              <input
                key={i}
                type={field.fieldType === "integer" || field.fieldType === "decimal" ? "number" : "text"}
                value={Array.isArray(value) ? value[i] || "" : ""}
                onChange={(e) => handleFieldChange(field.code, e.target.value, i)}
                disabled={!canEdit || !!field.formula}
                className={`w-full px-2 py-1.5 text-sm border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-50 dark:disabled:bg-gray-800 disabled:cursor-not-allowed text-center ${
                  field.formula ? "bg-gray-50 dark:bg-gray-800" : ""
                }`}
                placeholder={field.formula ? "авто" : "—"}
              />
            ))}
          </div>
        </div>
      );
    }

    return (
      <div key={field.id} className="py-3 border-b border-gray-100 dark:border-gray-700 last:border-0">
        <div className="flex items-center gap-3">
          {field.num && (
            <span className="text-sm font-medium text-gray-500 dark:text-gray-400 min-w-[2rem]">
              {field.num}
            </span>
          )}
          <div className="flex-1">
            <label className="text-sm text-gray-700 dark:text-gray-300">
              {field.title}
              {field.isRequired && <span className="text-red-500 ml-1">*</span>}
            </label>
            {field.help && (
              <p className="text-xs text-gray-500 dark:text-gray-400">{field.help}</p>
            )}
          </div>
          <div className="w-48">
            {field.fieldType === "text" ? (
              <textarea
                value={value || ""}
                onChange={(e) => handleFieldChange(field.code, e.target.value)}
                disabled={!canEdit}
                className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50 dark:disabled:bg-gray-800"
                rows={2}
              />
            ) : (
              <input
                type={field.fieldType === "integer" || field.fieldType === "decimal" ? "number" : "text"}
                value={value || ""}
                onChange={(e) => handleFieldChange(field.code, e.target.value)}
                disabled={!canEdit || !!field.autoFillFrom}
                className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50 dark:disabled:bg-gray-800"
              />
            )}
          </div>
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!report) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">Отчёт не найден</p>
        <Link href={reportsListHref} className="text-blue-600 hover:underline mt-2 inline-block">
          Вернуться к списку
        </Link>
      </div>
    );
  }

  const activeContent = report.template.sections.find((s) => s.code === activeSection);

  return (
    <div className="space-y-6">
      {/* Хлебные крошки и заголовок */}
      <div>
        <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 mb-2">
          <Link href={reportsListHref} className="hover:text-blue-600">
            Отчётность
          </Link>
          <span>/</span>
          <span>{report.template.name}</span>
        </div>

        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
              {report.template.name}
            </h1>
            <p className="text-gray-500 dark:text-gray-400">
              Отчётный период: {report.periodYear}
              {report.periodMonth && ` / ${report.periodMonth} мес.`}
            </p>
          </div>

          <div className="flex items-center gap-3">
            {saving && (
              <span className="text-sm text-gray-500 flex items-center gap-2">
                <div className="animate-spin w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full"></div>
                Сохранение...
              </span>
            )}

            <span className={`px-3 py-1.5 rounded-full text-sm font-medium ${STATUS_COLORS[report.status]}`}>
              {STATUS_LABELS[report.status]}
            </span>
          </div>
        </div>
      </div>

      {/* Предупреждение о доработке */}
      {report.status === "REVISION" && report.revisionReason && (
        <div className="bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-xl p-4">
          <div className="flex items-start gap-3">
            <svg className="w-5 h-5 text-orange-600 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <div>
              <h4 className="font-medium text-orange-800 dark:text-orange-200">
                Отчёт возвращён на доработку
              </h4>
              <p className="text-sm text-orange-700 dark:text-orange-300 mt-1">
                {report.revisionReason}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Основной контент */}
      <div className="flex gap-6">
        {/* Навигация по секциям */}
        <div className="w-64 flex-shrink-0">
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 sticky top-4">
            <h3 className="font-medium text-gray-900 dark:text-white mb-3">Разделы</h3>
            <nav className="space-y-1">
              {report.template.sections.map((section) => (
                <button
                  key={section.code}
                  onClick={() => setActiveSection(section.code)}
                  className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                    activeSection === section.code
                      ? "bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 font-medium"
                      : "text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700"
                  }`}
                >
                  {section.title}
                </button>
              ))}
            </nav>

            {/* Информация об организации */}
            <div className="mt-6 pt-4 border-t border-gray-200 dark:border-gray-700">
              <h4 className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase mb-2">
                Организация
              </h4>
              <p className="text-sm text-gray-700 dark:text-gray-300">
                {report.organization.name}
              </p>
              {report.organization.parent && (
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  {report.organization.parent.name}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Форма */}
        <div className="flex-1 min-w-0">
          {activeContent && (
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
              <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                  {activeContent.title}
                </h2>
              </div>

              <div className="p-6">
                {activeContent.fields.map((field) => renderField(field))}
              </div>
            </div>
          )}

          {/* Кнопки действий */}
          <div className="mt-6 flex items-center justify-between">
            <Link
              href={reportsListHref}
              className="text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
            >
              ← Вернуться к списку
            </Link>

            <div className="flex items-center gap-3">
              {/* Кнопка экспорта в PDF */}
              <a
                href={`${reportApiBase}/${reportId}/export?format=pdf`}
                download
                className="flex items-center gap-2 px-4 py-2 text-red-700 dark:text-red-400 border border-red-300 dark:border-red-600 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                </svg>
                PDF
              </a>
              
              {/* Кнопка экспорта в Excel */}
              <a
                href={`${reportApiBase}/${reportId}/export?format=xlsx`}
                download
                className="flex items-center gap-2 px-4 py-2 text-green-700 dark:text-green-400 border border-green-300 dark:border-green-600 rounded-lg hover:bg-green-50 dark:hover:bg-green-900/20 transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                Excel
              </a>

              {canEdit && (
                <>
                  <button
                    onClick={saveReport}
                    disabled={saving || !hasChanges}
                    className="px-4 py-2 text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50"
                  >
                    Сохранить
                  </button>
                  <button
                    onClick={handleSubmit}
                    disabled={submitting}
                    className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium disabled:opacity-50"
                  >
                    {submitting ? "Отправка..." : "Отправить на согласование"}
                  </button>
                </>
              )}

              {canApprove && report.status === "SUBMITTED" && (
                <>
                  <button
                    onClick={() => setShowRejectModal(true)}
                    disabled={submitting}
                    className="px-4 py-2 text-orange-700 border border-orange-300 rounded-lg hover:bg-orange-50 disabled:opacity-50"
                  >
                    Вернуть на доработку
                  </button>
                  <button
                    onClick={handleApprove}
                    disabled={submitting}
                    className="px-6 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium disabled:opacity-50"
                  >
                    {submitting ? "..." : "Согласовать"}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* История статусов */}
      {report.statusHistory.length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
          <h3 className="font-medium text-gray-900 dark:text-white mb-4">История изменений</h3>
          <div className="space-y-3">
            {report.statusHistory.map((item) => (
              <div key={item.id} className="flex items-start gap-3 text-sm">
                <div className="w-2 h-2 rounded-full bg-blue-500 mt-1.5 flex-shrink-0"></div>
                <div>
                  <span className="text-gray-700 dark:text-gray-300">
                    {item.fromStatus ? `${STATUS_LABELS[item.fromStatus as Report["status"]]} → ` : ""}
                    {STATUS_LABELS[item.toStatus as Report["status"]]}
                  </span>
                  {item.comment && (
                    <p className="text-gray-500 dark:text-gray-400 text-xs mt-0.5">{item.comment}</p>
                  )}
                  <span className="text-gray-400 text-xs">
                    {new Date(item.createdAt).toLocaleString("ru-RU")}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Модалка отклонения */}
      {showRejectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-md mx-4 p-6">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
              Вернуть на доработку
            </h2>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Причина возврата
              </label>
              <textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 focus:ring-2 focus:ring-blue-500"
                rows={4}
                placeholder="Укажите, что нужно исправить..."
              />
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setShowRejectModal(false)}
                className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
              >
                Отмена
              </button>
              <button
                onClick={handleReject}
                disabled={!rejectReason.trim() || submitting}
                className="px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-lg font-medium disabled:opacity-50"
              >
                {submitting ? "..." : "Вернуть"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
