"use client";

import { useEffect, useMemo, useState } from "react";
import Button from "@/components/ui/button/Button";

type SettingsForm = {
  smtpHost: string;
  smtpPort: string;
  smtpUser: string;
  smtpPassword: string;
  smtpFrom: string;
  openrouterApiKey: string;
  openrouterModel: string;
  dadataApiKey: string;
  dadataSecretKey: string;
  onesignalAppId: string;
  onesignalSafariWebId: string;
  onesignalRestApiKey: string;
};

const EMPTY_FORM: SettingsForm = {
  smtpHost: "",
  smtpPort: "",
  smtpUser: "",
  smtpPassword: "",
  smtpFrom: "",
  openrouterApiKey: "",
  openrouterModel: "openrouter/auto",
  dadataApiKey: "",
  dadataSecretKey: "",
  onesignalAppId: "",
  onesignalSafariWebId: "",
  onesignalRestApiKey: "",
};

type MessageState = {
  type: "success" | "error";
  text: string;
};

export default function AdminSettings() {
  const [formData, setFormData] = useState<SettingsForm>(EMPTY_FORM);
  const [initialData, setInitialData] = useState<SettingsForm>(EMPTY_FORM);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<MessageState | null>(null);

  useEffect(() => {
    const loadSettings = async () => {
      setLoading(true);
      setMessage(null);
      try {
        const response = await fetch("/api/admin/settings");
        if (!response.ok) {
          throw new Error("Не удалось загрузить настройки");
        }

        const data = await response.json();
        const nextState: SettingsForm = {
          smtpHost: data.smtp?.host ?? "",
          smtpPort: data.smtp?.port ?? "",
          smtpUser: data.smtp?.user ?? "",
          smtpPassword: data.smtp?.password ?? "",
          smtpFrom: data.smtp?.from ?? "",
          openrouterApiKey: data.openrouter?.apiKey ?? "",
          openrouterModel: data.openrouter?.model ?? "openrouter/auto",
          dadataApiKey: data.dadata?.apiKey ?? "",
          dadataSecretKey: data.dadata?.secretKey ?? "",
          onesignalAppId: data.onesignal?.appId ?? "",
          onesignalSafariWebId: data.onesignal?.safariWebId ?? "",
          onesignalRestApiKey: data.onesignal?.restApiKey ?? "",
        };

        setFormData(nextState);
        setInitialData(nextState);
      } catch (error) {
        console.error("[admin/settings] load error", error);
        setMessage({
          type: "error",
          text:
            error instanceof Error
              ? error.message
              : "Не удалось загрузить настройки",
        });
      } finally {
        setLoading(false);
      }
    };

    loadSettings();
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage(null);

    try {
      const response = await fetch("/api/admin/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error?.error ?? "Не удалось сохранить настройки");
      }

      setInitialData(formData);
      setMessage({ type: "success", text: "Настройки сохранены" });
    } catch (error) {
      console.error("[admin/settings] save error", error);
      setMessage({
        type: "error",
        text:
          error instanceof Error ? error.message : "Не удалось сохранить настройки",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    setFormData(initialData);
    setMessage(null);
  };

  const isDirty = useMemo(
    () => JSON.stringify(formData) !== JSON.stringify(initialData),
    [formData, initialData],
  );

  return (
    <div className="p-8">
      <h1 className="mb-8 text-3xl font-bold text-gray-900 dark:text-white">
        Настройки системы
      </h1>

      {loading ? (
        <div className="rounded-lg bg-white p-6 shadow dark:bg-gray-800">
          <p className="text-gray-600 dark:text-gray-400">
            Загрузка настроек...
          </p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Feedback message */}
          {message && (
            <div
              className={`rounded-lg border px-4 py-3 text-sm ${
                message.type === "success"
                  ? "border-green-200 bg-green-50 text-green-800 dark:border-green-900/40 dark:bg-green-900/20 dark:text-green-200"
                  : "border-red-200 bg-red-50 text-red-800 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-200"
              }`}
            >
              {message.text}
            </div>
          )}

          {/* SMTP Settings */}
          <div className="rounded-lg bg-white p-6 shadow dark:bg-gray-800">
            <h2 className="mb-6 text-xl font-bold text-gray-900 dark:text-white">
              SMTP Настройки
            </h2>

            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  SMTP Host
                </label>
                <input
                  type="text"
                  name="smtpHost"
                  value={formData.smtpHost}
                  onChange={handleChange}
                  className="mt-2 w-full rounded-lg border border-gray-300 px-4 py-2 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  SMTP Port
                </label>
                <input
                  type="text"
                  name="smtpPort"
                  value={formData.smtpPort}
                  onChange={handleChange}
                  className="mt-2 w-full rounded-lg border border-gray-300 px-4 py-2 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  SMTP User
                </label>
                <input
                  type="email"
                  name="smtpUser"
                  value={formData.smtpUser}
                  onChange={handleChange}
                  placeholder="support@myunion.pro"
                  className="mt-2 w-full rounded-lg border border-gray-300 px-4 py-2 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  SMTP Password
                </label>
                <input
                  type="password"
                  name="smtpPassword"
                  value={formData.smtpPassword}
                  onChange={handleChange}
                  className="mt-2 w-full rounded-lg border border-gray-300 px-4 py-2 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  SMTP From
                </label>
                <input
                  type="email"
                  name="smtpFrom"
                  value={formData.smtpFrom}
                  onChange={handleChange}
                  className="mt-2 w-full rounded-lg border border-gray-300 px-4 py-2 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                />
              </div>
            </div>
          </div>

          {/* OpenRouter Settings */}
          <div className="rounded-lg bg-white p-6 shadow dark:bg-gray-800">
            <h2 className="mb-6 text-xl font-bold text-gray-900 dark:text-white">
              OpenRouter (AI)
            </h2>

            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  API Key
                </label>
                <input
                  type="password"
                  name="openrouterApiKey"
                  value={formData.openrouterApiKey}
                  onChange={handleChange}
                  placeholder="sk-or-v1-..."
                  className="mt-2 w-full rounded-lg border border-gray-300 px-4 py-2 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Модель
                </label>
                <input
                  type="text"
                  name="openrouterModel"
                  value={formData.openrouterModel}
                  onChange={handleChange}
                  placeholder="openai/gpt-4o-mini"
                  className="mt-2 w-full rounded-lg border border-gray-300 px-4 py-2 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                />
              </div>
            </div>
          </div>

          {/* DaData Settings */}
          <div className="rounded-lg bg-white p-6 shadow dark:bg-gray-800">
            <h2 className="mb-6 text-xl font-bold text-gray-900 dark:text-white">
              DaData API
            </h2>

            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  API Key
                </label>
                <input
                  type="password"
                  name="dadataApiKey"
                  value={formData.dadataApiKey}
                  onChange={handleChange}
                  className="mt-2 w-full rounded-lg border border-gray-300 px-4 py-2 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Secret Key
                </label>
                <input
                  type="password"
                  name="dadataSecretKey"
                  value={formData.dadataSecretKey}
                  onChange={handleChange}
                  className="mt-2 w-full rounded-lg border border-gray-300 px-4 py-2 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                />
              </div>
            </div>
          </div>

          {/* OneSignal Settings */}
          <div className="rounded-lg bg-white p-6 shadow dark:bg-gray-800">
            <h2 className="mb-6 text-xl font-bold text-gray-900 dark:text-white">
              OneSignal Push
            </h2>

            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  App ID
                </label>
                <input
                  type="text"
                  name="onesignalAppId"
                  value={formData.onesignalAppId}
                  onChange={handleChange}
                  className="mt-2 w-full rounded-lg border border-gray-300 px-4 py-2 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Safari Web ID
                </label>
                <input
                  type="text"
                  name="onesignalSafariWebId"
                  value={formData.onesignalSafariWebId}
                  onChange={handleChange}
                  className="mt-2 w-full rounded-lg border border-gray-300 px-4 py-2 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  REST API Key
                </label>
                <input
                  type="password"
                  name="onesignalRestApiKey"
                  value={formData.onesignalRestApiKey}
                  onChange={handleChange}
                  className="mt-2 w-full rounded-lg border border-gray-300 px-4 py-2 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                />
              </div>
            </div>
          </div>

          <div className="flex gap-4">
            <Button type="submit" disabled={saving || !isDirty}>
              {saving ? "Сохранение..." : "Сохранить"}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={handleReset}
              disabled={!isDirty || saving}
            >
              Сбросить
            </Button>
          </div>
        </form>
      )}

      {/* Profile Settings */}
      <div className="rounded-lg bg-white p-6 shadow dark:bg-gray-800">
        <h2 className="mb-6 text-xl font-bold text-gray-900 dark:text-white">
          Профиль администратора
        </h2>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Email
            </label>
            <p className="mt-2 text-gray-900 dark:text-white">
              support@myunion.pro
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Роль
            </label>
            <p className="mt-2 inline-flex rounded-full bg-purple-100 px-3 py-1 text-xs font-semibold text-purple-800 dark:bg-purple-900 dark:text-purple-200">
              SUPER_ADMIN
            </p>
          </div>

          <div className="pt-4">
            <Button variant="outline" type="button" disabled>
              Изменить пароль (скоро)
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

