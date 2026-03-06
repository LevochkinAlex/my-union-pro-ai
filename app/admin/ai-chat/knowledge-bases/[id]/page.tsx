"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import Button from "@/components/ui/button/Button";
import InputField from "@/components/ui/InputField";
import TextArea from "@/components/ui/TextArea";
import Label from "@/components/form/Label";
import { FileText, Link2 } from "lucide-react";
// ИСПРАВЛЕНО: Убран импорт типа из @prisma/client, используем локальные типы
type JsonValue = string | number | boolean | null | JsonObject | JsonArray;
type JsonObject = { [key: string]: JsonValue };
type JsonArray = JsonValue[];

function isJsonObject(value: JsonValue | null): value is JsonObject {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

type KnowledgeDocumentData = {
  id: string;
  fileName: string | null;
  originalName: string;
  fileType: string | null;
  fileSize: number | null;
  filePath: string | null;
  processingStatus: "UPLOADED" | "QUEUED" | "PROCESSING" | "COMPLETED" | "FAILED";
  createdAt: string;
  processedAt: string | null;
  meta: Record<string, unknown> | null;
};

type KnowledgeBaseData = {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
  documents: KnowledgeDocumentData[];
  sources: Array<{
    id: string;
    type: string;
    status: string;
    metadata: JsonValue | null;
    lastFetchedAt: string | null;
    createdAt: string;
  }>;
  _count: {
    documents: number;
    sources: number;
    bots: number;
  };
};

type KnowledgeBasePageProps = {
  params: { id: string };
};

type KnowledgeBaseWithRelations = KnowledgeBaseData & {
  _count: { sources: number };
  stats: {
    queued: number;
    processing: number;
    completed: number;
    failed: number;
    lastProcessedAt: Date | null;
  };
};

export default function KnowledgeBaseDetailsPage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;

  const [kb, setKb] = useState<KnowledgeBaseWithRelations | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isActive, setIsActive] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Для добавления текста
  const [showTextForm, setShowTextForm] = useState(false);
  const [textTitle, setTextTitle] = useState("");
  const [textContent, setTextContent] = useState("");
  
  // Для добавления URL
  const [showUrlForm, setShowUrlForm] = useState(false);
  const [urlInput, setUrlInput] = useState("");
  const [urlTitle, setUrlTitle] = useState("");

  const loadKnowledgeBase = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const response = await fetch(`/api/admin/knowledge-bases/${id}`);
      if (!response.ok) {
        throw new Error("Не удалось загрузить базу знаний");
      }
      const data = await response.json();
      setKb(data.knowledgeBase);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Произошла ошибка");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadKnowledgeBase();
  }, [loadKnowledgeBase]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError("");

    try {
      const response = await fetch(`/api/admin/knowledge-bases/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, description, isActive }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Не удалось сохранить");
      }

      await loadKnowledgeBase();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Произошла ошибка");
    } finally {
      setSaving(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setSaving(true); // Changed from setUploading to setSaving
    setError("");

    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch(`/api/admin/knowledge-bases/${id}/documents`, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Не удалось загрузить файл");
      }

      await loadKnowledgeBase();
      e.target.value = ""; // Reset input
    } catch (err) {
      setError(err instanceof Error ? err.message : "Произошла ошибка");
    } finally {
      setSaving(false); // Changed from setUploading to setSaving
    }
  };

  const handleRetry = async (documentId: string) => {
    setSaving(true);
    setError("");
    try {
      const response = await fetch(`/api/admin/knowledge-documents/${documentId}/retry`, {
        method: "POST",
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || "Не удалось перезапустить обработку");
      }

      await loadKnowledgeBase();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Произошла ошибка");
    } finally {
      setSaving(false);
    }
  };
  
  const handleAddText = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!textTitle.trim() || !textContent.trim()) {
      setError("Название и текст обязательны");
      return;
    }
    
    setSaving(true);
    setError("");
    
    try {
      const response = await fetch(`/api/admin/knowledge-bases/${id}/text`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: textTitle, content: textContent }),
      });
      
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Не удалось добавить текст");
      }
      
      setTextTitle("");
      setTextContent("");
      setShowTextForm(false);
      await loadKnowledgeBase();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Произошла ошибка");
    } finally {
      setSaving(false);
    }
  };
  
  const handleAddUrl = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!urlInput.trim()) {
      setError("URL обязателен");
      return;
    }
    
    setSaving(true);
    setError("");
    
    try {
      const response = await fetch(`/api/admin/knowledge-bases/${id}/url`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: urlInput, title: urlTitle || undefined }),
      });
      
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Не удалось добавить URL");
      }
      
      setUrlInput("");
      setUrlTitle("");
      setShowUrlForm(false);
      await loadKnowledgeBase();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Произошла ошибка");
    } finally {
      setSaving(false);
    }
  };

  const formatStatus = (doc: KnowledgeDocumentData) => {
    switch (doc.processingStatus) {
      case "COMPLETED":
        return { label: "Обработан", className: "text-green-600 dark:text-green-400" };
      case "PROCESSING":
        return { label: "Обработка...", className: "text-yellow-600 dark:text-yellow-400" };
      case "QUEUED":
        return { label: "В очереди", className: "text-blue-600 dark:text-blue-400" };
      case "FAILED":
        return { label: "Ошибка", className: "text-red-600 dark:text-red-400" };
      default:
        return { label: "Ожидает", className: "text-gray-500 dark:text-gray-400" };
    }
  };

  const formatSize = (bytes: number | null) => {
    if (!bytes) return "0 KB";
    if (bytes < 1024 * 1024) {
      return `${(bytes / 1024).toFixed(1)} KB`;
    }
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  };

  const handleDelete = async () => {
    if (!confirm("Вы уверены, что хотите удалить эту базу знаний?")) return;

    try {
      const response = await fetch(`/api/admin/knowledge-bases/${id}`, {
        method: "DELETE",
      });

      if (!response.ok) throw new Error("Не удалось удалить");

      router.push("/admin/ai-chat");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Произошла ошибка");
    }
  };

  if (loading) {
    return (
      <div className="space-y-6 min-w-0 w-full">
        <p className="text-gray-600 dark:text-gray-400">Загрузка...</p>
      </div>
    );
  }

  if (!kb) {
    return (
      <div className="space-y-6 min-w-0 w-full">
        <p className="text-red-600 dark:text-red-400">База знаний не найдена</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 min-w-0 w-full">
      <div className="mb-6 flex items-center gap-4">
        <Link
          href="/admin/ai-chat"
          className="text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400"
        >
          ← Назад к базам знаний
        </Link>
      </div>

      <h1 className="mb-6 text-3xl font-bold text-gray-900 dark:text-white">
        {kb.name}
      </h1>

      {error && (
        <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-200">
          {error}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Форма редактирования */}
        <div className="rounded-lg bg-white p-6 shadow dark:bg-gray-800">
          <h2 className="mb-4 text-xl font-bold text-gray-900 dark:text-white">
            Настройки
          </h2>
          <form onSubmit={handleSave} className="space-y-4">
            <div>
              <Label htmlFor="name">Название</Label>
              <InputField
                id="name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>

            <div>
              <Label htmlFor="description">Описание</Label>
              <TextArea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={4}
              />
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="isActive"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                aria-label="База знаний активна"
              />
              <Label htmlFor="isActive" className="mb-0">
                Активна
              </Label>
            </div>

            <div className="flex gap-4">
              <Button type="submit" disabled={saving}>
                {saving ? "Сохранение..." : "Сохранить"}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={handleDelete}
                className="bg-red-500 text-white hover:bg-red-600 dark:bg-red-600 dark:hover:bg-red-700"
              >
                Удалить
              </Button>
            </div>
          </form>
        </div>

        {/* Документы */}
        <div className="rounded-lg bg-white p-6 shadow dark:bg-gray-800 lg:col-span-2">
          <h2 className="mb-4 text-xl font-bold text-gray-900 dark:text-white">
            Документы ({kb._count.documents})
          </h2>

          {/* Кнопки добавления */}
          <div className="mb-4 flex gap-2">
            <label className="flex-1">
              <span className="sr-only">Загрузить файл</span>
              <input
                type="file"
                accept=".pdf,.docx,.doc,.txt,.md,.csv,.xlsx,.xls,.json,.html,.htm,.ppt,.pptx"
                onChange={handleFileUpload}
                disabled={saving}
                className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 dark:file:bg-blue-900/20 dark:file:text-blue-300"
              />
            </label>
            <Button
              type="button"
              onClick={() => {
                setShowTextForm(!showTextForm);
                setShowUrlForm(false);
              }}
              variant="outline"
            >
              <span className="inline-flex items-center gap-1.5">
                <FileText className="h-4 w-4" />
                Добавить текст
              </span>
            </Button>
            <Button
              type="button"
              onClick={() => {
                setShowUrlForm(!showUrlForm);
                setShowTextForm(false);
              }}
              variant="outline"
            >
              <span className="inline-flex items-center gap-1.5">
                <Link2 className="h-4 w-4" />
                Добавить URL
              </span>
            </Button>
          </div>
          
          {/* Форма добавления текста */}
          {showTextForm && (
            <form onSubmit={handleAddText} className="mb-4 space-y-3 rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-900/50">
              <div>
                <Label htmlFor="text-title">Название</Label>
                <InputField
                  id="text-title"
                  type="text"
                  value={textTitle}
                  onChange={(e) => setTextTitle(e.target.value)}
                  placeholder="Например: Устав профсоюза"
                  required
                />
              </div>
              <div>
                <Label htmlFor="text-content">Текст</Label>
                <TextArea
                  id="text-content"
                  value={textContent}
                  onChange={(e) => setTextContent(e.target.value)}
                  placeholder="Вставьте текст документа..."
                  rows={8}
                  required
                />
              </div>
              <div className="flex gap-2">
                <Button type="submit" disabled={saving}>
                  {saving ? "Добавление..." : "Добавить"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setShowTextForm(false);
                    setTextTitle("");
                    setTextContent("");
                  }}
                >
                  Отмена
                </Button>
              </div>
            </form>
          )}
          
          {/* Форма добавления URL */}
          {showUrlForm && (
            <form onSubmit={handleAddUrl} className="mb-4 space-y-3 rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-900/50">
              <div>
                <Label htmlFor="url-title">Название (необязательно)</Label>
                <InputField
                  id="url-title"
                  type="text"
                  value={urlTitle}
                  onChange={(e) => setUrlTitle(e.target.value)}
                  placeholder="Например: Сайт профсоюза"
                />
              </div>
              <div>
                <Label htmlFor="url-input">URL</Label>
                <InputField
                  id="url-input"
                  type="url"
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                  placeholder="https://example.com"
                  required
                />
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  Контент будет автоматически извлечен из URL
                </p>
              </div>
              <div className="flex gap-2">
                <Button type="submit" disabled={saving}>
                  {saving ? "Добавление..." : "Добавить"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setShowUrlForm(false);
                    setUrlInput("");
                    setUrlTitle("");
                  }}
                >
                  Отмена
                </Button>
              </div>
            </form>
          )}
          
          {saving && (
            <p className="mb-4 text-sm text-gray-600 dark:text-gray-400">
              Обработка...
            </p>
          )}

          <div className="space-y-2 max-h-96 overflow-y-auto">
            {kb.documents.length === 0 ? (
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Документы не загружены
              </p>
            ) : (
              kb.documents.map((doc) => {
                const meta = (doc.meta ?? {}) as {
                  error?: string;
                  chunkCount?: number;
                  textLength?: number;
                };
                const status = formatStatus(doc);
                return (
                  <div
                    key={doc.id}
                    className="flex items-start justify-between gap-3 rounded-lg border border-gray-200 p-4 dark:border-gray-700"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">
                        {doc.originalName}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 space-x-1">
                        {doc.fileType && (
                          <span>{doc.fileType.toUpperCase()}</span>
                        )}
                        <span>•</span>
                        <span>{formatSize(doc.fileSize)}</span>
                        <span>•</span>
                        <span className={status.className}>{status.label}</span>
                        {doc.processedAt && (
                          <>
                            <span>•</span>
                            <span>
                              Обновлено {new Date(doc.processedAt).toLocaleString("ru-RU")}
                            </span>
                          </>
                        )}
                      </p>
                      {meta.error && (
                        <p className="mt-1 text-xs text-red-500 dark:text-red-400">
                          Ошибка: {meta.error}
                        </p>
                      )}
                      {meta.chunkCount !== undefined && (
                        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                          Фрагментов: {meta.chunkCount}; символов: {meta.textLength ?? "—"}
                        </p>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      {doc.filePath && (
                        <a
                          href={doc.filePath}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-blue-600 hover:text-blue-700 dark:text-blue-400"
                        >
                          Скачать
                        </a>
                      )}
                      {doc.processingStatus === "FAILED" && (
                        <Button
                          type="button"
                          size="sm"
                          disabled={saving}
                          onClick={() => handleRetry(doc.id)}
                          className="text-xs"
                        >
                          {saving ? "Повтор..." : "Повторить"}
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

