"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";

const DOC_TYPE_LABELS: Record<string, string> = {
  AGENDA: "Повестка дня",
  PROTOCOL: "Протокол",
  RESOLUTION: "Решение",
  PROTOCOL_EXTRACT: "Выписка из протокола",
};

interface Template {
  id: string;
  name: string;
  description: string | null;
  type: string;
  isDefault: boolean;
}

export default function DocumentTemplatesPage() {
  const { status } = useSession();
  const router = useRouter();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status !== "authenticated") return;

    let cancelled = false;
    setLoading(true);
    setError(null);

    fetch("/api/org-head/document-templates")
      .then((res) => {
        if (res.status === 403) {
          router.replace("/dashboard");
          return null;
        }
        if (!res.ok) throw new Error("Ошибка загрузки");
        return res.json();
      })
      .then((data) => {
        if (!cancelled && data) setTemplates(data.templates || []);
      })
      .catch((err) => {
        if (!cancelled) setError(err?.message || "Ошибка загрузки");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [status, router]);

  if (status === "loading" || loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="px-4 py-8 sm:px-8 lg:px-12">
        <div className="rounded-lg bg-red-50 dark:bg-red-900/20 p-4 text-red-700 dark:text-red-300">
          {error}
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 py-8 sm:px-8 lg:px-12 max-w-4xl">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
        Шаблоны документов
      </h1>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
        Шаблоны заседаний профкома (повестки, протоколы, решения). Редактирование доступно в супер-админке.
      </p>

      {templates.length === 0 ? (
        <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 p-8 text-center text-gray-500 dark:text-gray-400">
          Нет доступных шаблонов
        </div>
      ) : (
        <ul className="space-y-3">
          {templates.map((t) => (
            <li
              key={t.id}
              className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 flex items-start justify-between gap-4"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-gray-900 dark:text-white">
                    {t.name}
                  </span>
                  {t.isDefault && (
                    <span className="px-2 py-0.5 text-xs rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-300">
                      По умолчанию
                    </span>
                  )}
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    {DOC_TYPE_LABELS[t.type] || t.type}
                  </span>
                </div>
                {t.description && (
                  <p className="mt-1 text-sm text-gray-500 dark:text-gray-400 line-clamp-2">
                    {t.description}
                  </p>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
