"use client";

import { useState } from "react";
import { formatPhoneDisplay } from "@/lib/utils/phone";

interface AccountData {
  id: string;
  phone: string | null;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  middleName: string | null;
  dateOfBirth: Date | null;
  address: string | null;
  jobTitle: string | null;
  profession: string | null;
  education: string | null;
  avatarUrl: string | null;
  membershipStatus: string | null;
  unionCardNumber: string | null;
  organizationName: string | null;
  createdAt: Date;
  documentsCount?: number;
  sessionsCount?: number;
}

interface MergeAccountsModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentAccount: AccountData;
  existingAccount: AccountData;
  newPhone: string;
  onMergeComplete: (newPhone: string) => void;
}

type PrimaryChoice = "current" | "existing";

export default function MergeAccountsModal({
  isOpen,
  onClose,
  currentAccount,
  existingAccount,
  newPhone,
  onMergeComplete,
}: MergeAccountsModalProps) {
  const [primaryChoice, setPrimaryChoice] = useState<PrimaryChoice>("current");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const formatDate = (date: Date | null | string) => {
    if (!date) return "—";
    const d = new Date(date);
    return d.toLocaleDateString("ru-RU");
  };

  const getStatusLabel = (status: string | null) => {
    const statuses: Record<string, string> = {
      PENDING_VERIFICATION: "Ожидает верификации",
      PROFILE_INCOMPLETE: "Профиль не заполнен",
      DOCUMENTS_PENDING: "Документы на проверке",
      APPROVED: "Одобрен",
      REJECTED: "Отклонён",
      SUSPENDED: "Приостановлен",
    };
    return status ? statuses[status] || status : "—";
  };

  const handleMerge = async () => {
    setLoading(true);
    setError("");

    try {
      const primaryId = primaryChoice === "current" ? currentAccount.id : existingAccount.id;
      const secondaryId = primaryChoice === "current" ? existingAccount.id : currentAccount.id;

      const response = await fetch("/api/user/merge-accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          primaryAccountId: primaryId,
          secondaryAccountId: secondaryId,
          newPhone: newPhone,
          smsVerified: true, // SMS уже был проверен в предыдущем шаге
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Не удалось объединить аккаунты");
      }

      const result = await response.json();
      console.log("[MergeAccounts] Success:", result);
      
      onMergeComplete(newPhone);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Произошла ошибка");
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  const primaryAccount = primaryChoice === "current" ? currentAccount : existingAccount;
  const secondaryAccount = primaryChoice === "current" ? existingAccount : currentAccount;

  return (
    <>
      {/* Overlay */}
      <div className="fixed inset-0 bg-black/60 z-[60]" />

      {/* Modal */}
      <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[60] w-full max-w-4xl max-h-[90vh] overflow-auto bg-white dark:bg-gray-800 rounded-xl shadow-2xl">
        {/* Header */}
        <div className="sticky top-0 bg-gradient-to-r from-blue-600 to-indigo-600 px-6 py-5 rounded-t-xl">
          <h2 className="text-2xl font-bold text-white flex items-center gap-3">
            <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
            </svg>
            Объединение аккаунтов
          </h2>
          <p className="text-blue-100 mt-1">
            Выберите аккаунт с данными, которые нужно сохранить как основные
          </p>
        </div>

        {/* Info Banner */}
        <div className="mx-6 mt-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <span className="text-2xl">⚠️</span>
            <div>
              <p className="font-medium text-amber-800 dark:text-amber-200">
                Важная информация
              </p>
              <ul className="mt-2 text-sm text-amber-700 dark:text-amber-300 space-y-1">
                <li>• <strong>Email не переносится</strong> — останется от выбранного главного аккаунта</li>
                <li>• Документы, история чатов и обращения будут перенесены</li>
                <li>• Второй аккаунт будет удалён после объединения</li>
                <li>• Это действие <strong>нельзя отменить</strong></li>
              </ul>
            </div>
          </div>
        </div>

        {/* Two Columns */}
        <div className="p-6">
          <div className="grid grid-cols-2 gap-6">
            {/* Current Account Column */}
            <div
              onClick={() => setPrimaryChoice("current")}
              className={`relative cursor-pointer rounded-xl border-2 transition-all ${
                primaryChoice === "current"
                  ? "border-green-500 bg-green-50 dark:bg-green-900/20 shadow-lg ring-2 ring-green-500/50"
                  : "border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600"
              }`}
            >
              {/* Selection Badge */}
              {primaryChoice === "current" && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-4 py-1 bg-green-500 text-white text-sm font-bold rounded-full shadow">
                  ✓ ГЛАВНЫЙ
                </div>
              )}

              <div className="p-5">
                {/* Header */}
                <div className="flex items-center gap-3 mb-4 pb-3 border-b border-gray-200 dark:border-gray-700">
                  <div className="w-12 h-12 rounded-full bg-blue-500 flex items-center justify-center text-white font-bold text-lg">
                    {currentAccount.firstName?.[0] || "?"}{currentAccount.lastName?.[0] || ""}
                  </div>
                  <div>
                    <p className="font-semibold text-gray-900 dark:text-white">
                      {currentAccount.lastName} {currentAccount.firstName} {currentAccount.middleName}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      Текущий аккаунт
                    </p>
                  </div>
                </div>

                {/* Data */}
                <div className="space-y-3 text-sm">
                  <DataRow label="Телефон" value={formatPhoneDisplay(currentAccount.phone)} />
                  <DataRow 
                    label="Email" 
                    value={currentAccount.email || "—"} 
                    highlight={primaryChoice === "current"}
                    note="Сохранится"
                  />
                  <DataRow label="Дата рождения" value={formatDate(currentAccount.dateOfBirth)} />
                  <DataRow label="Адрес" value={currentAccount.address} />
                  <DataRow label="Должность" value={currentAccount.jobTitle} />
                  <DataRow label="Профессия" value={currentAccount.profession} />
                  <DataRow label="Образование" value={currentAccount.education} />
                  <DataRow label="Организация" value={currentAccount.organizationName} />
                  <DataRow label="Статус" value={getStatusLabel(currentAccount.membershipStatus)} />
                  <DataRow label="Профсоюзный билет" value={currentAccount.unionCardNumber} />
                  <DataRow label="Создан" value={formatDate(currentAccount.createdAt)} />
                </div>
              </div>

              {/* Select Button */}
              <div className="px-5 pb-5">
                <button
                  type="button"
                  className={`w-full py-2.5 rounded-lg font-medium transition-colors ${
                    primaryChoice === "current"
                      ? "bg-green-500 text-white"
                      : "bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600"
                  }`}
                >
                  {primaryChoice === "current" ? "✓ Выбран как главный" : "Выбрать как главный"}
                </button>
              </div>
            </div>

            {/* Existing Account Column */}
            <div
              onClick={() => setPrimaryChoice("existing")}
              className={`relative cursor-pointer rounded-xl border-2 transition-all ${
                primaryChoice === "existing"
                  ? "border-green-500 bg-green-50 dark:bg-green-900/20 shadow-lg ring-2 ring-green-500/50"
                  : "border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600"
              }`}
            >
              {/* Selection Badge */}
              {primaryChoice === "existing" && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-4 py-1 bg-green-500 text-white text-sm font-bold rounded-full shadow">
                  ✓ ГЛАВНЫЙ
                </div>
              )}

              <div className="p-5">
                {/* Header */}
                <div className="flex items-center gap-3 mb-4 pb-3 border-b border-gray-200 dark:border-gray-700">
                  <div className="w-12 h-12 rounded-full bg-purple-500 flex items-center justify-center text-white font-bold text-lg">
                    {existingAccount.firstName?.[0] || "?"}{existingAccount.lastName?.[0] || ""}
                  </div>
                  <div>
                    <p className="font-semibold text-gray-900 dark:text-white">
                      {existingAccount.lastName} {existingAccount.firstName} {existingAccount.middleName}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      Аккаунт с номером {formatPhoneDisplay(newPhone)}
                    </p>
                  </div>
                </div>

                {/* Data */}
                <div className="space-y-3 text-sm">
                  <DataRow label="Телефон" value={formatPhoneDisplay(existingAccount.phone)} />
                  <DataRow 
                    label="Email" 
                    value={existingAccount.email || "—"} 
                    highlight={primaryChoice === "existing"}
                    note="Сохранится"
                  />
                  <DataRow label="Дата рождения" value={formatDate(existingAccount.dateOfBirth)} />
                  <DataRow label="Адрес" value={existingAccount.address} />
                  <DataRow label="Должность" value={existingAccount.jobTitle} />
                  <DataRow label="Профессия" value={existingAccount.profession} />
                  <DataRow label="Образование" value={existingAccount.education} />
                  <DataRow label="Организация" value={existingAccount.organizationName} />
                  <DataRow label="Статус" value={getStatusLabel(existingAccount.membershipStatus)} />
                  <DataRow label="Профсоюзный билет" value={existingAccount.unionCardNumber} />
                  <DataRow label="Создан" value={formatDate(existingAccount.createdAt)} />
                  
                  {/* Extra info */}
                  {(existingAccount.documentsCount || existingAccount.sessionsCount) && (
                    <div className="pt-2 mt-2 border-t border-gray-200 dark:border-gray-700">
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        📄 {existingAccount.documentsCount || 0} документов • 
                        💬 {existingAccount.sessionsCount || 0} чатов
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Select Button */}
              <div className="px-5 pb-5">
                <button
                  type="button"
                  className={`w-full py-2.5 rounded-lg font-medium transition-colors ${
                    primaryChoice === "existing"
                      ? "bg-green-500 text-white"
                      : "bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600"
                  }`}
                >
                  {primaryChoice === "existing" ? "✓ Выбран как главный" : "Выбрать как главный"}
                </button>
              </div>
            </div>
          </div>

          {/* Summary */}
          <div className="mt-6 bg-gray-50 dark:bg-gray-900/50 rounded-xl p-5">
            <h3 className="font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
              <svg className="w-5 h-5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
              Итог объединения
            </h3>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-gray-500 dark:text-gray-400 mb-1">Останется:</p>
                <p className="font-medium text-green-600 dark:text-green-400">
                  {primaryAccount.lastName} {primaryAccount.firstName}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Email: {primaryAccount.email || "не указан"}
                </p>
              </div>
              <div>
                <p className="text-gray-500 dark:text-gray-400 mb-1">Будет удалён:</p>
                <p className="font-medium text-red-600 dark:text-red-400">
                  {secondaryAccount.lastName} {secondaryAccount.firstName}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Данные перенесутся в главный
                </p>
              </div>
            </div>
          </div>

          {error && (
            <div className="mt-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
              <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-gray-50 dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700 px-6 py-4 rounded-b-xl flex items-center justify-between">
          <button
            onClick={onClose}
            disabled={loading}
            className="px-5 py-2.5 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg font-medium disabled:opacity-50"
          >
            Отмена
          </button>
          
          <button
            onClick={handleMerge}
            disabled={loading}
            className="px-6 py-2.5 bg-gradient-to-r from-green-500 to-emerald-600 text-white rounded-lg font-medium hover:from-green-600 hover:to-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 shadow-lg"
          >
            {loading ? (
              <>
                <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Объединение...
              </>
            ) : (
              <>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                </svg>
                Объединить аккаунты
              </>
            )}
          </button>
        </div>
      </div>
    </>
  );
}

// Компонент для строки данных
function DataRow({ 
  label, 
  value, 
  highlight, 
  note 
}: { 
  label: string; 
  value: string | null | undefined;
  highlight?: boolean;
  note?: string;
}) {
  return (
    <div className="flex justify-between items-start">
      <span className="text-gray-500 dark:text-gray-400">{label}:</span>
      <div className="text-right">
        <span className={`font-medium ${highlight ? "text-green-600 dark:text-green-400" : "text-gray-900 dark:text-white"}`}>
          {value || "—"}
        </span>
        {highlight && note && (
          <span className="ml-1 text-xs text-green-500">({note})</span>
        )}
      </div>
    </div>
  );
}

