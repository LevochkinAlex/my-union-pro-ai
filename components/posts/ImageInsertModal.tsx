"use client";

import { useState, useCallback } from "react";
import { useToast } from "@/components/ui/Toast";
import Cropper from "react-easy-crop";
import type { Area } from "react-easy-crop";

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
  const [isConverting, setIsConverting] = useState(false);

  // Cropper state
  const [showCropper, setShowCropper] = useState(false);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [aspectRatio, setAspectRatio] = useState<number>(16 / 9);
  const [uploading, setUploading] = useState(false);

  const aspectRatioPresets = [
    { label: "16:9", value: 16 / 9 },
    { label: "4:3", value: 4 / 3 },
  ];

  if (!isOpen) return null;

  const onCropComplete = useCallback(
    (croppedArea: Area, croppedAreaPixels: Area) => {
      setCroppedAreaPixels(croppedAreaPixels);
    },
    []
  );

  const createImage = (url: string): Promise<HTMLImageElement> =>
    new Promise(async (resolve, reject) => {
      const image = new Image();
      image.addEventListener("load", () => resolve(image));
      image.addEventListener("error", (error) => reject(error));
      
      // Для внешних URL загружаем через fetch чтобы избежать CORS
      if (url.startsWith("http") && !url.startsWith(window.location.origin)) {
        try {
          // Пробуем загрузить через прокси
          const proxyUrl = `/api/proxy-image?url=${encodeURIComponent(url)}`;
          const response = await fetch(proxyUrl);
          if (response.ok) {
            const blob = await response.blob();
            image.src = URL.createObjectURL(blob);
            return;
          }
        } catch (e) {
          console.warn("Proxy fetch failed, trying direct with CORS");
        }
        // Fallback: попробуем с crossOrigin
        image.crossOrigin = "anonymous";
      }
      
      image.src = url;
    });

  const getCroppedImg = async (
    imageSrc: string,
    pixelCrop: Area
  ): Promise<Blob> => {
    const image = await createImage(imageSrc);
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");

    if (!ctx) {
      throw new Error("No 2d context");
    }

    canvas.width = pixelCrop.width;
    canvas.height = pixelCrop.height;

    ctx.drawImage(
      image,
      pixelCrop.x,
      pixelCrop.y,
      pixelCrop.width,
      pixelCrop.height,
      0,
      0,
      pixelCrop.width,
      pixelCrop.height
    );

    return new Promise((resolve) => {
      canvas.toBlob((blob) => {
        if (blob) {
          resolve(blob);
        }
      }, "image/jpeg", 0.95);
    });
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      showToast("Выберите файл изображения", "warning");
      return;
    }

    // Проверяем, является ли файл HEIC/HEIF
    const isHeic = file.type === "image/heic" || 
                   file.type === "image/heif" || 
                   file.name.toLowerCase().endsWith(".heic") ||
                   file.name.toLowerCase().endsWith(".heif");

    if (isHeic) {
      setIsConverting(true);
      try {
        const heic2anyModule = await import("heic2any");
        const heic2any = (heic2anyModule.default || heic2anyModule) as (params: { blob: Blob; toType: string; quality?: number }) => Promise<Blob | Blob[]>;
        const convertedBlob = await heic2any({
          blob: file,
          toType: "image/jpeg",
          quality: 0.8,
        });
        
        const blob = Array.isArray(convertedBlob) ? convertedBlob[0] : convertedBlob;
        const jpegFile = new File([blob as Blob], file.name.replace(/\.(heic|heif)$/i, ".jpg"), {
          type: "image/jpeg",
          lastModified: file.lastModified,
        });
        
        setSelectedFile(jpegFile);
        const url = URL.createObjectURL(blob as Blob);
        setPreviewUrl(url);
        setShowCropper(true);
        setIsConverting(false);
      } catch (error) {
        console.error("Error converting HEIC:", error);
        showToast("Ошибка при конвертации HEIC изображения", "error");
        setIsConverting(false);
      }
    } else {
      setSelectedFile(file);
      const url = URL.createObjectURL(file);
      setPreviewUrl(url);
      setShowCropper(true);
    }
  };

  const handleUpload = async () => {
    if (!previewUrl || !croppedAreaPixels) return;

    try {
      setUploading(true);
      const croppedImageBlob = await getCroppedImg(previewUrl, croppedAreaPixels);
      
      // Создаем File из обрезанного Blob
      const croppedFile = new File(
        [croppedImageBlob],
        selectedFile?.name || "cover.jpg",
        {
          type: "image/jpeg",
          lastModified: Date.now(),
        }
      );

      await onUpload(croppedFile);
      handleClose();
    } catch (error) {
      console.error("Error in handleUpload:", error);
      showToast("Ошибка при обработке изображения", "error");
    } finally {
      setUploading(false);
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
      // Показываем сгенерированное изображение в кропере
      setPreviewUrl(imageUrl);
      setShowCropper(true);
      setGeneratedImageUrl(null);
    } catch (error: any) {
      console.error("Error generating image:", error);
      showToast(error.message || "Ошибка при генерации изображения", "error");
      setIsGenerating(false);
      setGenerationProgress(0);
    }
  };

  const handleCancelCrop = () => {
    setShowCropper(false);
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }
    setPreviewUrl(null);
    setSelectedFile(null);
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setCroppedAreaPixels(null);
  };

  const handleClose = () => {
    setImagePrompt("");
    setSelectedFile(null);
    setIsGenerating(false);
    setGenerationProgress(0);
    setGeneratedImageUrl(null);
    setShowCropper(false);
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setCroppedAreaPixels(null);
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
        className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
              {showCropper ? "Обрезать изображение" : "Добавить изображение"}
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

          {!showCropper ? (
            <div className="space-y-4">
            {/* Загрузка файла */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Загрузить изображение
              </label>
              <input
                type="file"
                accept="image/*,.heic,.heif"
                onChange={handleFileSelect}
                className="block w-full text-sm text-gray-500 dark:text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 dark:file:bg-blue-900/20 dark:file:text-blue-400"
                disabled={isConverting}
              />
              {isConverting && (
                <div className="mt-3 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                  <p className="text-sm text-blue-700 dark:text-blue-300 text-center">
                    Конвертация HEIC изображения...
                  </p>
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

            </div>
          </div>
          ) : (
            /* Cropper Interface */
            <div className="space-y-4">
              <div className="relative w-full h-96 bg-gray-900 rounded-lg overflow-hidden">
                <Cropper
                  image={previewUrl || ""}
                  crop={crop}
                  zoom={zoom}
                  aspect={aspectRatio}
                  onCropChange={setCrop}
                  onCropComplete={onCropComplete}
                  onZoomChange={setZoom}
                />
              </div>

              <div className="space-y-4">
                {/* Zoom control */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Масштаб
                  </label>
                  <input
                    type="range"
                    value={zoom}
                    min={1}
                    max={3}
                    step={0.1}
                    onChange={(e) => setZoom(Number(e.target.value))}
                    className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-gray-700"
                  />
                </div>

                {/* Aspect ratio presets */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Соотношение сторон
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {aspectRatioPresets.map((preset) => (
                      <button
                        key={preset.value}
                        type="button"
                        onClick={() => setAspectRatio(preset.value)}
                        className={`px-4 py-2 text-sm font-medium rounded-lg border transition ${
                          aspectRatio === preset.value
                            ? "bg-blue-600 text-white border-blue-600"
                            : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50 dark:bg-gray-700 dark:text-gray-200 dark:border-gray-600 dark:hover:bg-gray-600"
                        }`}
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Action buttons */}
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={handleCancelCrop}
                    className="flex-1 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 dark:bg-gray-700 dark:text-gray-200 dark:border-gray-600 dark:hover:bg-gray-600"
                  >
                    Назад
                  </button>
                  <button
                    type="button"
                    onClick={handleUpload}
                    disabled={uploading}
                    className="flex-1 px-4 py-2 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {uploading ? "Загрузка..." : "Вставить"}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

