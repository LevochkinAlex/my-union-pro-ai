"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { UserRole } from "@prisma/client";

interface Settings {
  oneSignalAppId?: string;
  oneSignalRestApiKey?: string;
}

export default function AdminSettingsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [settings, setSettings] = useState<Settings>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [notificationHeading, setNotificationHeading] = useState("");
  const [notificationContent, setNotificationContent] = useState("");
  const [sendingNotification, setSendingNotification] = useState(false);
  const [notificationMessage, setNotificationMessage] = useState("");

  // Проверяем доступ
  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/");
    }
    if (
      status === "authenticated" &&
      session?.user?.role !== UserRole.SUPER_ADMIN
    ) {
      router.push("/");
    }
  }, [status, session, router]);

  // Загружаем настройки
  useEffect(() => {
    if (status === "authenticated") {
      loadSettings();
    }
  }, [status]);

  const loadSettings = async () => {
    try {
      const response = await fetch("/api/admin/settings");
      if (response.ok) {
        const data = await response.json();
        setSettings(data);
      }
    } catch (error) {
      console.error("Error loading settings:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage("");

    try {
      const response = await fetch("/api/admin/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });

      if (response.ok) {
        setMessage("✅ Настройки сохранены успешно!");
        setTimeout(() => setMessage(""), 3000);
      } else {
        setMessage("❌ Ошибка при сохранении настроек");
      }
    } catch (error) {
      console.error("Error saving settings:", error);
      setMessage("❌ Ошибка при сохранении");
    } finally {
      setSaving(false);
    }
  };

  const handleSendNotification = async (e: React.FormEvent) => {
    e.preventDefault();
    setSendingNotification(true);
    setNotificationMessage("");

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
        setNotificationMessage(
          `✅ Уведомление отправлено ${data.recipientCount} пользователям!`
        );
        setNotificationHeading("");
        setNotificationContent("");
        setTimeout(() => setNotificationMessage(""), 5000);
      } else {
        const error = await response.json();
        setNotificationMessage(`❌ Ошибка: ${error.error}`);
      }
    } catch (error) {
      console.error("Error sending notification:", error);
      setNotificationMessage("❌ Ошибка при отправке уведомления");
    } finally {
      setSendingNotification(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-lg text-gray-400">Загрузка...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-6">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold text-white mb-8">
          ⚙️ Административные Настройки
        </h1>

        {/* OneSignal Settings Section */}
        <div className="bg-slate-700/50 border border-slate-600 rounded-lg p-6 mb-8">
          <h2 className="text-2xl font-semibold text-white mb-6">
            🔔 Настройки OneSignal
          </h2>

          <form onSubmit={handleSaveSettings} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                App ID
              </label>
              <input
                type="text"
                value={settings.oneSignalAppId || ""}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    oneSignalAppId: e.target.value,
                  })
                }
                placeholder="2c84a506-45ed-4935-920a-ccbbbeae8ded"
                className="w-full px-4 py-2 bg-slate-600 border border-slate-500 text-white rounded-lg focus:outline-none focus:border-blue-400"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                REST API Key
              </label>
              <input
                type="password"
                value={settings.oneSignalRestApiKey || ""}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    oneSignalRestApiKey: e.target.value,
                  })
                }
                placeholder="os_v2_app_..."
                className="w-full px-4 py-2 bg-slate-600 border border-slate-500 text-white rounded-lg focus:outline-none focus:border-blue-400"
              />
            </div>

            <button
              type="submit"
              disabled={saving}
              className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition disabled:opacity-50"
            >
              {saving ? "Сохранение..." : "💾 Сохранить Настройки"}
            </button>

            {message && (
              <div className="mt-4 p-3 bg-slate-600 rounded-lg text-center text-white">
                {message}
              </div>
            )}
          </form>
        </div>

        {/* Broadcast Notifications Section */}
        <div className="bg-slate-700/50 border border-slate-600 rounded-lg p-6">
          <h2 className="text-2xl font-semibold text-white mb-6">
            📢 Массовые Уведомления
          </h2>

          <form onSubmit={handleSendNotification} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Заголовок
              </label>
              <input
                type="text"
                value={notificationHeading}
                onChange={(e) => setNotificationHeading(e.target.value)}
                placeholder="Введите заголовок уведомления"
                required
                className="w-full px-4 py-2 bg-slate-600 border border-slate-500 text-white rounded-lg focus:outline-none focus:border-blue-400"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Текст Сообщения
              </label>
              <textarea
                value={notificationContent}
                onChange={(e) => setNotificationContent(e.target.value)}
                placeholder="Введите текст уведомления"
                required
                rows={4}
                className="w-full px-4 py-2 bg-slate-600 border border-slate-500 text-white rounded-lg focus:outline-none focus:border-blue-400 resize-none"
              />
            </div>

            <button
              type="submit"
              disabled={sendingNotification}
              className="w-full px-4 py-2 bg-green-600 hover:bg-green-700 text-white font-medium rounded-lg transition disabled:opacity-50"
            >
              {sendingNotification ? "Отправка..." : "🔔 Отправить Уведомление"}
            </button>

            {notificationMessage && (
              <div className="mt-4 p-3 bg-slate-600 rounded-lg text-center text-white">
                {notificationMessage}
              </div>
            )}
          </form>
        </div>
      </div>
    </div>
  );
}
