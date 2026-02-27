"use client";

import { useState, useCallback } from "react";
import { useSession } from "next-auth/react";
import Cropper from "react-easy-crop";
import type { Area } from "react-easy-crop";

interface ImageUploadWithCropProps {
  value: string | null;
  onChange: (url: string | null) => void;
  label?: string;
}

export default function ImageUploadWithCrop({
  value,
  onChange,
  label = "Изображение обложки",
}: ImageUploadWithCropProps) {
  const { data: session } = useSession();
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const aspectRatioPresets = [
    { label: "16:9 (широкий)", value: 16 / 9 },
    { label: "4:3 (стандартный)", value: 4 / 3 },
    { label: "1:1 (квадрат)", value: 1 },
    { label: "21:9 (ультраширокий)", value: 21 / 9 },
    { label: "3:2 (фото)", value: 3 / 2 },
    { label: "9:16 (вертикальный)", value: 9 / 16 },
  ];
  const [aspectRatio, setAspectRatio] = useState<number>(16 / 9);
  const [uploading, setUploading] = useState(false);
  const [showCropper, setShowCropper] = useState(false);

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
        setShowCropper(true);
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
      formData.append("file", croppedImageBlob, "cover.jpg");

      // Определяем, какой endpoint использовать (для админа или председателя)
      // Режим председателя: ППО, МПО или РПО (Региональный) — все используют ppo-head endpoint
      const viewMode = (session?.user as { viewMode?: string })?.viewMode ?? "";
      const isOrgHead = ["PPO_HEAD", "MPO_HEAD", "RPO_HEAD"].includes(viewMode) ||
        (session?.user?.role === "PPO_HEAD" && !(session?.user as any)?.isPPOHead);
      const isSuperAdmin = session?.user?.role === "SUPER_ADMIN";

      const endpoint = isOrgHead && !isSuperAdmin
        ? "/api/ppo-head/news/upload-image"
        : "/api/admin/news/upload-image";

      const response = await fetch(endpoint, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        throw new Error("Failed to upload image");
      }

      const data = await response.json();
      console.log("[ImageUploadWithCrop] Uploaded image, URL length:", data.url?.length || 0);
      onChange(data.url);
      setShowCropper(false);
      setImageSrc(null);
    } catch (error) {
      console.error("Error uploading image:", error);
      alert("Не удалось загрузить изображение");
    } finally {
      setUploading(false);
    }
  };

  const handleRemove = () => {
    onChange(null);
  };

  const handleCancel = () => {
    setShowCropper(false);
    setImageSrc(null);
    setCrop({ x: 0, y: 0 });
    setZoom(1);
  };

  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
        {label}
      </label>

      {!value && !showCropper && (
        <div>
          <input
            type="file"
            accept="image/*"
            onChange={onFileChange}
            className="hidden"
            id="image-upload"
          />
          <label
            htmlFor="image-upload"
            className="flex items-center justify-center w-full h-32 px-4 py-6 bg-white border-2 border-gray-300 border-dashed rounded-lg cursor-pointer hover:bg-gray-50 dark:bg-gray-800 dark:border-gray-600 dark:hover:bg-gray-700 transition"
          >
            <div className="flex flex-col items-center">
              <svg
                className="w-10 h-10 text-gray-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                />
              </svg>
              <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                Нажмите для выбора изображения
              </p>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-500">
                PNG, JPG, WebP до 10MB
              </p>
            </div>
          </label>
        </div>
      )}

      {showCropper && imageSrc && (
        <div className="space-y-4">
          <div className="relative w-full h-96 bg-gray-900 rounded-lg overflow-hidden">
            <Cropper
              image={imageSrc}
              crop={crop}
              zoom={zoom}
              aspect={aspectRatio}
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
                onClick={handleCancel}
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
                {uploading ? "Загрузка..." : "Сохранить"}
              </button>
            </div>
          </div>
        </div>
      )}

      {value && !showCropper && (
        <div className="relative">
          <img
            src={value}
            alt="Cover"
            className="w-full h-auto max-h-64 object-cover rounded-lg border border-gray-200 dark:border-gray-700"
          />
          <div className="mt-2 flex gap-2">
            <label
              htmlFor="image-upload-change"
              className="flex-1 inline-flex items-center justify-center px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 dark:bg-gray-700 dark:text-gray-200 dark:border-gray-600 dark:hover:bg-gray-600 cursor-pointer"
            >
              Изменить
            </label>
            <input
              type="file"
              accept="image/*"
              onChange={onFileChange}
              className="hidden"
              id="image-upload-change"
            />
            <button
              type="button"
              onClick={handleRemove}
              className="px-4 py-2 text-sm font-medium text-red-700 bg-white border border-red-300 rounded-lg hover:bg-red-50 dark:bg-gray-700 dark:text-red-400 dark:border-red-800 dark:hover:bg-red-900/20"
            >
              Удалить
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

