"use client";

import { useState } from "react";
import { useToast } from "@/components/ui/Toast";

interface ImageInsertModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUpload: (file: File) => void;
  onGenerate: (imageUrl: string) => void;
  generating?: boolean;
}

export default function ImageInsertModal({
  isOpen,
  onClose,
  onUpload,
  onGenerate,
  generating = false,
}: ImageInsertModalProps) {
  const { showToast } = useToast();
  const [imagePrompt, setImagePrompt] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationProgress, setGenerationProgress] = useState(0);
  const [generatedImageUrl, setGeneratedImageUrl] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && file.type.startsWith("image/")) {
      setSelectedFile(file);
      const url = URL.createObjectURL(file);
      setPreviewUrl(url);
    }
  };

  const handleUpload = async () => {
    if (selectedFile) {
      try {
        await onUpload(selectedFile);
        // Не закрываем модалку здесь - пусть родительский компонент решает
        // handleClose() будет вызван в родительском компоненте после успешной загрузки
      } catch (error) {
        console.error("Error in handleUpload:", error);
        // Ошибка уже обработана в родительском компоненте
      }
    }
  };

  const handleGenerate = async () => {
    if (!imagePrompt.trim()) {
      showToast("Введите описание изображения", "warning");
      return;
    }

    setIsGenerating(true);
    setGenerationProgress(0);
    setGeneratedImageUrl(null);

    try {
      // Запускаем генерацию
      const response = await fetch("/api/ai/generate-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: imagePrompt }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || "Ошибка при генерации изображения");
      }

      const data = await response.json();
      const taskId = data.taskId;

      // Опрашиваем статус задачи
      let attempts = 0;
      const maxAttempts = 60; // 5 минут максимум
      const startTime = Date.now();
      const estimatedTime = 30000; // Примерно 30 секунд

      const checkStatus = async (): Promise<string> => {
        const statusResponse = await fetch(`/api/ai/generate-image?taskId=${taskId}`);
        if (!statusResponse.ok) {
          throw new Error("Ошибка при проверке статуса");
        }

        const statusData = await statusResponse.json();
        const task = statusData.task;

        // Обновляем прогресс
        const elapsed = Date.now() - startTime;
        const progress = Math.min(90, Math.floor((elapsed / estimatedTime) * 100));
        setGenerationProgress(progress);

        if (task.status === "completed" && task.result?.imageUrl) {
          setGenerationProgress(100);
          setGeneratedImageUrl(task.result.imageUrl);
          return task.result.imageUrl;
        } else if (task.status === "failed") {
          throw new Error(task.error || "Генерация изображения не удалась");
        } else if (attempts >= maxAttempts) {
          throw new Error("Превышено время ожидания генерации");
        }

        attempts++;
        await new Promise((resolve) => setTimeout(resolve, 5000)); // Ждем 5 секунд
        return checkStatus();
      };

      const imageUrl = await checkStatus();
      setIsGenerating(false);
      // Не закрываем модалку сразу, показываем превью
    } catch (error: any) {
      console.error("Error generating image:", error);
      showToast(error.message || "Ошибка при генерации изображения", "error");
      setIsGenerating(false);
      setGenerationProgress(0);
    }
  };

  const handleInsertGenerated = () => {
    if (generatedImageUrl) {
      onGenerate(generatedImageUrl);
      handleClose();
    }
  };

  const handleClose = () => {
    setImagePrompt("");
    setSelectedFile(null);
    setIsGenerating(false);
    setGenerationProgress(0);
    setGeneratedImageUrl(null);
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    }
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 dark:bg-black/70 backdrop-blur-md"
      onClick={handleClose}
    >
      <div
        className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-md"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
              Добавить изображение
            </h3>
            <button
              type="button"
              onClick={handleClose}
              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>

          <div className="space-y-4">
            {/* Загрузка файла */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Загрузить изображение
              </label>
              <input
                type="file"
                accept="image/*"
                onChange={handleFileSelect}
                className="block w-full text-sm text-gray-500 dark:text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 dark:file:bg-blue-900/20 dark:file:text-blue-400"
              />
              {previewUrl && (
                <div className="mt-3 relative">
                  <img
                    src={previewUrl}
                    alt="Preview"
                    className="w-full max-h-48 object-contain rounded-lg border border-gray-200 dark:border-gray-700"
                  />
                  <button
                    type="button"
                    onClick={handleUpload}
                    className="mt-2 w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    Вставить изображение
                  </button>
                </div>
              )}
            </div>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-300 dark:border-gray-600"></div>
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-2 bg-white dark:bg-gray-800 text-gray-500 dark:text-gray-400">
                  или
                </span>
              </div>
            </div>

            {/* Генерация через AI */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Сгенерировать с помощью AI
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={imagePrompt}
                  onChange={(e) => setImagePrompt(e.target.value)}
                  placeholder="Опишите изображение..."
                  className="flex-1 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500/20"
                  onKeyPress={(e) => {
                    if (e.key === "Enter" && !e.shiftKey && !isGenerating) {
                      e.preventDefault();
                      handleGenerate();
                    }
                  }}
                  disabled={isGenerating}
                />
                <button
                  type="button"
                  onClick={handleGenerate}
                  disabled={isGenerating || !imagePrompt.trim()}
                  className="px-4 py-2 text-sm font-medium text-white bg-purple-600 rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isGenerating ? "Генерация..." : "Сгенерировать"}
                </button>
              </div>

              {/* Прогресс генерации */}
              {isGenerating && (
                <div className="mt-3 space-y-2">
                  <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                    <div
                      className="bg-purple-600 h-2 rounded-full transition-all duration-300"
                      style={{ width: `${generationProgress}%` }}
                    ></div>
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 text-center">
                    Генерация изображения... {generationProgress}%
                  </p>
                </div>
              )}

              {/* Превью сгенерированного изображения */}
              {generatedImageUrl && (
                <div className="mt-3 space-y-2">
                  <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    Изображение готово:
                  </p>
                  <div className="relative">
                    <img
                      src={generatedImageUrl}
                      alt="Сгенерированное изображение"
                      className="w-full max-h-64 object-contain rounded-lg border border-gray-200 dark:border-gray-700"
                    />
                    <div className="mt-2 flex gap-2">
                      <button
                        type="button"
                        onClick={handleInsertGenerated}
                        className="flex-1 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
                      >
                        Вставить изображение
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setGeneratedImageUrl(null);
                          setIsGenerating(false);
                          setGenerationProgress(0);
                        }}
                        className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                      >
                        Отмена
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

