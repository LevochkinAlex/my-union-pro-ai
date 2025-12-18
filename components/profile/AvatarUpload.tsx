"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import Cropper from "react-easy-crop";
import { Area } from "react-easy-crop";
import { Camera, X, Check, Upload, Pencil } from "lucide-react";
import { getFileUrl } from "@/lib/chat-utils";

interface AvatarUploadProps {
  currentAvatarUrl?: string | null;
  onSave: (croppedImageBlob: Blob) => Promise<void>;
  userName?: string; // Имя пользователя для плейсхолдера с инициалами
}

export default function AvatarUpload({ currentAvatarUrl, onSave, userName }: AvatarUploadProps) {
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [showCropper, setShowCropper] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [imageLoadError, setImageLoadError] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null); // Для временного отображения кропнутого изображения
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Сбрасываем ошибку загрузки при изменении currentAvatarUrl и очищаем превью
  useEffect(() => {
    // Всегда сбрасываем ошибку при изменении URL, чтобы новое изображение могло загрузиться
    setImageLoadError(false);
    
    // Когда обновляется currentAvatarUrl, очищаем временное превью
    if (currentAvatarUrl && previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    }
  }, [currentAvatarUrl]);
  
  // Очистка blob URL при размонтировании компонента
  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

  const onFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      
      // Validate file size
      if (file.size > MAX_FILE_SIZE) {
        setError(`Размер файла не должен превышать 10MB. Выбранный файл: ${(file.size / 1024 / 1024).toFixed(2)}MB`);
        if (fileInputRef.current) {
          fileInputRef.current.value = "";
        }
        return;
      }

      // Validate file type
      if (!file.type.startsWith("image/")) {
        setError("Файл должен быть изображением");
        if (fileInputRef.current) {
          fileInputRef.current.value = "";
        }
        return;
      }

      setError(null);
      const reader = new FileReader();
      reader.addEventListener("load", () => {
        setImageSrc(reader.result as string);
        setShowCropper(true);
      });
      reader.addEventListener("error", () => {
        setError("Ошибка при чтении файла");
      });
      reader.readAsDataURL(file);
    }
  }, []);

  const onCropComplete = useCallback((_croppedArea: Area, croppedAreaPixels: Area) => {
    setCroppedAreaPixels(croppedAreaPixels);
  }, []);

  const createCroppedImage = async (): Promise<Blob> => {
    if (!imageSrc || !croppedAreaPixels) {
      throw new Error("No image or crop area");
    }

    const image = await createImage(imageSrc);
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");

    if (!ctx) {
      throw new Error("No 2d context");
    }

    // Set canvas size to match the cropped area
    canvas.width = croppedAreaPixels.width;
    canvas.height = croppedAreaPixels.height;

    // Draw the cropped image
    ctx.drawImage(
      image,
      croppedAreaPixels.x,
      croppedAreaPixels.y,
      croppedAreaPixels.width,
      croppedAreaPixels.height,
      0,
      0,
      croppedAreaPixels.width,
      croppedAreaPixels.height
    );

    // Convert canvas to blob
    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (!blob) {
          reject(new Error("Canvas is empty"));
          return;
        }
        resolve(blob);
      }, "image/jpeg", 0.95);
    });
  };

  const handleSave = async () => {
    try {
      setIsUploading(true);
      const croppedImageBlob = await createCroppedImage();
      
      // Создаем временный blob URL для немедленного отображения
      const blobUrl = URL.createObjectURL(croppedImageBlob);
      setPreviewUrl(blobUrl);
      setImageLoadError(false);
      
      // Закрываем кроппер сразу, чтобы показать превью
      setShowCropper(false);
      setImageSrc(null);
      
      try {
        await onSave(croppedImageBlob);
        setError(null);
        // Превью останется до тех пор, пока не обновится currentAvatarUrl из пропсов
        // Когда currentAvatarUrl обновится, previewUrl будет очищен
      } catch (saveError) {
        // Если сохранение не удалось, очищаем превью и показываем ошибку
        URL.revokeObjectURL(blobUrl);
        setPreviewUrl(null);
        throw saveError;
      }
    } catch (error) {
      console.error("Error uploading avatar:", error);
      const errorMessage = error instanceof Error ? error.message : "Ошибка при загрузке фото";
      setError(errorMessage);
      // Не закрываем кроппер при ошибке, чтобы пользователь мог попробовать снова
      setShowCropper(true);
    } finally {
      setIsUploading(false);
    }
  };

  const handleCancel = () => {
    setShowCropper(false);
    setImageSrc(null);
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  // Генерация инициалов из имени
  const getInitials = (name?: string): string => {
    if (!name) return "";
    const parts = name.trim().split(" ").filter(Boolean);
    if (parts.length === 0) return "";
    if (parts.length === 1) return parts[0][0].toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase().slice(0, 2);
  };

  // Генерация цвета для плейсхолдера
  const getPlaceholderColor = (name?: string): string => {
    if (!name) return "bg-gray-200 dark:bg-gray-700";
    const colors = [
      "bg-blue-100 text-blue-600 dark:bg-blue-900 dark:text-blue-300",
      "bg-purple-100 text-purple-600 dark:bg-purple-900 dark:text-purple-300",
      "bg-pink-100 text-pink-600 dark:bg-pink-900 dark:text-pink-300",
      "bg-green-100 text-green-600 dark:bg-green-900 dark:text-green-300",
      "bg-yellow-100 text-yellow-600 dark:bg-yellow-900 dark:text-yellow-300",
      "bg-indigo-100 text-indigo-600 dark:bg-indigo-900 dark:text-indigo-300",
      "bg-red-100 text-red-600 dark:bg-red-900 dark:text-red-300",
      "bg-cyan-100 text-cyan-600 dark:bg-cyan-900 dark:text-cyan-300",
    ];
    const index = name.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0);
    return colors[index % colors.length];
  };

  // Определяем, какое изображение показывать: превью (если есть), затем currentAvatarUrl, иначе placeholder
  // Для currentAvatarUrl используем getFileUrl для правильной обработки через CDN
  const displayUrl = previewUrl || (currentAvatarUrl ? getFileUrl(currentAvatarUrl) : null);
  const shouldShowPlaceholder = !displayUrl || imageLoadError;
  const initials = getInitials(userName);

  return (
    <div className="space-y-4">
      {/* Avatar Preview */}
      <div className="flex flex-col items-center gap-4 md:flex-row md:items-center">
        {/* Avatar with mobile edit button */}
        <div className="relative">
          {!shouldShowPlaceholder && displayUrl ? (
            <img
              key={displayUrl} // Ключ для принудительной перезагрузки при изменении URL
              src={displayUrl}
              alt="Avatar"
              className="h-24 w-24 rounded-full object-cover ring-2 ring-gray-200 dark:ring-gray-700"
              crossOrigin={displayUrl?.startsWith('http') || displayUrl?.startsWith('/api/') ? "anonymous" : undefined}
              onError={(e) => {
                const img = e.target as HTMLImageElement;
                // Логируем только в development режиме, чтобы не засорять консоль пользователя
                if (process.env.NODE_ENV === 'development') {
                  console.warn("[AvatarUpload] Failed to load avatar image");
                  console.warn("[AvatarUpload] Avatar URL:", displayUrl?.substring(0, 100));
                  console.warn("[AvatarUpload] This is normal if the file doesn't exist yet");
                }
                // Устанавливаем флаг ошибки, чтобы показать placeholder
                setImageLoadError(true);
              }}
              onLoad={() => {
                if (process.env.NODE_ENV === 'development') {
                  console.log("[AvatarUpload] Avatar image loaded successfully");
                  console.log("[AvatarUpload] Avatar URL type:", displayUrl?.startsWith('data:') ? 'base64' : displayUrl?.startsWith('blob:') ? 'blob' : 'url');
                }
                setImageLoadError(false);
              }}
            />
          ) : null}
          {shouldShowPlaceholder && (
            <div className={`flex h-24 w-24 items-center justify-center rounded-full ring-2 ring-gray-200 dark:ring-gray-700 ${getPlaceholderColor(userName)}`}>
              {initials ? (
                <span className="text-2xl font-semibold">{initials}</span>
              ) : (
                <Camera className="h-10 w-10 text-gray-400 dark:text-gray-500" />
              )}
            </div>
          )}
          
          {/* Mobile: Circular pencil button overlaying avatar */}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="absolute bottom-0 right-0 flex h-8 w-8 items-center justify-center rounded-full bg-blue-600 text-white shadow-lg transition-colors hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 md:hidden"
            aria-label="Изменить фото"
          >
            <Pencil className="h-4 w-4" />
          </button>
        </div>
        
        {/* Desktop: Button with text */}
        <div className="hidden md:block">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
          >
            <Upload className="h-4 w-4" />
            {displayUrl ? "Изменить фото" : "Загрузить фото"}
          </button>
          <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
            JPG, PNG или GIF. Максимум 10MB.
          </p>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-200">
          {error}
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={onFileChange}
        className="hidden"
      />

      {/* Cropper Modal */}
      {showCropper && imageSrc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-75 p-4">
          <div className="w-full max-w-2xl rounded-lg bg-white p-6 shadow-xl dark:bg-gray-800">
            <h3 className="mb-4 text-lg font-semibold text-gray-900 dark:text-white">
              Выберите область для фото
            </h3>

            {/* Cropper Area */}
            <div className="relative h-96 w-full overflow-hidden rounded-lg bg-gray-100 dark:bg-gray-900">
              <Cropper
                image={imageSrc}
                crop={crop}
                zoom={zoom}
                aspect={1}
                cropShape="round"
                showGrid={false}
                onCropChange={setCrop}
                onCropComplete={onCropComplete}
                onZoomChange={setZoom}
              />
            </div>

            {/* Zoom Control */}
            <div className="mt-4">
              <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                Масштаб
              </label>
              <input
                type="range"
                min={1}
                max={3}
                step={0.1}
                value={zoom}
                onChange={(e) => setZoom(Number(e.target.value))}
                className="h-2 w-full cursor-pointer appearance-none rounded-lg bg-gray-200 dark:bg-gray-700"
              />
            </div>

            {/* Actions */}
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={handleCancel}
                disabled={isUploading}
                className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 shadow-sm transition-colors hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600"
              >
                <X className="h-4 w-4" />
                Отмена
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={isUploading}
                className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50"
              >
                {isUploading ? (
                  <>
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"></div>
                    Сохранение...
                  </>
                ) : (
                  <>
                    <Check className="h-4 w-4" />
                    Сохранить
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Helper function to create an image element
function createImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.addEventListener("load", () => resolve(image));
    image.addEventListener("error", (error) => reject(error));
    image.setAttribute("crossOrigin", "anonymous");
    image.src = url;
  });
}

