"use client";

import { useState, useEffect, useRef } from "react";
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

const IMAGE_TYPES = ["image/jpeg", "image/jpg", "image/png", "image/gif", "image/webp"];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

export default function NewTicketPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const { showAlert, AlertComponent } = useAlert();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isAiAssisting, setIsAiAssisting] = useState(false);
  const [formData, setFormData] = useState({
    type: "",
    priority: "MEDIUM",
    title: "",
    content: "",
  });
  const [files, setFiles] = useState<File[]>([]);
  // Храним blob URLs для освобождения памяти
  const filePreviewUrlsRef = useRef<Map<number, string>>(new Map());

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
        const isDangerous = dangerousExtensions.includes(extension);
        const isTooLarge = file.size > MAX_FILE_SIZE;
        
        if (isDangerous || isTooLarge) {
          return false;
        }
        return true;
      });

      if (safeFiles.length !== newFiles.length) {
        const rejectedCount = newFiles.length - safeFiles.length;
        showAlert({
          message: `Некоторые файлы были отклонены (${rejectedCount} файл${rejectedCount > 1 ? 'ов' : ''}): исполняемые скрипты запрещены или размер превышает 10 МБ`,
          type: "warning",
        });
      }

      setFiles((prev) => [...prev, ...safeFiles]);
    }
  };

  const handleAiAssist = async () => {
    if (!formData.title && !formData.content.trim()) {
      showAlert({
        message: "Введите заголовок или описание для помощи ИИ",
        type: "error",
      });
      return;
    }

    setIsAiAssisting(true);
    try {
      const prompt = formData.content.trim() 
        ? `Помоги улучшить и дополнить следующее обращение в профсоюз. Сделай текст более структурированным, профессиональным и понятным. Сохрани HTML разметку если она есть.\n\nЗаголовок: ${formData.title}\n\nОписание: ${formData.content}`
        : `Помоги составить обращение в профсоюз на тему: "${formData.title}". Сделай текст структурированным, профессиональным и понятным.`;

      const response = await fetch("/api/ai/improve-text", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: prompt }),
      });

      if (!response.ok) {
        throw new Error("Ошибка при обращении к ИИ");
      }

      const data = await response.json();
      
      if (data.improvedText) {
        setFormData((prev) => ({
          ...prev,
          content: data.improvedText,
        }));
        showAlert({
          message: "ИИ помог улучшить текст обращения",
          type: "success",
        });
      }
    } catch (error) {
      console.error("Error with AI assist:", error);
      showAlert({
        message: error instanceof Error ? error.message : "Ошибка при обращении к ИИ",
        type: "error",
      });
    } finally {
      setIsAiAssisting(false);
    }
  };

  const removeFile = (index: number) => {
    // Освобождаем blob URL перед удалением файла
    const blobUrl = filePreviewUrlsRef.current.get(index);
    if (blobUrl) {
      URL.revokeObjectURL(blobUrl);
      filePreviewUrlsRef.current.delete(index);
    }
    
    // Обновляем индексы в Map после удаления
    const newMap = new Map<number, string>();
    filePreviewUrlsRef.current.forEach((url, oldIndex) => {
      if (oldIndex < index) {
        newMap.set(oldIndex, url);
      } else if (oldIndex > index) {
        newMap.set(oldIndex - 1, url);
      }
    });
    filePreviewUrlsRef.current = newMap;
    
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + " Б";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " КБ";
    return (bytes / (1024 * 1024)).toFixed(1) + " МБ";
  };

  const isImage = (file: File) => {
    return IMAGE_TYPES.includes(file.type);
  };

  const getFilePreview = (file: File, index: number) => {
    if (!isImage(file)) {
      return null;
    }
    
    // Проверяем, есть ли уже blob URL для этого индекса
    if (filePreviewUrlsRef.current.has(index)) {
      return filePreviewUrlsRef.current.get(index)!;
    }
    
    // Создаем новый blob URL и сохраняем его
    const blobUrl = URL.createObjectURL(file);
    filePreviewUrlsRef.current.set(index, blobUrl);
    return blobUrl;
  };

  // Освобождаем все blob URLs при размонтировании компонента
  useEffect(() => {
    return () => {
      filePreviewUrlsRef.current.forEach((url) => {
        URL.revokeObjectURL(url);
      });
      filePreviewUrlsRef.current.clear();
    };
  }, []);

  return (
    <div className="w-full max-w-2xl lg:max-w-3xl mx-auto space-y-4 sm:space-y-6">
      {/* Back Button */}
      <button
        onClick={() => router.back()}
        className="mb-2 flex items-center gap-2 text-sm sm:text-base text-gray-600 transition hover:text-gray-900 dark:text-gray-400 dark:hover:text-white"
      >
        <svg className="h-4 w-4 sm:h-5 sm:w-5" viewBox="0 0 20 20" fill="currentColor">
          <path
            fillRule="evenodd"
            d="M9.707 16.707a1 1 0 01-1.414 0l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 1.414L5.414 9H17a1 1 0 110 2H5.414l4.293 4.293a1 1 0 010 1.414z"
            clipRule="evenodd"
          />
        </svg>
        <span>Назад</span>
      </button>

      <div>
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white">
          Создать обращение
        </h1>
        <p className="mt-2 text-sm sm:text-base text-gray-600 dark:text-gray-400">
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
          <div className="flex items-center justify-between mb-2">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Описание <span className="text-red-500">*</span>
            </label>
            <button
              type="button"
              onClick={handleAiAssist}
              disabled={isAiAssisting || !formData.title && !formData.content.trim()}
              className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed dark:text-blue-400 dark:bg-blue-900/20 dark:hover:bg-blue-900/30"
            >
              {isAiAssisting ? (
                <>
                  <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  ИИ работает...
                </>
              ) : (
                <>
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                  Помощь ИИ
                </>
              )}
            </button>
          </div>
          <SimpleRichTextEditor
            value={formData.content}
            onChange={(value) => setFormData({ ...formData, content: value })}
            placeholder="Опишите вашу проблему или вопрос подробно..."
          />
        </div>

        {/* Файлы и фото */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Прикрепленные файлы и фото (опционально)
          </label>
          <input
            type="file"
            multiple
            accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt"
            onChange={handleFileChange}
            className="w-full rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
          />
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            Можно прикрепить фото, документы (PDF, DOC, XLS) и текстовые файлы. Максимальный размер файла: 10 МБ. Исполняемые файлы (.exe, .bat, .sh, .js и т.д.) не допускаются.
          </p>

          {files.length > 0 && (
            <div className="mt-3 space-y-3">
              {files.map((file, index) => {
                const preview = getFilePreview(file, index);
                return (
                  <div
                    key={index}
                    className="rounded-lg border border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-800 overflow-hidden"
                  >
                    {preview ? (
                      <div className="relative">
                        <img
                          src={preview}
                          alt={file.name}
                          className="w-full h-48 object-cover"
                        />
                        <div className="absolute top-2 right-2 bg-black/50 rounded px-2 py-1 text-xs text-white">
                          {formatFileSize(file.size)}
                        </div>
                        <div className="p-3">
                          <p className="text-sm font-medium text-gray-700 dark:text-gray-300 truncate">
                            {file.name}
                          </p>
                          <button
                            type="button"
                            onClick={() => removeFile(index)}
                            className="mt-2 text-xs text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
                          >
                            Удалить фото
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between px-3 py-2">
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          <svg
                            className="h-5 w-5 text-gray-400 flex-shrink-0"
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
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-gray-700 dark:text-gray-300 truncate">
                              {file.name}
                            </p>
                            <p className="text-xs text-gray-500 dark:text-gray-400">
                              {formatFileSize(file.size)}
                            </p>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeFile(index)}
                          className="ml-2 text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 flex-shrink-0"
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
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Кнопки */}
        <div className="flex flex-col-reverse sm:flex-row gap-3 sm:gap-4">
          <button
            type="button"
            onClick={() => router.back()}
            className="w-full sm:w-auto rounded-lg border border-gray-300 bg-white px-4 sm:px-6 py-2.5 text-sm sm:text-base font-medium text-gray-700 hover-surface dark:border-gray-600 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
          >
            Отмена
          </button>
          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full sm:w-auto rounded-lg bg-blue-600 px-4 sm:px-6 py-2.5 text-sm sm:text-base font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmitting ? "Создание..." : "Создать обращение"}
          </button>
        </div>
      </form>
      {AlertComponent}
    </div>
  );
}

