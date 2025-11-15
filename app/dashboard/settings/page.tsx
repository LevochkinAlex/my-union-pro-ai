"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";

interface UserSettings {
  pushNotificationsEnabled: boolean;
  pushSoundEnabled: boolean;
  emailBotNotifications: boolean;
  emailAppealNotifications: boolean;
}

export default function SettingsPage() {
  const { data: session } = useSession();
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [settings, setSettings] = useState<UserSettings>({
    pushNotificationsEnabled: true,
    pushSoundEnabled: true,
    emailBotNotifications: false,
    emailAppealNotifications: true,
  });

  useEffect(() => {
    loadSettings();
  }, []);

  useEffect(() => {
    if (message) {
      const timeout = setTimeout(() => setMessage(null), 5000);
      return () => clearTimeout(timeout);
    }
  }, [message]);

  const loadSettings = async () => {
    try {
      setIsLoading(true);
      const response = await fetch("/api/settings");
      if (!response.ok) {
        throw new Error("Не удалось загрузить настройки");
      }
      const data = await response.json();
      setSettings({
        pushNotificationsEnabled: data.pushNotificationsEnabled ?? true,
        pushSoundEnabled: data.pushSoundEnabled ?? true,
        emailBotNotifications: data.emailBotNotifications ?? false,
        emailAppealNotifications: data.emailAppealNotifications ?? true,
      });
    } catch (error) {
      console.error("Ошибка загрузки настроек:", error);
      setMessage({
        type: "error",
        text: error instanceof Error ? error.message : "Не удалось загрузить настройки",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSettingChange = (key: keyof UserSettings) => {
    setSettings((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const handleSave = async () => {
    try {
      setIsSaving(true);
      setMessage(null);

      const response = await fetch("/api/settings", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(settings),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Не удалось сохранить настройки");
      }

      setMessage({ type: "success", text: "Настройки успешно сохранены" });
    } catch (error) {
      console.error("Ошибка сохранения настроек:", error);
      setMessage({
        type: "error",
        text: error instanceof Error ? error.message : "Ошибка сохранения настроек",
      });
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
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
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Настройки</h1>
        <p className="mt-2 text-gray-600 dark:text-gray-400">
          Управляйте уведомлениями и настройками вашего аккаунта
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

      <div className="w-full max-w-5xl rounded-lg border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-6">
          Уведомления
        </h2>

        <div className="space-y-6">
          {/* Push уведомления */}
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-900">
            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
              Push уведомления
            </h3>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <label className="text-sm font-medium text-gray-900 dark:text-white">
                    Включить push уведомления
                  </label>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    Получать уведомления в браузере о новых сообщениях от бота
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleSettingChange("pushNotificationsEnabled")}
                  className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
                    settings.pushNotificationsEnabled
                      ? "bg-blue-600"
                      : "bg-gray-200 dark:bg-gray-700"
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                      settings.pushNotificationsEnabled ? "translate-x-5" : "translate-x-0"
                    }`}
                  />
                </button>
              </div>

              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <label className="text-sm font-medium text-gray-900 dark:text-white">
                    Звук уведомлений
                  </label>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    Воспроизводить звук при получении push уведомлений
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleSettingChange("pushSoundEnabled")}
                  disabled={!settings.pushNotificationsEnabled}
                  className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed ${
                    settings.pushSoundEnabled && settings.pushNotificationsEnabled
                      ? "bg-blue-600"
                      : "bg-gray-200 dark:bg-gray-700"
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                      settings.pushSoundEnabled && settings.pushNotificationsEnabled
                        ? "translate-x-5"
                        : "translate-x-0"
                    }`}
                  />
                </button>
              </div>

            </div>
          </div>

          {/* Email уведомления */}
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-900">
            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
              Email уведомления
            </h3>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <label className="text-sm font-medium text-gray-900 dark:text-white">
                    Уведомления от бота
                  </label>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    Получать на email уведомления о новых сообщениях от AI помощника
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleSettingChange("emailBotNotifications")}
                  className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
                    settings.emailBotNotifications
                      ? "bg-blue-600"
                      : "bg-gray-200 dark:bg-gray-700"
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                      settings.emailBotNotifications ? "translate-x-5" : "translate-x-0"
                    }`}
                  />
                </button>
              </div>

              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <label className="text-sm font-medium text-gray-900 dark:text-white">
                    Уведомления по обращениям
                  </label>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    Получать на email уведомления об обновлениях по вашим обращениям
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleSettingChange("emailAppealNotifications")}
                  className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
                    settings.emailAppealNotifications
                      ? "bg-blue-600"
                      : "bg-gray-200 dark:bg-gray-700"
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                      settings.emailAppealNotifications ? "translate-x-5" : "translate-x-0"
                    }`}
                  />
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-6 flex justify-end">
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="inline-flex items-center rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {isSaving ? "Сохранение..." : "Сохранить настройки"}
          </button>
        </div>
      </div>
    </div>
  );
}

