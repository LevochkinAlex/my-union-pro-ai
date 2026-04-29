"use client";

import { useState, useCallback, useId } from "react";
import Cropper from "react-easy-crop";
import type { Area } from "react-easy-crop";

const ASPECT_16_9 = 16 / 9;

interface VenueBannerUploadProps {
  value: string;
  onChange: (url: string) => void;
  label?: string;
}

export default function VenueBannerUpload({
  value,
  onChange,
  label = "Баннер 16:9",
}: VenueBannerUploadProps) {
  const id = useId();
  const pickId = `${id}-pick`;
  const changeId = `${id}-change`;

  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [uploading, setUploading] = useState(false);
  const [showCropper, setShowCropper] = useState(false);

  const onCropComplete = useCallback((_area: Area, pixels: Area) => {
    setCroppedAreaPixels(pixels);
  }, []);

  const onCropAreaChange = useCallback((_area: Area, pixels: Area) => {
    setCroppedAreaPixels(pixels);
  }, []);

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) {
      const file = e.target.files[0];
      if (!file.type.startsWith("image/")) {
        alert("Выберите файл изображения");
        return;
      }
      if (file.size > 10 * 1024 * 1024) {
        alert("Размер файла не должен превышать 10MB");
        return;
      }
      const reader = new FileReader();
      reader.addEventListener("load", () => {
        setImageSrc(reader.result as string);
        setShowCropper(true);
      });
      reader.readAsDataURL(file);
    }
    e.target.value = "";
  };

  const createImage = (url: string): Promise<HTMLImageElement> =>
    new Promise((resolve, reject) => {
      const image = new Image();
      image.addEventListener("load", () => resolve(image));
      image.addEventListener("error", (err) => reject(err));
      image.src = url;
    });

  const getCroppedImg = async (src: string, pixelCrop: Area): Promise<Blob> => {
    const image = await createImage(src);
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("No 2d context");

    const w = Math.round(pixelCrop.width);
    const h = Math.round(pixelCrop.height);
    canvas.width = w;
    canvas.height = h;

    ctx.drawImage(
      image,
      pixelCrop.x,
      pixelCrop.y,
      pixelCrop.width,
      pixelCrop.height,
      0,
      0,
      w,
      h
    );

    return new Promise((resolve, reject) => {
      canvas.toBlob(
        (blob) => {
          if (blob) resolve(blob);
          else reject(new Error("toBlob failed"));
        },
        "image/jpeg",
        0.92
      );
    });
  };

  const handleSaveCrop = async () => {
    if (!imageSrc) return;
    if (!croppedAreaPixels) {
      alert("Подождите загрузки превью или слегка сдвиньте кадр / масштаб, затем попробуйте снова.");
      return;
    }

    try {
      setUploading(true);
      const blob = await getCroppedImg(imageSrc, croppedAreaPixels);
      const formData = new FormData();
      formData.append("file", blob, "banner-16x9.jpg");

      const response = await fetch("/api/partner/venues/upload-banner", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || "Ошибка загрузки");
      }

      const data = await response.json();
      onChange(data.url);
      setShowCropper(false);
      setImageSrc(null);
      setCrop({ x: 0, y: 0 });
      setZoom(1);
    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : "Не удалось загрузить баннер");
    } finally {
      setUploading(false);
    }
  };

  const handleCancel = () => {
    setShowCropper(false);
    setImageSrc(null);
    setCrop({ x: 0, y: 0 });
    setZoom(1);
  };

  const handleRemove = () => {
    onChange("");
  };

  const hasPreview = Boolean(value?.trim());

  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">{label}</label>
      <p className="text-xs text-gray-500 dark:text-gray-400">
        Загрузите изображение и обрежьте под формат 16:9 (широкий баннер).
      </p>

      {!hasPreview && !showCropper && (
        <div>
          <input
            type="file"
            accept="image/*"
            onChange={onFileChange}
            className="hidden"
            id={pickId}
          />
          <label
            htmlFor={pickId}
            className="flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-gray-300 bg-white px-4 py-8 hover-surface dark:border-gray-600 dark:bg-gray-800 dark:hover:bg-gray-700"
          >
            <svg
              className="h-10 w-10 text-gray-400"
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
            <span className="mt-2 text-sm text-gray-600 dark:text-gray-400">
              Выбрать изображение для баннера
            </span>
            <span className="mt-1 text-xs text-gray-500">PNG, JPG, WebP до 10MB</span>
          </label>
        </div>
      )}

      {showCropper && imageSrc && (
        <div className="space-y-4">
          <div className="relative h-80 w-full overflow-hidden rounded-lg bg-gray-900 sm:h-96">
            <Cropper
              image={imageSrc}
              crop={crop}
              zoom={zoom}
              aspect={ASPECT_16_9}
              onCropChange={setCrop}
              onCropComplete={onCropComplete}
              onCropAreaChange={onCropAreaChange}
              onZoomChange={setZoom}
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
              Масштаб
            </label>
            <input
              type="range"
              min={1}
              max={3}
              step={0.05}
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
              className="w-full"
            />
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleCancel}
              className="flex-1 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600"
            >
              Отмена
            </button>
            <button
              type="button"
              onClick={handleSaveCrop}
              disabled={uploading}
              className="flex-1 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {uploading ? "Загрузка..." : "Обрезать и загрузить"}
            </button>
          </div>
        </div>
      )}

      {hasPreview && !showCropper && (
        <div className="space-y-2">
          <div className="aspect-video w-full overflow-hidden rounded-lg border border-gray-200 bg-gray-100 dark:border-gray-700 dark:bg-gray-900">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={value}
              alt="Баннер площадки"
              className="h-full w-full object-cover"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <input
              type="file"
              accept="image/*"
              onChange={onFileChange}
              className="hidden"
              id={changeId}
            />
            <label
              htmlFor={changeId}
              className="inline-flex flex-1 cursor-pointer items-center justify-center rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600 sm:flex-none"
            >
              Заменить изображение
            </label>
            <button
              type="button"
              onClick={handleRemove}
              className="rounded-lg border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50 dark:border-red-800 dark:bg-gray-700 dark:text-red-400 dark:hover:bg-red-900/20"
            >
              Удалить баннер
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
