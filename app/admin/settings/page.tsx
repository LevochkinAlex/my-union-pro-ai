"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import Button from "@/components/ui/button/Button";
import InputField from "@/components/ui/InputField";

import {
  getDaDataConfig,
  getOneSignalConfig,
} from "@/lib/settings";

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

type Settings = {
  [key: string]: string;
};

type EnvSettings = Record<string, string>;
type EnvTarget = 'local' | 'production';

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

export default function SettingsPage() {
  const [settings, setSettings] = useState<Settings>({});
  const [initialData, setInitialData] = useState<SettingsForm>(EMPTY_FORM);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<MessageState | null>(null);
  const [envSettings, setEnvSettings] = useState<EnvSettings>({});
  const [envTarget, setEnvTarget] = useState<EnvTarget>('local');
  const [isEnvLoading, setIsEnvLoading] = useState(true);
  const [isEnvSaving, setIsEnvSaving] = useState(false);
  const [envMessage, setEnvMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const loadSettings = useCallback(async () => {
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

      setSettings(nextState);
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
  }, []);

  const loadEnvSettings = useCallback(async (target: EnvTarget) => {
    setIsEnvLoading(true);
    setEnvMessage(null);
    try {
      const response = await fetch(`/api/admin/env-settings?target=${target}`);
      if (response.ok) {
        const { data } = await response.json();
        setEnvSettings(data || {});
      } else {
        const { error } = await response.json();
        setEnvMessage({ type: "error", text: error || "Не удалось загрузить переменные окружения." });
      }
    } catch (error) {
      console.error(`Failed to load .env.${target} settings:`, error);
      setEnvMessage({ type: "error", text: `Не удалось загрузить .env.${target}.` });
    } finally {
      setIsEnvLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  useEffect(() => {
    loadEnvSettings(envTarget);
  }, [loadEnvSettings, envTarget]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setSettings((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleEnvTargetChange = (target: EnvTarget) => {
    setEnvTarget(target);
  };

  const handleSettingChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSettings({ ...settings, [e.target.name]: e.target.value });
    setMessage(null);
  };

  const handleEnvSettingChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setEnvSettings({ ...envSettings, [e.target.name]: e.target.value });
    setEnvMessage(null);
  };

  const addEnvVariable = () => {
    const newKey = `NEW_VARIABLE_${Object.keys(envSettings).length + 1}`;
    setEnvSettings({ ...envSettings, [newKey]: "" });
  };

  const removeEnvVariable = (keyToRemove: string) => {
    const newEnvSettings = { ...envSettings };
    delete newEnvSettings[keyToRemove];
    setEnvSettings(newEnvSettings);
  };


  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage(null);

    try {
      const response = await fetch("/api/admin/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error?.error ?? "Не удалось сохранить настройки");
      }

      setInitialData(settings);
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

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setMessage(null);
    try {
      const response = await fetch("/api/admin/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      if (response.ok) {
        setMessage({ type: "success", text: "Настройки успешно сохранены." });
      } else {
        setMessage({ type: "error", text: "Ошибка при сохранении настроек." });
      }
    } catch (error) {
      console.error("Failed to save settings:", error);
      setMessage({ type: "error", text: "Ошибка при сохранении настроек." });
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveEnvSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsEnvSaving(true);
    setEnvMessage(null);
    try {
      const response = await fetch(`/api/admin/env-settings?target=${envTarget}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data: envSettings }),
      });
      const result = await response.json();
      if (response.ok) {
        setEnvMessage({ type: "success", text: result.message || "Переменные окружения успешно сохранены." });
      } else {
        setEnvMessage({ type: "error", text: result.error || "Ошибка при сохранении переменных окружения." });
      }
    } catch (error) {
      console.error("Failed to save env settings:", error);
      setEnvMessage({ type: "error", text: "Ошибка при сохранении переменных окружения." });
    } finally {
      setIsEnvSaving(false);
    }
  };

  const handleReset = () => {
    setSettings(initialData);
    setMessage(null);
  };

  const isDirty = useMemo(
    () => JSON.stringify(settings) !== JSON.stringify(initialData),
    [settings, initialData],
  );

  if (loading || isEnvLoading) {
    return (
      <div>
        <p>Загрузка настроек...</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold">Системные настройки</h1>

      {message && (
          <div
            className={`p-4 rounded-md ${
              message.type === "success"
                ? "bg-green-100 text-green-800"
                : "bg-red-100 text-red-800"
            }`}
          >
            {message.text}
          </div>
        )}

      <form onSubmit={handleSaveSettings} className="space-y-6 bg-white dark:bg-gray-800 p-6 rounded-lg shadow-md">
        {/* SMTP, OpenRouter, DaData, OneSignal sections */}
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
                  value={settings.smtpHost}
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
                  value={settings.smtpPort}
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
                  value={settings.smtpUser}
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
                  value={settings.smtpPassword}
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
                  value={settings.smtpFrom}
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
                  value={settings.openrouterApiKey}
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
                  value={settings.openrouterModel}
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
                  value={settings.dadataApiKey}
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
                  value={settings.dadataSecretKey}
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
                  value={settings.onesignalAppId}
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
                  value={settings.onesignalSafariWebId}
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
                  value={settings.onesignalRestApiKey}
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

        <div className="space-y-6">
            <h2 className="text-xl font-bold">Переменные окружения (.env)</h2>
            <div className="flex items-center space-x-4 bg-white dark:bg-gray-800 p-4 rounded-lg shadow-md">
                <span className="font-medium">Выберите окружение:</span>
                <div className="flex rounded-md shadow-sm">
                    <button
                        type="button"
                        onClick={() => handleEnvTargetChange('local')}
                        className={`px-4 py-2 text-sm font-medium rounded-l-md transition-colors ${
                            envTarget === 'local' 
                                ? 'bg-indigo-600 text-white' 
                                : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-600'
                        }`}
                    >
                        Development (.env.local)
                    </button>
                    <button
                        type="button"
                        onClick={() => handleEnvTargetChange('production')}
                        className={`px-4 py-2 text-sm font-medium rounded-r-md transition-colors ${
                            envTarget === 'production' 
                                ? 'bg-indigo-600 text-white' 
                                : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-600'
                        }`}
                    >
                        Production (.env.production)
                    </button>
                </div>
            </div>
            {envMessage && (
                <div className={`p-4 rounded-md ${envMessage.type === "success" ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200" : "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200"}`}>
                    {envMessage.text}
                </div>
            )}
            <form onSubmit={handleSaveEnvSettings} className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-md">
                {isEnvLoading ? (
                    <p>Загрузка переменных окружения...</p>
                ) : (
                    <div className="space-y-4">
                        {Object.entries(envSettings).map(([key, value]) => (
                            <div key={key} className="grid grid-cols-1 md:grid-cols-3 gap-4 items-center">
                                <InputField
                                    name={key}
                                    value={key}
                                    onChange={(e) => {
                                      const newKey = e.target.value;
                                      const newEnvSettings = {...envSettings};
                                      delete newEnvSettings[key];
                                      newEnvSettings[newKey] = value;
                                      setEnvSettings(newEnvSettings)
                                    }}
                                    className="col-span-1"
                                    placeholder="Имя переменной"
                                />
                                <div className="col-span-2 flex items-center gap-2">
                                  <InputField
                                      name={key}
                                      value={value}
                                      onChange={(e) => setEnvSettings({ ...envSettings, [key]: e.target.value })}
                                      className="flex-grow"
                                      placeholder="Значение переменной"
                                  />
                                  <button type="button" onClick={() => removeEnvVariable(key)} className="p-2 text-red-500 hover:text-red-700">
                                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                          <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm4 0a1 1 0 012 0v6a1 1 0 11-2 0V8z" clipRule="evenodd" />
                                      </svg>
                                  </button>
                                </div>
                            </div>
                        ))}
                        <div className="flex justify-between items-center pt-4">
                            <Button type="button" onClick={addEnvVariable} variant="secondary">
                                Добавить переменную
                            </Button>
                            <Button type="submit" disabled={isEnvSaving}>
                                {isEnvSaving ? "Сохранение..." : "Сохранить переменные окружения"}
                            </Button>
                        </div>
                    </div>
                )}
            </form>
        </div>
      </div>
  );
}

