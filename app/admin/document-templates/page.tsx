"use client";

import { useState, useEffect } from "react";
import dynamic from "next/dynamic";

// Динамический импорт TinyMCE редактора для уменьшения бандла
const DocumentTemplateEditor = dynamic(
  () => import("@/components/admin/DocumentTemplateEditor"),
  { 
    loading: () => (
      <div className="h-64 animate-pulse rounded-md border border-gray-300 bg-gray-200 dark:border-gray-600 dark:bg-gray-700" />
    ),
    ssr: false 
  }
);
import { alertSuccess, alertError, confirm } from "@/lib/alert";
import { TEMPLATE_VARIABLES_FOR_EDITOR } from "@/lib/document-templates/renderer";

// ИСПРАВЛЕНО: Убран импорт типа из @prisma/client, используем строковый литерал
type DocumentType = 
  | "MEMBERSHIP_APPLICATION" 
  | "CONTRIBUTION_APPLICATION" 
  | "MEMBERSHIP_REMOVAL_APPLICATION"
  | "MEMBERSHIP_TRANSFER_APPLICATION"
  | "AGENDA"
  | "PROTOCOL"
  | "RESOLUTION"
  | "PROTOCOL_EXTRACT"
  | "APPEAL"
  | "OTHER";

interface DocumentTemplate {
  id: string;
  name: string;
  description: string | null;
  type: DocumentType;
  htmlContent: string;
  cssStyles: string | null;
  isActive: boolean;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

const AVAILABLE_VARIABLES = TEMPLATE_VARIABLES_FOR_EDITOR;

export default function DocumentTemplatesPage() {
  const [templates, setTemplates] = useState<DocumentTemplate[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedTemplate, setSelectedTemplate] = useState<DocumentTemplate | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [editorMode, setEditorMode] = useState<"wysiwyg" | "html">("wysiwyg");
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [formData, setFormData] = useState<{
    name: string;
    description: string;
    type: DocumentType;
    htmlContent: string;
    cssStyles: string;
    isActive: boolean;
    isDefault: boolean;
  }>({
    name: "",
    description: "",
    type: "MEMBERSHIP_APPLICATION",
    htmlContent: "",
    cssStyles: "",
    isActive: true,
    isDefault: false,
  });

  useEffect(() => {
    loadTemplates();
  }, []);

  const loadTemplates = async () => {
    try {
      setIsLoading(true);
      const response = await fetch("/api/admin/document-templates");
      console.log("[DocumentTemplates] Response status:", response.status);
      if (response.ok) {
        const data = await response.json();
        console.log("[DocumentTemplates] Loaded templates:", data.templates?.length || 0);
        setTemplates(data.templates || []);
      } else {
        const errorData = await response.json().catch(() => ({}));
        console.error("[DocumentTemplates] Error loading templates:", response.status, errorData);
        alert(`Ошибка загрузки шаблонов: ${errorData.error || response.statusText}`);
      }
    } catch (error) {
      console.error("[DocumentTemplates] Exception loading templates:", error);
      alert("Ошибка при загрузке шаблонов. Проверьте консоль.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreate = () => {
    setIsCreating(true);
    setIsEditing(false);
    setSelectedTemplate(null);
    setFormData({
      name: "",
      description: "",
      type: "MEMBERSHIP_APPLICATION",
      htmlContent: "",
      cssStyles: "",
      isActive: true,
      isDefault: false,
    });
  };

  const handleEdit = (template: DocumentTemplate) => {
    setSelectedTemplate(template);
    setIsEditing(true);
    setIsCreating(false);
    setFormData({
      name: template.name,
      description: template.description || "",
      type: template.type,
      htmlContent: template.htmlContent,
      cssStyles: template.cssStyles || "",
      isActive: template.isActive,
      isDefault: template.isDefault,
    });
  };

  const handleSave = async () => {
    try {
      const url = isCreating
        ? "/api/admin/document-templates"
        : `/api/admin/document-templates/${selectedTemplate?.id}`;
      
      const method = isCreating ? "POST" : "PUT";
      
      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      if (response.ok) {
        await loadTemplates();
        setIsEditing(false);
        setIsCreating(false);
        setSelectedTemplate(null);
        alertSuccess("Шаблон успешно сохранен!");
      } else {
        const error = await response.json();
        alertError(error.error || "Ошибка при сохранении шаблона");
      }
    } catch (error) {
      console.error("Ошибка сохранения:", error);
      alertError("Ошибка при сохранении шаблона");
    }
  };

  const handleDelete = async (id: string) => {
    const confirmed = await confirm("Вы уверены, что хотите удалить этот шаблон?", "Подтвердите удаление");
    if (!confirmed) return;

    try {
      const response = await fetch(`/api/admin/document-templates/${id}`, {
        method: "DELETE",
      });

      if (response.ok) {
        await loadTemplates();
        if (selectedTemplate?.id === id) {
          setSelectedTemplate(null);
          setIsEditing(false);
        }
        alertSuccess("Шаблон удален!");
      } else {
        const error = await response.json();
        alertError(error.error || "Ошибка при удалении шаблона");
      }
    } catch (error) {
      console.error("Ошибка удаления:", error);
      alertError("Ошибка при удалении шаблона");
    }
  };

  const handleRegenerateAll = async () => {
    const confirmed = await confirm(
      "Вы уверены, что хотите перегенерировать все документы всех пользователей? Это может занять некоторое время.",
      "Подтвердите перегенерацию"
    );
    if (!confirmed) {
      return;
    }

    try {
      setIsRegenerating(true);
      const response = await fetch("/api/admin/document-templates/regenerate-all", {
        method: "POST",
      });

      const data = await response.json();

      if (response.ok) {
        alert(
          `Перегенерация завершена!\n\n` +
          `Обработано пользователей: ${data.stats.usersProcessed}\n` +
          `Перегенерировано документов: ${data.stats.documentsRegenerated}\n` +
          `Ошибок: ${data.stats.errors}`
        );
        if (data.errors && data.errors.length > 0) {
          console.error("Ошибки при перегенерации:", data.errors);
        }
      } else {
        alert(`Ошибка: ${data.error || "Не удалось перегенерировать документы"}`);
      }
    } catch (error) {
      console.error("Ошибка перегенерации:", error);
      alert("Ошибка при перегенерации документов. Проверьте консоль.");
    } finally {
      setIsRegenerating(false);
    }
  };


  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <div className="mb-4 inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-blue-500 border-r-transparent"></div>
          <p className="text-gray-600 dark:text-gray-400">Загрузка шаблонов...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
            Конструктор документов
          </h1>
          <p className="mt-2 text-gray-600 dark:text-gray-400">
            Создавайте и редактируйте шаблоны документов с переменными
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleRegenerateAll}
            disabled={isRegenerating}
            className="rounded-lg bg-green-600 px-4 py-2 text-white hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            title="Перегенерировать все документы всех пользователей из текущих шаблонов"
          >
            {isRegenerating ? (
              <>
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"></div>
                Перегенерация...
              </>
            ) : (
              <>
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Перегенерировать все документы
              </>
            )}
          </button>
          <button
            onClick={handleCreate}
            className="rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
          >
            + Создать шаблон
          </button>
        </div>
      </div>

      {(isEditing || isCreating) && (
        <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
          <h2 className="mb-4 text-xl font-semibold">
            {isCreating ? "Создание шаблона" : "Редактирование шаблона"}
          </h2>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Название
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 dark:border-gray-600 dark:bg-gray-700"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Описание
              </label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 dark:border-gray-600 dark:bg-gray-700"
                rows={2}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Тип документа
              </label>
              <select
                value={formData.type}
                onChange={(e) => setFormData({ ...formData, type: e.target.value as DocumentType })}
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 dark:border-gray-600 dark:bg-gray-700"
              >
                <optgroup label="Заявления">
                  <option value="MEMBERSHIP_APPLICATION">
                    Заявление о вступлении
                  </option>
                  <option value="CONTRIBUTION_APPLICATION">
                    Заявление о взносах
                  </option>
                  <option value="MEMBERSHIP_REMOVAL_APPLICATION">
                    Заявление о снятии с учета
                  </option>
                  <option value="MEMBERSHIP_TRANSFER_APPLICATION">
                    Заявление о переходе в другой профсоюз
                  </option>
                </optgroup>
                <optgroup label="Документы профкома">
                  <option value="AGENDA">
                    Повестка дня заседания профкома
                  </option>
                  <option value="PROTOCOL">
                    Протокол заседания профкома
                  </option>
                  <option value="RESOLUTION">
                    Постановление профсоюзного комитета
                  </option>
                  <option value="PROTOCOL_EXTRACT">
                    Выписка из протокола
                  </option>
                </optgroup>
                <optgroup label="Прочее">
                  <option value="APPEAL">Обращение</option>
                  <option value="OTHER">Прочее</option>
                </optgroup>
              </select>
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  HTML содержимое (используйте переменные вида {"{{variableName}}"})
                </label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setEditorMode("wysiwyg")}
                    className={`rounded px-3 py-1 text-xs ${
                      editorMode === "wysiwyg"
                        ? "bg-blue-600 text-white"
                        : "bg-gray-200 text-gray-700 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
                    }`}
                  >
                    WYSIWYG
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditorMode("html")}
                    className={`rounded px-3 py-1 text-xs ${
                      editorMode === "html"
                        ? "bg-blue-600 text-white"
                        : "bg-gray-200 text-gray-700 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
                    }`}
                  >
                    HTML
                  </button>
                </div>
              </div>
              {editorMode === "wysiwyg" ? (
                <DocumentTemplateEditor
                  value={formData.htmlContent}
                  onChange={(html) => setFormData({ ...formData, htmlContent: html })}
                  availableVariables={AVAILABLE_VARIABLES.map((v) => ({ key: String(v.key), label: v.label }))}
                  placeholder="Введите содержимое документа..."
                />
              ) : (
                <div className="space-y-2">
                  <div className="flex flex-wrap gap-2 rounded-md border border-gray-300 bg-gray-50 p-2 dark:border-gray-600 dark:bg-gray-800">
                    <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
                      Переменные:
                    </span>
                    {AVAILABLE_VARIABLES.map((variable) => (
                      <button
                        key={variable.key}
                        type="button"
                        onClick={() => {
                          const textarea = document.getElementById("htmlContent") as HTMLTextAreaElement;
                          if (textarea) {
                            const start = textarea.selectionStart;
                            const end = textarea.selectionEnd;
                            const text = textarea.value;
                            const before = text.substring(0, start);
                            const after = text.substring(end, text.length);
                            const variableText = `{{${variable.key}}}`;
                            textarea.value = before + variableText + after;
                            textarea.selectionStart = textarea.selectionEnd = start + variableText.length;
                            textarea.focus();
                            setFormData({ ...formData, htmlContent: textarea.value });
                          }
                        }}
                        className="rounded bg-gray-100 px-2 py-1 text-xs hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600"
                        title={variable.label}
                      >
                        {variable.label}
                      </button>
                    ))}
                  </div>
                  <textarea
                    id="htmlContent"
                    value={formData.htmlContent}
                    onChange={(e) => setFormData({ ...formData, htmlContent: e.target.value })}
                    className="block w-full rounded-md border border-gray-300 px-3 py-2 font-mono text-sm dark:border-gray-600 dark:bg-gray-700"
                    rows={15}
                  />
                </div>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                CSS стили (опционально)
              </label>
              <textarea
                value={formData.cssStyles}
                onChange={(e) => setFormData({ ...formData, cssStyles: e.target.value })}
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 font-mono text-sm dark:border-gray-600 dark:bg-gray-700"
                rows={8}
              />
            </div>

            <div className="flex items-center gap-4">
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={formData.isActive}
                  onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                  className="mr-2"
                />
                <span className="text-sm text-gray-700 dark:text-gray-300">Активен</span>
              </label>
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={formData.isDefault}
                  onChange={(e) => setFormData({ ...formData, isDefault: e.target.checked })}
                  className="mr-2"
                />
                <span className="text-sm text-gray-700 dark:text-gray-300">По умолчанию</span>
              </label>
            </div>

            <div className="flex gap-2">
              <button
                onClick={handleSave}
                className="rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
              >
                Сохранить
              </button>
              <button
                onClick={() => {
                  setIsEditing(false);
                  setIsCreating(false);
                  setSelectedTemplate(null);
                }}
                className="rounded-lg border border-gray-300 px-4 py-2 hover:bg-gray-50 dark:border-gray-600 dark:hover:bg-gray-700"
              >
                Отмена
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="grid gap-4">
        {templates.map((template) => (
          <div
            key={template.id}
            className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800"
          >
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <h3 className="text-lg font-semibold">{template.name}</h3>
                  {template.isDefault && (
                    <span className="rounded bg-green-100 px-2 py-1 text-xs text-green-800 dark:bg-green-900 dark:text-green-200">
                      По умолчанию
                    </span>
                  )}
                  {!template.isActive && (
                    <span className="rounded bg-gray-100 px-2 py-1 text-xs text-gray-800 dark:bg-gray-700 dark:text-gray-200">
                      Неактивен
                    </span>
                  )}
                </div>
                <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                  {template.description || "Без описания"}
                </p>
                <p className="mt-1 text-xs text-gray-500">
                  Тип: {template.type} | Обновлен: {new Date(template.updatedAt).toLocaleDateString()}
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => handleEdit(template)}
                  className="rounded bg-blue-600 px-3 py-1 text-sm text-white hover:bg-blue-700"
                >
                  Редактировать
                </button>
                <button
                  onClick={() => handleDelete(template.id)}
                  className="rounded bg-red-600 px-3 py-1 text-sm text-white hover:bg-red-700"
                >
                  Удалить
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {templates.length === 0 && !isCreating && (
        <div className="rounded-lg border-2 border-dashed border-gray-300 bg-white p-8 text-center dark:border-gray-700 dark:bg-gray-800">
          <p className="text-gray-600 dark:text-gray-400">
            Шаблонов пока нет. Создайте первый шаблон.
          </p>
        </div>
      )}
    </div>
  );
}

