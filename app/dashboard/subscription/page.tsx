"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { alertSuccess, alertError } from "@/lib/alert";
import SubscriptionWidget from "@/components/dashboard/SubscriptionWidget";

type TariffPeriod = "month" | "quarter" | "half_year" | "year";

interface Plan {
  key: string;
  memberLimit: number | null;
  label: string;
  pricePerMonth: number;
  pricePerQuarter: number;
  pricePerHalfYear: number;
  pricePerYear: number;
  pricePerMonthFormatted: string;
  pricePerYearFormatted: string;
  isUnlimited: boolean;
}

interface Payment {
  id: string;
  amountRub: string;
  periodStart: string;
  periodEnd: string;
  status: string;
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

const PERIOD_LABELS: Record<TariffPeriod, string> = {
  month: "Месяц",
  quarter: "Квартал",
  half_year: "Полгода",
  year: "Год",
};

export default function SubscriptionPage() {
  const [subData, setSubData] = useState<SubscriptionData | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [trialLoading, setTrialLoading] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<string>("");
  const [selectedPeriod, setSelectedPeriod] = useState<TariffPeriod>("year");
  type SubTab = "current" | "tariffs" | "payments";
  const [activeTab, setActiveTab] = useState<SubTab>("current");

  useEffect(() => {
    Promise.all([
      fetch("/api/subscription").then(async (r) => (r.ok ? r.json() : null)),
      fetch("/api/subscription/plans").then((r) => (r.ok ? r.json() : null)),
      fetch("/api/subscription/payments").then(async (r) => (r.ok ? r.json() : null)),
    ]).then(([sub, plansRes, paymentsRes]) => {
      if (sub && typeof sub.subscription === "object") setSubData(sub);
      setPlans(plansRes?.plans ?? []);
      setPayments(paymentsRes?.payments ?? []);
    }).finally(() => setLoading(false));
  }, []);

  const handleCheckout = async () => {
    if (!selectedPlan) {
      alertError("Выберите тариф");
      return;
    }
    const plan = plans.find((p) => p.key === selectedPlan);
    if (plan?.isUnlimited) {
      alertError("Для тарифа «Более 3600» свяжитесь с нами для индивидуального договора.");
      return;
    }
    setCheckoutLoading(true);
    try {
      const res = await fetch("/api/subscription/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tariffKey: selectedPlan, period: selectedPeriod }),
      });
      const data = await res.json();
      if (!res.ok) {
        alertError(data.error || "Ошибка оформления");
        return;
      }
      alertSuccess("Подписка оформлена");
      const subRes = await fetch("/api/subscription");
      if (subRes.ok) setSubData(await subRes.json());
      const payRes = await fetch("/api/subscription/payments");
      if (payRes.ok) {
        const payData = await payRes.json();
        setPayments(payData.payments ?? []);
      }
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
      <SubscriptionWidget />

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
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 mb-6">
          {plans
            .filter((p) => !p.isUnlimited)
            .map((plan) => (
              <button
                key={plan.key}
                type="button"
                onClick={() => setSelectedPlan(plan.key)}
                className={`text-left p-4 rounded-xl border-2 transition-colors ${
                  selectedPlan === plan.key
                    ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20 dark:border-blue-400"
                    : "border-gray-200 dark:border-gray-600 hover:border-gray-300 dark:hover:border-gray-500"
                }`}
              >
                <p className="font-medium text-gray-900 dark:text-white">{plan.label}</p>
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                  {plan.pricePerMonthFormatted} / мес
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-500">
                  {plan.pricePerYearFormatted} / год
                </p>
              </button>
            ))}
        </div>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">
          Тариф «Более 3600» — по запросу (договорная цена).
        </p>

        <div className="flex flex-wrap items-center gap-4 mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
          <label className="flex items-center gap-2">
            <span className="text-gray-700 dark:text-gray-300">Период:</span>
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
            disabled={checkoutLoading || !selectedPlan}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {checkoutLoading ? "Оформление…" : "Оформить (мок-оплата)"}
          </button>
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
          Сейчас используется моковый платёжный ресурс: подписка активируется сразу после нажатия.
        </p>
      </div>
      )}

      {/* История платежей */}
      {activeTab === "payments" && (
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm p-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          История платежей
        </h2>
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
                    <td className="py-2">{p.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      )}
    </div>
  );
}
