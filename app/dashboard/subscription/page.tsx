"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { alertSuccess, alertError } from "@/lib/alert";
import SubscriptionWidget from "@/components/dashboard/SubscriptionWidget";
import BillingProfileModal from "@/components/dashboard/BillingProfileModal";

type TariffPeriod = "half_year" | "year";

interface Plan {
  key: string;
  memberLimit: number | null;
  label: string;
  pricePerMonth: number;
  pricePerQuarter: number;
  pricePerHalfYear: number;
  pricePerYear: number;
  pricePerHalfYearFormatted: string;
  pricePerYearFormatted: string;
  rateForHalfYear: number;
  rateForYear: number;
  isUnlimited: boolean;
}

interface Payment {
  id: string;
  amountRub: string;
  periodStart: string;
  periodEnd: string;
  status: string;
  gatewayStatus?: string | null;
  createdAt: string;
}

interface SubscriptionData {
  subscription: {
    id: string;
    status: string;
    memberLimit: number | null;
    tariffKey: string | null;
    tariffLabel: string;
    trialEndsAt: string | null;
    periodEndsAt: string | null;
    periodStartedAt: string | null;
  };
  usage: {
    activeMembers: number;
    availableLicenses: number | null;
    isOverLimit: boolean;
  };
  hasActiveAccess: boolean;
}

interface BillingProfile {
  id?: string;
  entityType: "INDIVIDUAL" | "INDIVIDUAL_ENTREPRENEUR" | "LEGAL_ENTITY";
  fullName?: string | null;
  companyName?: string | null;
  inn?: string | null;
  checkingAccount?: string | null;
  bankName?: string | null;
  bik?: string | null;
  correspondentAccount?: string | null;
}

const PERIOD_LABELS: Record<TariffPeriod, string> = {
  half_year: "6 месяцев",
  year: "12 месяцев",
};

export default function SubscriptionPage() {
  const [subData, setSubData] = useState<SubscriptionData | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [trialLoading, setTrialLoading] = useState(false);
  const [syncPaymentsLoading, setSyncPaymentsLoading] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<string>("");
  const [customMembersInput, setCustomMembersInput] = useState<string>("");
  const [selectedPeriod, setSelectedPeriod] = useState<TariffPeriod>("year");
  const [confirmingPayment, setConfirmingPayment] = useState(false);
  type SubTab = "current" | "tariffs" | "payments";
  const [activeTab, setActiveTab] = useState<SubTab>("current");
  const [billingProfile, setBillingProfile] = useState<BillingProfile | null>(null);
  const [billingProfileModalOpen, setBillingProfileModalOpen] = useState(false);

  const refreshSubscriptionData = async () => {
    const [subRes, payRes, billingRes] = await Promise.all([
      fetch("/api/subscription"),
      fetch("/api/subscription/payments"),
      fetch("/api/subscription/billing-profile"),
    ]);
    if (subRes.ok) setSubData(await subRes.json());
    if (payRes.ok) {
      const payData = await payRes.json();
      setPayments(payData.payments ?? []);
    }
    if (billingRes.ok) {
      const billingData = await billingRes.json();
      setBillingProfile(billingData.profile ?? null);
    }
  };

  useEffect(() => {
    Promise.all([
      fetch("/api/subscription").then(async (r) => (r.ok ? r.json() : null)),
      fetch("/api/subscription/plans").then((r) => (r.ok ? r.json() : null)),
      fetch("/api/subscription/payments").then(async (r) => (r.ok ? r.json() : null)),
      fetch("/api/subscription/billing-profile").then(async (r) => (r.ok ? r.json() : null)),
    ]).then(([sub, plansRes, paymentsRes, billingRes]) => {
      if (sub && typeof sub.subscription === "object") setSubData(sub);
      setPlans(plansRes?.plans ?? []);
      setPayments(paymentsRes?.payments ?? []);
      setBillingProfile(billingRes?.profile ?? null);
    }).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const paymentState = params.get("payment");
    const localPaymentId = params.get("localPaymentId");
    if (!localPaymentId || (paymentState !== "success" && paymentState !== "fail")) return;

    let cancelled = false;
    (async () => {
      setConfirmingPayment(true);
      try {
        // После возврата из банка статус может быть не финальным сразу.
        // Делаем несколько проверок, чтобы избежать "успех -> ошибка" при задержке callback.
        let finalResult: { success?: boolean; status?: string; message?: string; error?: string } | null = null;
        for (let attempt = 0; attempt < 5; attempt++) {
          const res = await fetch("/api/subscription/confirm", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ localPaymentId }),
          });
          const data = await res.json().catch(() => ({}));
          finalResult = data;

          if (!res.ok) {
            alertError(data.error || "Не удалось подтвердить платеж");
            break;
          }

          if (data.success) {
            alertSuccess("Оплата подтверждена, подписка активирована");
            break;
          }

          // Явно финально неуспешный статус
          const failedStatuses = ["REJECTED", "CANCELED", "DEADLINE_EXPIRED", "REFUNDED"];
          if (failedStatuses.includes(String(data.status || "").toUpperCase())) {
            if (String(data.status || "").toUpperCase() === "REFUNDED") {
              alertError("Платеж был возвращен");
            } else {
              alertError(`Платеж отклонен (${data.status})`);
            }
            break;
          }

          // Еще обрабатывается: ждём и опрашиваем повторно
          if (attempt < 4) {
            await new Promise((resolve) => setTimeout(resolve, 2000));
          }
        }

        if (finalResult && !finalResult.success) {
          const pendingStatus = String(finalResult.status || "PENDING");
          if (!["REJECTED", "CANCELED", "DEADLINE_EXPIRED", "REFUNDED"].includes(pendingStatus.toUpperCase())) {
            alertError(`Платеж пока обрабатывается (${pendingStatus}). Проверьте историю платежей через минуту.`);
          }
        }

        if (!cancelled) {
          await refreshSubscriptionData();
        }
      } finally {
        setConfirmingPayment(false);
        const cleanUrl = window.location.pathname;
        window.history.replaceState({}, "", cleanUrl);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);
  const getStatusLabel = (status: string) => {
    const normalized = (status || "").toUpperCase();
    if (normalized === "COMPLETED") return "Успешно";
    if (normalized === "FAILED") return "Ошибка";
    if (normalized === "REFUNDED") return "Возвращен";
    if (normalized === "PENDING") return "Ожидает";
    return status || "—";
  };

  const getStatusClass = (status: string) => {
    const normalized = (status || "").toUpperCase();
    if (normalized === "COMPLETED") return "text-green-700 bg-green-100 dark:text-green-300 dark:bg-green-900/40";
    if (normalized === "FAILED") return "text-red-700 bg-red-100 dark:text-red-300 dark:bg-red-900/40";
    if (normalized === "REFUNDED") return "text-slate-700 bg-slate-100 dark:text-slate-300 dark:bg-slate-800/70";
    return "text-amber-700 bg-amber-100 dark:text-amber-300 dark:bg-amber-900/40";
  };

  const parsedCustomMembers = parseInt(customMembersInput, 10);
  const customMembers =
    Number.isFinite(parsedCustomMembers) && parsedCustomMembers > 0
      ? Math.floor(parsedCustomMembers)
      : null;

  const getRateByMembers = (members: number, period: TariffPeriod) => {
    if (members <= 50) return period === "half_year" ? 79 : 71;
    if (members <= 150) return period === "half_year" ? 76 : 68;
    if (members <= 300) return period === "half_year" ? 70 : 63;
    if (members <= 500) return period === "half_year" ? 65 : 59;
    if (members <= 800) return period === "half_year" ? 59 : 53;
    if (members <= 1500) return period === "half_year" ? 52 : 47;
    if (members <= 2500) return period === "half_year" ? 50 : 45;
    if (members <= 3500) return period === "half_year" ? 48 : 43;
    return period === "half_year" ? 45 : 41;
  };

  const customRate = customMembers ? getRateByMembers(customMembers, selectedPeriod) : null;
  const customAmount =
    customMembers && customRate
      ? customMembers * customRate * (selectedPeriod === "half_year" ? 6 : 12)
      : null;

  const formatRub = (value: number) =>
    new Intl.NumberFormat("ru-RU", {
      style: "currency",
      currency: "RUB",
      maximumFractionDigits: 0,
    }).format(value);

  const effectivePlanSelected = Boolean(selectedPlan || customMembers);


  const handleCheckout = async () => {
    if (!selectedPlan && !customMembers) {
      alertError("Выберите тариф или укажите количество лицензий");
      return;
    }
    const plan = selectedPlan ? plans.find((p) => p.key === selectedPlan) : null;
    if (plan?.isUnlimited) {
      alertError("Для тарифа «Более 3600» свяжитесь с нами для индивидуального договора.");
      return;
    }
    setCheckoutLoading(true);
    try {
      const res = await fetch("/api/subscription/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tariffKey: selectedPlan || undefined,
          customMembers: customMembers ?? undefined,
          period: selectedPeriod,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        alertError(data.error || "Ошибка оформления");
        return;
      }
      if (data.paymentUrl) {
        window.location.href = data.paymentUrl as string;
        return;
      }
      alertError("Платежная ссылка не получена");
    } finally {
      setCheckoutLoading(false);
    }
  };

  const handleStartTrial = async () => {
    setTrialLoading(true);
    try {
      const res = await fetch("/api/subscription/trial", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        alertError(data.error || "Ошибка активации пробного периода");
        return;
      }
      alertSuccess("Пробный период 14 дней активирован");
      const subRes = await fetch("/api/subscription");
      if (subRes.ok) setSubData(await subRes.json());
    } finally {
      setTrialLoading(false);
    }
  };

  const handleSyncPayments = async () => {
    setSyncPaymentsLoading(true);
    try {
      const res = await fetch("/api/subscription/payments/sync", {
        method: "POST",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alertError(data.error || "Ошибка синхронизации платежей");
        return;
      }
      await refreshSubscriptionData();
      alertSuccess(
        `Синхронизация завершена. Проверено: ${data.checked ?? 0}, обновлено: ${data.updated ?? 0}`
      );
    } finally {
      setSyncPaymentsLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab !== "payments") return;
    void handleSyncPayments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  const handleInvoiceOffer = async () => {
    if (!selectedPlan && !customMembers) {
      alertError("Сначала выберите тариф или укажите количество лицензий");
      return;
    }
    if (!billingProfile) {
      setBillingProfileModalOpen(true);
      alertError("Сначала заполните платежный профиль");
      return;
    }

    const res = await fetch("/api/subscription/invoice-offer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tariffKey: selectedPlan || undefined,
        customMembers: customMembers ?? undefined,
        period: selectedPeriod,
      }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      alertError(data.error || "Не удалось сформировать счет-оферту");
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `schet-oferta-${customMembers ? `custom-${customMembers}` : selectedPlan}-${selectedPeriod}.pdf`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    alertSuccess("Счет-оферта сформирован");
  };

  if (loading) {
    return (
      <div className="space-y-6 p-4 sm:p-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Подписка</h1>
        <div className="animate-pulse h-64 bg-gray-100 dark:bg-gray-700 rounded-xl" />
      </div>
    );
  }

  if (!subData) {
    return (
      <div className="space-y-6 p-4 sm:p-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Подписка</h1>
        <p className="text-gray-600 dark:text-gray-400">
          Доступ только для председателей ППО. Управление подпиской организации доступно в вашем кабинете.
        </p>
        <p className="text-sm text-gray-500 dark:text-gray-500">
          Если вы председатель ППО, убедитесь, что в вашем профиле указана организация (членство в ППО или назначение председателем). Обратитесь к администратору при необходимости.
        </p>
        <Link href="/dashboard" className="text-blue-600 dark:text-blue-400 hover:underline">
          Вернуться на главную
        </Link>
      </div>
    );
  }

  const hasAccess = subData?.hasActiveAccess ?? false;
  const status = subData?.subscription?.status ?? "NONE";
  const isTrial = status === "TRIAL";
  const periodEnd = subData?.subscription?.trialEndsAt ?? subData?.subscription?.periodEndsAt;
  const daysLeft = periodEnd
    ? Math.ceil((new Date(periodEnd).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    : null;
  const expiringSoon = daysLeft != null && daysLeft >= 0 && daysLeft <= 7;

  return (
    <div className="space-y-8 p-4 sm:p-6 max-w-5xl">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Подписка</h1>
        <p className="text-gray-600 dark:text-gray-400 mt-1">
          Управление тарифом, лицензиями и платежами
        </p>
      </div>

      {/* Виджет доступа и баланса */}
      <SubscriptionWidget onClick={() => setActiveTab("tariffs")} />

      {/* Табы */}
      <div className="flex border-b border-gray-200 dark:border-gray-700">
        <button
          type="button"
          onClick={() => setActiveTab("current")}
          className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
            activeTab === "current"
              ? "border-blue-600 text-blue-600 dark:text-blue-400"
              : "border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
          }`}
        >
          Текущая подписка
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("tariffs")}
          className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
            activeTab === "tariffs"
              ? "border-blue-600 text-blue-600 dark:text-blue-400"
              : "border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
          }`}
        >
          Тарифы
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("payments")}
          className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
            activeTab === "payments"
              ? "border-blue-600 text-blue-600 dark:text-blue-400"
              : "border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
          }`}
        >
          История платежей
        </button>
      </div>

      {/* Текущая подписка и продление */}
      {activeTab === "current" && (
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm p-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          Текущая подписка
        </h2>
        {status === "NONE" || status === "EXPIRED" ? (
          <div className="space-y-4">
            <p className="text-gray-600 dark:text-gray-400">
              {status === "NONE"
                ? "Подписка не оформлена. Активируйте 14 дней теста без карты или выберите тариф."
                : "Подписка истекла. Продлите доступ для организации."}
            </p>
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={handleStartTrial}
                disabled={trialLoading || isTrial}
                className="px-4 py-2 bg-amber-500 text-white rounded-lg hover:bg-amber-600 disabled:opacity-50"
              >
                {trialLoading ? "Активация…" : "14 дней теста без карты"}
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-2 text-gray-700 dark:text-gray-300">
            <p>
              <span className="font-medium">Тариф:</span>{" "}
              {subData?.subscription?.tariffLabel ?? "—"}
            </p>
            <p>
              <span className="font-medium">Участников:</span>{" "}
              {subData?.usage?.activeMembers ?? 0}
              {subData?.subscription?.memberLimit != null &&
                ` / ${subData.subscription.memberLimit}`}
            </p>
            {periodEnd && (
              <p>
                <span className="font-medium">
                  {isTrial ? "Пробный период до" : "Подписка до"}:
                </span>{" "}
                {new Date(periodEnd).toLocaleDateString("ru-RU", {
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                })}
                {daysLeft != null && daysLeft >= 0 && (
                  <span className={expiringSoon ? "text-amber-600 dark:text-amber-400" : ""}>
                    {" "}(осталось {daysLeft} дн.)
                  </span>
                )}
              </p>
            )}
            {(status === "EXPIRED" || expiringSoon) && (
              <button
                type="button"
                onClick={() => setActiveTab("tariffs")}
                className="inline-block mt-2 text-blue-600 dark:text-blue-400 hover:underline"
              >
                Продлить подписку →
              </button>
            )}
          </div>
        )}
      </div>
      )}

      {/* Калькулятор и выбор тарифа */}
      {activeTab === "tariffs" && (
      <div id="tariffs" className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm p-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          Выбор тарифа
        </h2>

        <div className="flex flex-wrap items-center gap-4 mb-6 pb-4 border-b border-gray-200 dark:border-gray-700">
          <label className="flex items-center gap-2">
            <span className="text-gray-700 dark:text-gray-300 font-medium">Период:</span>
            <select
              value={selectedPeriod}
              onChange={(e) => setSelectedPeriod(e.target.value as TariffPeriod)}
              className="rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white px-3 py-2"
            >
              {(Object.keys(PERIOD_LABELS) as TariffPeriod[]).map((p) => (
                <option key={p} value={p}>
                  {PERIOD_LABELS[p]}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={handleCheckout}
            disabled={checkoutLoading || !effectivePlanSelected}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {checkoutLoading ? "Переход к оплате…" : "Оплатить через T-Bank"}
          </button>
          <button
            type="button"
            onClick={handleInvoiceOffer}
            disabled={!effectivePlanSelected}
            className="px-4 py-2 border border-blue-300 text-blue-700 dark:text-blue-300 dark:border-blue-700 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/20 disabled:opacity-50"
          >
            Счет-оферта
          </button>
          <button
            type="button"
            onClick={() => setBillingProfileModalOpen(true)}
            className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700"
          >
            {billingProfile ? "Изменить реквизиты" : "Заполнить реквизиты"}
          </button>
        </div>
        {billingProfile && (
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
            Платежный профиль:{" "}
            {billingProfile.entityType === "INDIVIDUAL"
              ? billingProfile.fullName || "Физлицо"
              : billingProfile.companyName || "Организация"}
            {billingProfile.inn ? `, ИНН ${billingProfile.inn}` : ""}
          </p>
        )}
        {confirmingPayment && (
          <p className="text-sm text-blue-600 dark:text-blue-400 mb-3">
            Проверяем статус оплаты…
          </p>
        )}
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
          Сначала выберите период оплаты, затем тариф по количеству участников.
        </p>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 mb-6">
          {plans
            .filter((p) => !p.isUnlimited)
            .map((plan) => (
              <button
                key={plan.key}
                type="button"
                onClick={() => {
                  setSelectedPlan(plan.key);
                  setCustomMembersInput("");
                }}
                className={`text-left p-4 rounded-xl border-2 transition-colors ${
                  selectedPlan === plan.key
                    ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20 dark:border-blue-400"
                    : "border-gray-200 dark:border-gray-600 hover:border-gray-300 dark:hover:border-gray-500"
                }`}
              >
                <p className="font-medium text-gray-900 dark:text-white">{plan.label}</p>
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                  {selectedPeriod === "half_year"
                    ? `${plan.rateForHalfYear} ₽ за 1 пользователя / месяц`
                    : `${plan.rateForYear} ₽ за 1 пользователя / месяц`}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-500">
                  {selectedPeriod === "half_year"
                    ? `${plan.pricePerHalfYearFormatted} за 6 месяцев`
                    : `${plan.pricePerYearFormatted} за 12 месяцев`}
                </p>
              </button>
            ))}
        </div>
        <div className="mb-6 rounded-xl border border-gray-200 dark:border-gray-700 p-4 bg-gray-50 dark:bg-gray-900/30">
          <p className="text-sm font-medium text-gray-900 dark:text-white mb-2">
            Нужное количество лицензий (кастом)
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <input
              type="number"
              min={1}
              placeholder="Введите количество лицензий"
              value={customMembersInput}
              onChange={(e) => {
                setCustomMembersInput(e.target.value);
                if (e.target.value) setSelectedPlan("");
              }}
              className="w-72 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white px-3 py-2"
            />
            {customMembers && customRate && customAmount && (
              <p className="text-sm text-gray-700 dark:text-gray-300">
                {customRate} ₽/польз./мес., итого {formatRub(customAmount)} за {selectedPeriod === "half_year" ? "6" : "12"} месяцев
              </p>
            )}
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
            Если указать кастомное количество лицензий, оплата и счёт‑оферта будут сформированы именно по нему.
          </p>
        </div>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Тариф «Более 3600» — по запросу (договорная цена).
        </p>
      </div>
      )}

      {/* История платежей */}
      {activeTab === "payments" && (
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm p-6">
        <div className="flex items-center justify-between gap-3 mb-4">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            История платежей
          </h2>
          <button
            type="button"
            onClick={handleSyncPayments}
            disabled={syncPaymentsLoading}
            className="px-3 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50"
          >
            {syncPaymentsLoading ? "Синхронизация…" : "Синхронизировать с T-Bank"}
          </button>
        </div>
        {!syncPaymentsLoading && (
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
            Авто-синхронизация с T-Bank выполняется при открытии вкладки.
          </p>
        )}
        {payments.length === 0 ? (
          <p className="text-gray-500 dark:text-gray-400">Платежей пока нет</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400">
                  <th className="py-2 pr-4">Дата</th>
                  <th className="py-2 pr-4">Сумма</th>
                  <th className="py-2 pr-4">Период</th>
                  <th className="py-2">Статус</th>
                  <th className="py-2 pl-4">Шлюз</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((p) => (
                  <tr key={p.id} className="border-b border-gray-100 dark:border-gray-700">
                    <td className="py-2 pr-4">
                      {new Date(p.createdAt).toLocaleDateString("ru-RU")}
                    </td>
                    <td className="py-2 pr-4">{p.amountRub} ₽</td>
                    <td className="py-2 pr-4">
                      {new Date(p.periodStart).toLocaleDateString("ru-RU")} —{" "}
                      {new Date(p.periodEnd).toLocaleDateString("ru-RU")}
                    </td>
                    <td className="py-2">
                      <span className={`px-2 py-1 rounded-md text-xs font-medium ${getStatusClass(p.status)}`}>
                        {getStatusLabel(p.status)}
                      </span>
                    </td>
                    <td className="py-2 pl-4 text-xs text-gray-500 dark:text-gray-400">
                      {p.gatewayStatus || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      )}
      <BillingProfileModal
        isOpen={billingProfileModalOpen}
        onClose={() => setBillingProfileModalOpen(false)}
        onSaved={() => {
          void refreshSubscriptionData();
        }}
      />
    </div>
  );
}
