"use client";

import { useState, useCallback, useRef } from "react";
import Cropper from "react-easy-crop";
import { Area } from "react-easy-crop";
import { Camera, X, Check, Upload, Pencil } from "lucide-react";

interface AvatarUploadProps {
  currentAvatarUrl?: string | null;
  onSave: (croppedImageBlob: Blob) => Promise<void>;
}

export default function AvatarUpload({ currentAvatarUrl, onSave }: AvatarUploadProps) {
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [showCropper, setShowCropper] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const onFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      const reader = new FileReader();
      reader.addEventListener("load", () => {
        setImageSrc(reader.result as string);
        setShowCropper(true);
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
      await onSave(croppedImageBlob);
      setShowCropper(false);
      setImageSrc(null);
    } catch (error) {
      console.error("Error uploading avatar:", error);
      alert("Ошибка при загрузке фото");
    } finally {
      setIsUploading(false);
    }
  };

  const handleCancel = () => {
    setShowCropper(false);
    setImageSrc(null);
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  return (
    <div className="space-y-4">
      {/* Avatar Preview */}
      <div className="flex flex-col items-center gap-4 md:flex-row md:items-center">
        {/* Avatar with mobile edit button */}
        <div className="relative">
          {currentAvatarUrl ? (
            <img
              src={currentAvatarUrl}
              alt="Avatar"
              className="h-24 w-24 rounded-full object-cover ring-2 ring-gray-200 dark:ring-gray-700"
            />
          ) : (
            <div className="flex h-24 w-24 items-center justify-center rounded-full bg-gray-200 ring-2 ring-gray-200 dark:bg-gray-700 dark:ring-gray-700">
              <Camera className="h-10 w-10 text-gray-400 dark:text-gray-500" />
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
            {currentAvatarUrl ? "Изменить фото" : "Загрузить фото"}
          </button>
          <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
            JPG, PNG или GIF. Максимум 5MB.
          </p>
        </div>
      </div>

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

