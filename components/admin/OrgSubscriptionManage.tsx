"use client";

import { useEffect, useState } from "react";
import { alertSuccess, alertError } from "@/lib/alert";

interface SubscriptionState {
  subscription: {
    id: string;
    status: string;
    memberLimit: number | null;
    tariffKey: string | null;
    tariffLabel: string;
    trialEndsAt: string | null;
    periodEndsAt: string | null;
    manualOverride: boolean;
    addedDaysByAdmin: number | null;
    adminNote: string | null;
  };
  usage: {
    effectiveLimit: number | null;
    activeMembers: number;
    isOverLimit: boolean;
  };
}

interface OrgSubscriptionManageProps {
  organizationId: string;
  organizationName: string;
  onUpdated?: () => void;
}

const TARIFF_KEYS = ["50", "100", "200", "500", "1000", "2000", "3600", "UNLIMITED"];

export default function OrgSubscriptionManage({
  organizationId,
  organizationName,
  onUpdated,
}: OrgSubscriptionManageProps) {
  const [data, setData] = useState<SubscriptionState | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [addDays, setAddDays] = useState(30);
  const [setTariffDays, setSetTariffDays] = useState(365);
  const [setTariffKey, setSetTariffKey] = useState("");
  const [setMemberLimit, setSetMemberLimit] = useState("");
  const [adminNote, setAdminNote] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/organizations/${organizationId}/subscription`);
      if (res.ok) {
        const d = await res.json();
        setData(d);
      } else {
        setData(null);
      }
    } catch (e) {
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [organizationId]);

  const doAction = async (action: string, body: Record<string, unknown> = {}) => {
    setActionLoading(true);
    try {
      const res = await fetch(`/api/admin/organizations/${organizationId}/subscription`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...body }),
      });
      const d = await res.json();
      if (!res.ok) {
        alertError(d.error || "Ошибка");
        return;
      }
      alertSuccess("Готово");
      onUpdated?.();
      load();
    } catch (e) {
      alertError("Ошибка запроса");
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="mt-4 p-4 border border-gray-200 dark:border-gray-700 rounded-lg">
        <p className="text-gray-500 dark:text-gray-400">Загрузка подписки…</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="mt-4 p-4 border border-gray-200 dark:border-gray-700 rounded-lg">
        <p className="text-gray-500 dark:text-gray-400">Не удалось загрузить подписку</p>
      </div>
    );
  }

  const { subscription, usage } = data;

  return (
    <div className="mt-4 p-4 border border-gray-200 dark:border-gray-700 rounded-lg space-y-4">
      <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Подписка</h3>
      <div className="text-sm text-gray-600 dark:text-gray-400">
        <p>
          <span className="font-medium">Статус:</span> {subscription.status}
        </p>
        <p>
          <span className="font-medium">Тариф:</span> {subscription.tariffLabel}
        </p>
        <p>
          <span className="font-medium">Участников:</span> {usage.activeMembers}
          {usage.effectiveLimit != null && ` / ${usage.effectiveLimit}`}
          {usage.isOverLimit && (
            <span className="text-red-600 dark:text-red-400 ml-1">(превышен лимит)</span>
          )}
        </p>
        {subscription.trialEndsAt && (
          <p>
            <span className="font-medium">Пробный период до:</span>{" "}
            {new Date(subscription.trialEndsAt).toLocaleDateString("ru-RU")}
          </p>
        )}
        {subscription.periodEndsAt && (
          <p>
            <span className="font-medium">Подписка до:</span>{" "}
            {new Date(subscription.periodEndsAt).toLocaleDateString("ru-RU")}
          </p>
        )}
        {subscription.manualOverride && (
          <p className="text-amber-600 dark:text-amber-400">Ручное управление суперадмином</p>
        )}
      </div>

      <div className="flex flex-wrap gap-3 pt-2 border-t border-gray-200 dark:border-gray-700">
        <button
          type="button"
          onClick={() => doAction("activate_trial")}
          disabled={actionLoading}
          className="px-3 py-1.5 bg-amber-500 text-white rounded-lg hover:bg-amber-600 disabled:opacity-50 text-sm"
        >
          {actionLoading ? "…" : "14 дней теста"}
        </button>

        <div className="flex items-center gap-2">
          <input
            type="number"
            min={1}
            max={730}
            value={addDays}
            onChange={(e) => setAddDays(parseInt(e.target.value, 10) || 30)}
            className="w-20 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white px-2 py-1.5 text-sm"
          />
          <span className="text-sm text-gray-500 dark:text-gray-400">дней</span>
          <button
            type="button"
            onClick={() => doAction("add_days", { days: addDays })}
            disabled={actionLoading}
            className="px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm"
          >
            Добавить дни
          </button>
        </div>

        <button
          type="button"
          onClick={() => doAction("set_unlimited", { addDays: 365 })}
          disabled={actionLoading}
          className="px-3 py-1.5 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 text-sm"
        >
          Безлимит (365 дн.)
        </button>
      </div>

      <div className="pt-2 border-t border-gray-200 dark:border-gray-700 space-y-2">
        <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Задать тариф вручную</p>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={setTariffKey}
            onChange={(e) => setSetTariffKey(e.target.value)}
            className="rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white px-2 py-1.5 text-sm"
          >
            <option value="">— тариф —</option>
            {TARIFF_KEYS.map((k) => (
              <option key={k} value={k}>
                {k === "UNLIMITED" ? "Безлимит" : `До ${k}`}
              </option>
            ))}
          </select>
          <input
            type="number"
            min={1}
            placeholder="Лимит участников (опц.)"
            value={setMemberLimit}
            onChange={(e) => setSetMemberLimit(e.target.value)}
            className="w-36 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white px-2 py-1.5 text-sm"
          />
          <input
            type="number"
            min={1}
            max={730}
            value={setTariffDays}
            onChange={(e) => setSetTariffDays(parseInt(e.target.value, 10) || 365)}
            className="w-20 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white px-2 py-1.5 text-sm"
          />
          <span className="text-sm text-gray-500 dark:text-gray-400">дней</span>
          <button
            type="button"
            onClick={() =>
              doAction("set_tariff", {
                tariffKey: setTariffKey || undefined,
                memberLimit: setMemberLimit ? parseInt(setMemberLimit, 10) : undefined,
                addDays: setTariffDays,
                adminNote: adminNote || undefined,
              })
            }
            disabled={actionLoading || !setTariffKey}
            className="px-3 py-1.5 bg-gray-600 text-white rounded-lg hover:bg-gray-700 disabled:opacity-50 text-sm"
          >
            Применить тариф
          </button>
        </div>
        <input
          type="text"
          placeholder="Заметка админа (опц.)"
          value={adminNote}
          onChange={(e) => setAdminNote(e.target.value)}
          className="w-full max-w-xs rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white px-2 py-1.5 text-sm"
        />
      </div>
    </div>
  );
}
