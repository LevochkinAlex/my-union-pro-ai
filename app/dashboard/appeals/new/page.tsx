"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import SimpleRichTextEditor from "@/components/form/SimpleRichTextEditor";
import { useAlert } from "@/components/ui/Alert";

const TICKET_TYPES = [
  { value: "LEGAL", label: "Юридическое обращение" },
  { value: "ACCOUNTING", label: "Бухгалтерское обращение" },
  { value: "TECHNICAL", label: "Техническая поддержка" },
  { value: "HR", label: "Кадровые вопросы" },
  { value: "OTHER", label: "Прочее" },
];

const PRIORITIES = [
  { value: "LOW", label: "Низкая" },
  { value: "MEDIUM", label: "Средняя" },
  { value: "HIGH", label: "Высокая" },
  { value: "URGENT", label: "Срочная" },
];

export default function NewTicketPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const { showAlert, AlertComponent } = useAlert();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    type: "",
    priority: "MEDIUM",
    title: "",
    content: "",
  });
  const [files, setFiles] = useState<File[]>([]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.type || !formData.title || !formData.content.trim()) {
      showAlert({ message: "Заполните все обязательные поля", type: "error" });
      return;
    }

    setIsSubmitting(true);

    try {
      const formDataToSend = new FormData();
      formDataToSend.append("type", formData.type);
      formDataToSend.append("priority", formData.priority);
      formDataToSend.append("title", formData.title);
      formDataToSend.append("content", formData.content);

      files.forEach((file) => {
        formDataToSend.append("files", file);
      });

      const response = await fetch("/api/tickets", {
        method: "POST",
        body: formDataToSend,
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Ошибка при создании обращения");
      }

      const data = await response.json();
      showAlert({ message: "Обращение успешно создано", type: "success" });
      router.push(`/dashboard/appeals/${data.ticket.id}`);
    } catch (error) {
      console.error("Error creating ticket:", error);
      showAlert({
        message: error instanceof Error ? error.message : "Ошибка при создании обращения",
        type: "error",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const newFiles = Array.from(e.target.files);
      // Фильтруем опасные файлы
      const dangerousExtensions = [".exe", ".bat", ".cmd", ".sh", ".ps1", ".js", ".jar", ".app"];
      const safeFiles = newFiles.filter((file) => {
        const extension = file.name.toLowerCase().substring(file.name.lastIndexOf("."));
        return !dangerousExtensions.includes(extension);
      });

      if (safeFiles.length !== newFiles.length) {
        showAlert({
          message: "Некоторые файлы были отклонены (исполняемые скрипты запрещены)",
          type: "warning",
        });
      }

      setFiles((prev) => [...prev, ...safeFiles]);
    }
  };

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + " Б";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " КБ";
    return (bytes / (1024 * 1024)).toFixed(1) + " МБ";
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
          Создать обращение
        </h1>
        <p className="mt-2 text-gray-600 dark:text-gray-400">
          Опишите вашу проблему или вопрос, и мы поможем вам
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Тип обращения */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Тип обращения <span className="text-red-500">*</span>
          </label>
          <select
            value={formData.type}
            onChange={(e) => setFormData({ ...formData, type: e.target.value })}
            className="w-full rounded-lg border border-gray-300 bg-white px-4 py-2 text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
            required
          >
            <option value="">Выберите тип обращения</option>
            {TICKET_TYPES.map((type) => (
              <option key={type.value} value={type.value}>
                {type.label}
              </option>
            ))}
          </select>
        </div>

        {/* Важность */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Важность
          </label>
          <select
            value={formData.priority}
            onChange={(e) => setFormData({ ...formData, priority: e.target.value })}
            className="w-full rounded-lg border border-gray-300 bg-white px-4 py-2 text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
          >
            {PRIORITIES.map((priority) => (
              <option key={priority.value} value={priority.value}>
                {priority.label}
              </option>
            ))}
          </select>
        </div>

        {/* Заголовок */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Заголовок <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={formData.title}
            onChange={(e) => setFormData({ ...formData, title: e.target.value })}
            className="w-full rounded-lg border border-gray-300 bg-white px-4 py-2 text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
            placeholder="Краткое описание проблемы"
            required
          />
        </div>

        {/* Содержание */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Описание <span className="text-red-500">*</span>
          </label>
          <SimpleRichTextEditor
            value={formData.content}
            onChange={(value) => setFormData({ ...formData, content: value })}
            placeholder="Опишите вашу проблему или вопрос подробно..."
          />
        </div>

        {/* Файлы */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Прикрепленные файлы (опционально)
          </label>
          <input
            type="file"
            multiple
            onChange={handleFileChange}
            className="w-full rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
          />
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            Исполняемые файлы (.exe, .bat, .sh, .js и т.д.) не допускаются
          </p>

          {files.length > 0 && (
            <div className="mt-3 space-y-2">
              {files.map((file, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 dark:border-gray-700 dark:bg-gray-800"
                >
                  <div className="flex items-center gap-2">
                    <svg
                      className="h-5 w-5 text-gray-400"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                      />
                    </svg>
                    <span className="text-sm text-gray-700 dark:text-gray-300">
                      {file.name}
                    </span>
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      ({formatFileSize(file.size)})
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeFile(index)}
                    className="text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
                  >
                    <svg
                      className="h-5 w-5"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M6 18L18 6M6 6l12 12"
                      />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Кнопки */}
        <div className="flex gap-4">
          <button
            type="submit"
            disabled={isSubmitting}
            className="rounded-lg bg-blue-600 px-6 py-2 font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmitting ? "Создание..." : "Создать обращение"}
          </button>
          <button
            type="button"
            onClick={() => router.back()}
            className="rounded-lg border border-gray-300 bg-white px-6 py-2 font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
          >
            Отмена
          </button>
        </div>
      </form>
      {AlertComponent}
    </div>
  );
}

