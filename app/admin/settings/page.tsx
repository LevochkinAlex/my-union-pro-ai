"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { UserRole } from "@prisma/client";

interface EnvVariables {
  NEXT_PUBLIC_APP_URL?: string;
  NEXT_PUBLIC_FIREBASE_API_KEY?: string;
  NEXT_PUBLIC_FIREBASE_PROJECT_ID?: string;
  NEXT_PUBLIC_FIREBASE_VAPID_PUBLIC_KEY?: string;
  FIREBASE_PRIVATE_KEY?: string;
  OPENROUTER_API_KEY?: string;
  RUNWAYML_API_KEY?: string;
  RUNWAYML_API_VERSION?: string;
  DADATA_API_KEY?: string;
}

export default function AdminSettingsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [envVariables, setEnvVariables] = useState<EnvVariables>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [notificationHeading, setNotificationHeading] = useState("");
  const [notificationContent, setNotificationContent] = useState("");
  const [sendingNotification, setSendingNotification] = useState(false);
  const [notificationMessage, setNotificationMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Проверяем доступ
  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/");
    }
    if (status === "authenticated" && session?.user?.role !== UserRole.SUPER_ADMIN) {
      router.push("/");
    }
  }, [status, session, router]);

  // Загружаем настройки
  useEffect(() => {
    if (status === "authenticated") {
      loadEnvVariables();
    }
  }, [status]);

  useEffect(() => {
    if (message) {
      const timeout = setTimeout(() => setMessage(null), 5000);
      return () => clearTimeout(timeout);
    }
  }, [message]);

  useEffect(() => {
    if (notificationMessage) {
      const timeout = setTimeout(() => setNotificationMessage(null), 5000);
      return () => clearTimeout(timeout);
    }
  }, [notificationMessage]);

  const loadEnvVariables = async () => {
    try {
      const response = await fetch("/api/admin/env");
      if (response.ok) {
        const data = await response.json();
        // Используем локальные значения
        const localVars: EnvVariables = {};
        Object.keys(data).forEach((key) => {
          localVars[key as keyof EnvVariables] = data[key].local || data[key].prod || "";
        });
        setEnvVariables(localVars);
      }
    } catch (error) {
      console.error("Error loading env variables:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage(null);

    try {
      const response = await fetch("/api/admin/env", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          env: "local",
          variables: envVariables,
        }),
      });

      if (response.ok) {
        setMessage({ type: "success", text: "Настройки успешно сохранены!" });
      } else {
        const error = await response.json();
        setMessage({ type: "error", text: error.error || "Ошибка при сохранении настроек" });
      }
    } catch (error) {
      console.error("Error saving settings:", error);
      setMessage({ type: "error", text: "Ошибка при сохранении" });
    } finally {
      setSaving(false);
    }
  };

  const handleSendNotification = async (e: React.FormEvent) => {
    e.preventDefault();
    setSendingNotification(true);
    setNotificationMessage(null);

    try {
      const response = await fetch("/api/admin/notifications/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          heading: notificationHeading,
          content: notificationContent,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        setNotificationMessage({
          type: "success",
          text: `Уведомление отправлено ${data.recipientCount} пользователям!`,
        });
        setNotificationHeading("");
        setNotificationContent("");
      } else {
        const error = await response.json();
        setNotificationMessage({ type: "error", text: error.error || "Ошибка отправки" });
      }
    } catch (error) {
      console.error("Error sending notification:", error);
      setNotificationMessage({ type: "error", text: "Ошибка при отправке уведомления" });
    } finally {
      setSendingNotification(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <div className="mb-4 inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-blue-500 border-r-transparent"></div>
          <p className="text-gray-600 dark:text-gray-400">Загрузка настроек...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 p-8">
      <div>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
          Административные настройки
        </h1>
        <p className="mt-2 text-gray-600 dark:text-gray-400">
          Управление системными настройками и уведомлениями
        </p>
      </div>

      {message && (
        <div
          className={`rounded-lg border px-4 py-3 text-sm shadow-sm ${
            message.type === "success"
              ? "border-green-200 bg-green-50 text-green-800 dark:border-green-900/40 dark:bg-green-900/20 dark:text-green-200"
              : "border-red-200 bg-red-50 text-red-800 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-200"
          }`}
        >
          {message.text}
        </div>
      )}

      {/* Firebase & API Settings */}
      <div className="w-full rounded-lg border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-6">
          🔥 Firebase & API Настройки
        </h2>

        <form onSubmit={handleSaveSettings} className="space-y-6">
          {/* App URL */}
          <div>
            <label className="block text-sm font-medium text-gray-900 dark:text-white mb-2">
              App URL
            </label>
            <input
              type="text"
              value={envVariables.NEXT_PUBLIC_APP_URL || ""}
              onChange={(e) =>
                setEnvVariables({ ...envVariables, NEXT_PUBLIC_APP_URL: e.target.value })
              }
              placeholder="https://myunion.pro"
              className="w-full rounded-lg border border-gray-300 bg-white px-4 py-2 text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
            />
          </div>

          {/* Firebase API Key */}
          <div>
            <label className="block text-sm font-medium text-gray-900 dark:text-white mb-2">
              Firebase API Key
            </label>
            <input
              type="password"
              value={envVariables.NEXT_PUBLIC_FIREBASE_API_KEY || ""}
              onChange={(e) =>
                setEnvVariables({ ...envVariables, NEXT_PUBLIC_FIREBASE_API_KEY: e.target.value })
              }
              placeholder="AIzaSy..."
              className="w-full rounded-lg border border-gray-300 bg-white px-4 py-2 text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
            />
          </div>

          {/* Firebase Project ID */}
          <div>
            <label className="block text-sm font-medium text-gray-900 dark:text-white mb-2">
              Firebase Project ID
            </label>
            <input
              type="text"
              value={envVariables.NEXT_PUBLIC_FIREBASE_PROJECT_ID || ""}
              onChange={(e) =>
                setEnvVariables({ ...envVariables, NEXT_PUBLIC_FIREBASE_PROJECT_ID: e.target.value })
              }
              placeholder="myunion-c3187"
              className="w-full rounded-lg border border-gray-300 bg-white px-4 py-2 text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
            />
          </div>

          {/* Firebase VAPID Key */}
          <div>
            <label className="block text-sm font-medium text-gray-900 dark:text-white mb-2">
              Firebase VAPID Public Key
            </label>
            <input
              type="text"
              value={envVariables.NEXT_PUBLIC_FIREBASE_VAPID_PUBLIC_KEY || ""}
              onChange={(e) =>
                setEnvVariables({
                  ...envVariables,
                  NEXT_PUBLIC_FIREBASE_VAPID_PUBLIC_KEY: e.target.value,
                })
              }
              placeholder="BKvFwStvyT..."
              className="w-full rounded-lg border border-gray-300 bg-white px-4 py-2 text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
            />
          </div>

          {/* OpenRouter API Key */}
          <div>
            <label className="block text-sm font-medium text-gray-900 dark:text-white mb-2">
              OpenRouter API Key
            </label>
            <input
              type="password"
              value={envVariables.OPENROUTER_API_KEY || ""}
              onChange={(e) =>
                setEnvVariables({ ...envVariables, OPENROUTER_API_KEY: e.target.value })
              }
              placeholder="sk-or-v1-..."
              className="w-full rounded-lg border border-gray-300 bg-white px-4 py-2 text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
            />
          </div>

          {/* RunwayML API Key */}
          <div>
            <label className="block text-sm font-medium text-gray-900 dark:text-white mb-2">
              RunwayML API Key
            </label>
            <input
              type="password"
              value={envVariables.RUNWAYML_API_KEY || ""}
              onChange={(e) =>
                setEnvVariables({ ...envVariables, RUNWAYML_API_KEY: e.target.value })
              }
              placeholder="key_..."
              className="w-full rounded-lg border border-gray-300 bg-white px-4 py-2 text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
            />
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Используется для генерации изображений в новостях и постах
            </p>
          </div>

          {/* RunwayML API Version */}
          <div>
            <label className="block text-sm font-medium text-gray-900 dark:text-white mb-2">
              RunwayML API Version
            </label>
            <input
              type="text"
              value={envVariables.RUNWAYML_API_VERSION || "2024-11-06"}
              onChange={(e) =>
                setEnvVariables({ ...envVariables, RUNWAYML_API_VERSION: e.target.value })
              }
              placeholder="2024-11-06"
              className="w-full rounded-lg border border-gray-300 bg-white px-4 py-2 text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
            />
          </div>

          {/* DaData API Key */}
          <div>
            <label className="block text-sm font-medium text-gray-900 dark:text-white mb-2">
              DaData API Key
            </label>
            <input
              type="password"
              value={envVariables.DADATA_API_KEY || ""}
              onChange={(e) =>
                setEnvVariables({ ...envVariables, DADATA_API_KEY: e.target.value })
              }
              placeholder="..."
              className="w-full rounded-lg border border-gray-300 bg-white px-4 py-2 text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
            />
          </div>

          <button
            type="submit"
            disabled={saving}
            className="w-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {saving ? "Сохранение..." : "💾 Сохранить настройки"}
          </button>
        </form>
      </div>

      {/* Broadcast Notifications */}
      <div className="w-full rounded-lg border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-6">
          📢 Массовые уведомления
        </h2>

        {notificationMessage && (
          <div
            className={`mb-4 rounded-lg border px-4 py-3 text-sm shadow-sm ${
              notificationMessage.type === "success"
                ? "border-green-200 bg-green-50 text-green-800 dark:border-green-900/40 dark:bg-green-900/20 dark:text-green-200"
                : "border-red-200 bg-red-50 text-red-800 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-200"
            }`}
          >
            {notificationMessage.text}
          </div>
        )}

        <form onSubmit={handleSendNotification} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-900 dark:text-white mb-2">
              Заголовок
            </label>
            <input
              type="text"
              value={notificationHeading}
              onChange={(e) => setNotificationHeading(e.target.value)}
              placeholder="Введите заголовок уведомления"
              required
              className="w-full rounded-lg border border-gray-300 bg-white px-4 py-2 text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-900 dark:text-white mb-2">
              Текст сообщения
            </label>
            <textarea
              value={notificationContent}
              onChange={(e) => setNotificationContent(e.target.value)}
              placeholder="Введите текст уведомления"
              required
              rows={4}
              className="w-full rounded-lg border border-gray-300 bg-white px-4 py-2 text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white resize-none"
            />
          </div>

          <button
            type="submit"
            disabled={sendingNotification}
            className="w-full rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {sendingNotification ? "Отправка..." : "🔔 Отправить всем пользователям"}
          </button>

          <p className="text-xs text-gray-500 dark:text-gray-400 text-center">
            Уведомление будет отправлено всем пользователям с активной подпиской на push-уведомления
          </p>
        </form>
      </div>
    </div>
  );
}
