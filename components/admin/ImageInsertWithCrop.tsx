"use client";

import { useState, useCallback, useRef } from "react";
import Cropper from "react-easy-crop";
import type { Area } from "react-easy-crop";

interface ImageInsertWithCropProps {
  onInsert: (imageUrl: string) => void;
  onClose: () => void;
  onGenerate?: (imageUrl: string) => void;
}

export default function ImageInsertWithCrop({
  onInsert,
  onClose,
  onGenerate,
}: ImageInsertWithCropProps) {
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [uploading, setUploading] = useState(false);
  const [generatingImage, setGeneratingImage] = useState(false);
  const [imagePrompt, setImagePrompt] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const aspectRatioPresets = [
    { label: "16:9 (широкий)", value: 16 / 9 },
    { label: "4:3 (стандартный)", value: 4 / 3 },
    { label: "1:1 (квадрат)", value: 1 },
    { label: "21:9 (ультраширокий)", value: 21 / 9 },
    { label: "3:2 (фото)", value: 3 / 2 },
    { label: "9:16 (вертикальный)", value: 9 / 16 },
    { label: "Свободное", value: 0 },
  ];
  const [aspectRatio, setAspectRatio] = useState<number>(16 / 9);

  const onCropComplete = useCallback(
    (croppedArea: Area, croppedAreaPixels: Area) => {
      setCroppedAreaPixels(croppedAreaPixels);
    },
    []
  );

  const onFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      const reader = new FileReader();
      reader.addEventListener("load", () => {
        setImageSrc(reader.result as string);
      });
      reader.readAsDataURL(file);
    }
  };

  const createImage = (url: string): Promise<HTMLImageElement> =>
    new Promise((resolve, reject) => {
      const image = new Image();
      image.addEventListener("load", () => resolve(image));
      image.addEventListener("error", (error) => reject(error));
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

  const handleSaveCrop = async () => {
    if (!imageSrc || !croppedAreaPixels) return;

    try {
      setUploading(true);
      const croppedImageBlob = await getCroppedImg(imageSrc, croppedAreaPixels);

      // Загружаем на сервер
      const formData = new FormData();
      formData.append("file", croppedImageBlob, "image.jpg");

      const response = await fetch("/api/posts/upload-image", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        throw new Error("Failed to upload image");
      }

      const data = await response.json();
      onInsert(data.url);
      onClose();
    } catch (error) {
      console.error("Error uploading image:", error);
      alert("Не удалось загрузить изображение");
    } finally {
      setUploading(false);
    }
  };

  const handleGenerate = async () => {
    if (!imagePrompt.trim() || !onGenerate) {
      alert("Введите описание изображения");
      return;
    }

    setGeneratingImage(true);
    try {
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

      let attempts = 0;
      const maxAttempts = 60;

      const checkStatus = async (): Promise<string> => {
        const statusResponse = await fetch(`/api/ai/generate-image?taskId=${taskId}`);
        if (!statusResponse.ok) {
          throw new Error("Ошибка при проверке статуса");
        }

        const statusData = await statusResponse.json();
        const task = statusData.task;

        if (task.status === "completed" && task.result?.imageUrl) {
          return task.result.imageUrl;
        } else if (task.status === "failed") {
          throw new Error(task.error || "Генерация изображения не удалась");
        } else if (attempts >= maxAttempts) {
          throw new Error("Превышено время ожидания генерации");
        }

        attempts++;
        await new Promise((resolve) => setTimeout(resolve, 5000));
        return checkStatus();
      };

      const imageUrl = await checkStatus();
      onGenerate(imageUrl);
      onClose();
    } catch (error: any) {
      console.error("Error generating image:", error);
      alert(error.message || "Ошибка при генерации изображения");
    } finally {
      setGeneratingImage(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 dark:bg-black/70 backdrop-blur-md"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
              Добавить изображение
            </h3>
            <button
              type="button"
              onClick={onClose}
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

          {!imageSrc ? (
            <div className="space-y-4">
              {/* Загрузка файла */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Загрузить изображение
                </label>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={onFileChange}
                  className="block w-full text-sm text-gray-500 dark:text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 dark:file:bg-blue-900/20 dark:file:text-blue-400"
                />
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
              {onGenerate && (
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
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          handleGenerate();
                        }
                      }}
                    />
                    <button
                      type="button"
                      onClick={handleGenerate}
                      disabled={generatingImage || !imagePrompt.trim()}
                      className="px-4 py-2 text-sm font-medium text-white bg-purple-600 rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {generatingImage ? "Генерация..." : "Сгенерировать"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <div className="relative w-full h-96 bg-gray-900 rounded-lg overflow-hidden">
                <Cropper
                  image={imageSrc}
                  crop={crop}
                  zoom={zoom}
                  aspect={aspectRatio || undefined}
                  onCropChange={setCrop}
                  onCropComplete={onCropComplete}
                  onZoomChange={setZoom}
                />
              </div>

              <div className="space-y-4">
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
                    className="w-full"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Соотношение сторон
                  </label>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {aspectRatioPresets.map((preset) => (
                      <button
                        key={preset.value}
                        type="button"
                        onClick={() => setAspectRatio(preset.value)}
                        className={`px-3 py-2 text-xs sm:text-sm font-medium rounded-lg border transition ${
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

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setImageSrc(null);
                      setCrop({ x: 0, y: 0 });
                      setZoom(1);
                      setCroppedAreaPixels(null);
                    }}
                    className="flex-1 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 dark:bg-gray-700 dark:text-gray-200 dark:border-gray-600 dark:hover:bg-gray-600"
                  >
                    Отмена
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveCrop}
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

