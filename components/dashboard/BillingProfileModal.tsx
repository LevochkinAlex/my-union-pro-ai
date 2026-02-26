"use client";

import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/modal";
import { alertError, alertSuccess } from "@/lib/alert";

type EntityType = "INDIVIDUAL" | "INDIVIDUAL_ENTREPRENEUR" | "LEGAL_ENTITY";

interface BillingProfile {
  id?: string;
  entityType: EntityType;
  fullName?: string | null;
  companyName?: string | null;
  inn?: string | null;
  kpp?: string | null;
  ogrn?: string | null;
  legalAddress?: string | null;
  checkingAccount?: string | null;
  bankName?: string | null;
  bik?: string | null;
  correspondentAccount?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
}

interface BillingProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved: (profile?: BillingProfile) => void;
}

const ENTITY_OPTIONS: Array<{ value: EntityType; label: string }> = [
  { value: "INDIVIDUAL", label: "Физлицо" },
  { value: "INDIVIDUAL_ENTREPRENEUR", label: "ИП" },
  { value: "LEGAL_ENTITY", label: "Юрлицо" },
];

export default function BillingProfileModal({ isOpen, onClose, onSaved }: BillingProfileModalProps) {
  const [loading, setLoading] = useState(false);
  const [autofillLoading, setAutofillLoading] = useState(false);
  const initialForm: BillingProfile = {
    entityType: "LEGAL_ENTITY",
    fullName: "",
    companyName: "",
    inn: "",
    kpp: "",
    ogrn: "",
    legalAddress: "",
    checkingAccount: "",
    bankName: "",
    bik: "",
    correspondentAccount: "",
    contactEmail: "",
    contactPhone: "",
  };
  const [form, setForm] = useState<BillingProfile>(initialForm);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await fetch("/api/subscription/billing-profile");
        const data = await res.json().catch(() => ({}));
        if (!cancelled && res.ok) {
          if (data.profile) {
            setForm({
              entityType: data.profile.entityType || "LEGAL_ENTITY",
              fullName: data.profile.fullName || "",
              companyName: data.profile.companyName || "",
              inn: data.profile.inn || "",
              kpp: data.profile.kpp || "",
              ogrn: data.profile.ogrn || "",
              legalAddress: data.profile.legalAddress || "",
              checkingAccount: data.profile.checkingAccount || "",
              bankName: data.profile.bankName || "",
              bik: data.profile.bik || "",
              correspondentAccount: data.profile.correspondentAccount || "",
              contactEmail: data.profile.contactEmail || "",
              contactPhone: data.profile.contactPhone || "",
            });
          } else {
            setForm({ ...initialForm });
          }
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  const getRequiredErrors = (): string[] => {
    const errs: string[] = [];
    if (form.entityType === "INDIVIDUAL") {
      if (!form.fullName?.trim()) errs.push("ФИО");
    } else {
      if (!form.companyName?.trim()) errs.push("Название");
      if (!form.inn?.trim()) errs.push("ИНН");
      if (!form.legalAddress?.trim()) errs.push("Юридический адрес");
    }
    return errs;
  };

  const saveProfile = async () => {
    const requiredErrs = getRequiredErrors();
    if (requiredErrs.length > 0) {
      alertError(`Заполните обязательные поля для счета-оферты: ${requiredErrs.join(", ")}`);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/subscription/billing-profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alertError(data.error || "Ошибка сохранения реквизитов");
        return;
      }
      alertSuccess("Платежный профиль сохранен");
      onSaved(data.profile ?? undefined);
      onClose();
    } finally {
      setLoading(false);
    }
  };

  const autofillByInn = async () => {
    if (!form.inn || form.inn.trim().length < 10) {
      alertError("Укажите корректный ИНН");
      return;
    }
    setAutofillLoading(true);
    try {
      const res = await fetch("/api/subscription/billing-profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "autofill-by-inn", inn: form.inn }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alertError(data.error || "Не удалось получить данные из DaData");
        return;
      }
      setForm((prev) => ({
        ...prev,
        companyName: data.company?.companyName || prev.companyName,
        ogrn: data.company?.ogrn || prev.ogrn,
        legalAddress: data.company?.legalAddress || prev.legalAddress,
      }));
      alertSuccess("Реквизиты частично заполнены из DaData");
    } finally {
      setAutofillLoading(false);
    }
  };

  const isCompany = form.entityType === "INDIVIDUAL_ENTREPRENEUR" || form.entityType === "LEGAL_ENTITY";

  return (
    <Modal isOpen={isOpen} onClose={onClose} className="max-w-3xl">
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="shrink-0 p-6 pb-4">
        <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">Платежный профиль для счета-оферты</h3>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-5">
          Заполните реквизиты покупателя. Банковские реквизиты плательщика в счете-оферте не обязательны.
          Обязательные поля отмечены <span className="text-red-500">*</span>.
        </p>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-4">
        <div className="grid gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Тип плательщика</label>
            <select
              aria-label="Тип плательщика"
              title="Тип плательщика"
              value={form.entityType}
              onChange={(e) => setForm((p) => ({ ...p, entityType: e.target.value as EntityType }))}
              className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2"
            >
              {ENTITY_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          {form.entityType === "INDIVIDUAL" && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">ФИО <span className="text-red-500">*</span></label>
              <input
                value={form.fullName || ""}
                onChange={(e) => setForm((p) => ({ ...p, fullName: e.target.value }))}
                className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2"
                placeholder="Иванов Иван Иванович"
              />
            </div>
          )}

          {isCompany && (
            <>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">ИНН <span className="text-red-500">*</span></label>
                  <input
                    value={form.inn || ""}
                    onChange={(e) => setForm((p) => ({ ...p, inn: e.target.value }))}
                    className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2"
                    placeholder="10 или 12 цифр"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">КПП</label>
                  <input
                    value={form.kpp || ""}
                    onChange={(e) => setForm((p) => ({ ...p, kpp: e.target.value }))}
                    className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2"
                    placeholder="КПП"
                  />
                </div>
                <div className="flex items-end">
                  <button
                    type="button"
                    onClick={autofillByInn}
                    disabled={autofillLoading}
                    className="w-full rounded-lg border border-blue-300 text-blue-700 dark:text-blue-300 dark:border-blue-700 px-3 py-2 hover:bg-blue-50 dark:hover:bg-blue-900/20 disabled:opacity-50"
                  >
                    {autofillLoading ? "Поиск..." : "Найти"}
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Название <span className="text-red-500">*</span></label>
                  <input
                    value={form.companyName || ""}
                    onChange={(e) => setForm((p) => ({ ...p, companyName: e.target.value }))}
                    className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2"
                    placeholder="ООО Ромашка"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">ОГРН / ОГРНИП</label>
                  <input
                    value={form.ogrn || ""}
                    onChange={(e) => setForm((p) => ({ ...p, ogrn: e.target.value }))}
                    className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2"
                    placeholder="ОГРН"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Юридический адрес <span className="text-red-500">*</span></label>
                <input
                  value={form.legalAddress || ""}
                  onChange={(e) => setForm((p) => ({ ...p, legalAddress: e.target.value }))}
                  className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2"
                  placeholder="г. Москва, ..."
                />
              </div>
            </>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Расчетный счет</label>
              <input
                value={form.checkingAccount || ""}
                onChange={(e) => setForm((p) => ({ ...p, checkingAccount: e.target.value }))}
                className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2"
                placeholder="4070..."
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">БИК</label>
              <input
                value={form.bik || ""}
                onChange={(e) => setForm((p) => ({ ...p, bik: e.target.value }))}
                className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2"
                placeholder="0445..."
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Банк</label>
              <input
                value={form.bankName || ""}
                onChange={(e) => setForm((p) => ({ ...p, bankName: e.target.value }))}
                className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2"
                placeholder="АО Тинькофф Банк"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Корр. счет</label>
              <input
                value={form.correspondentAccount || ""}
                onChange={(e) => setForm((p) => ({ ...p, correspondentAccount: e.target.value }))}
                className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2"
                placeholder="3010..."
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Email для счета</label>
              <input
                value={form.contactEmail || ""}
                onChange={(e) => setForm((p) => ({ ...p, contactEmail: e.target.value }))}
                className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2"
                placeholder="accounting@company.ru"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Телефон</label>
              <input
                value={form.contactPhone || ""}
                onChange={(e) => setForm((p) => ({ ...p, contactPhone: e.target.value }))}
                className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2"
                placeholder="+7 ..."
              />
            </div>
          </div>
        </div>
        </div>

        <div className="shrink-0 mt-2 border-t border-gray-200 dark:border-gray-700 px-6 py-4 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600"
          >
            Отмена
          </button>
          <button
            type="button"
            onClick={saveProfile}
            disabled={loading}
            className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? "Сохранение..." : "Сохранить профиль"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

