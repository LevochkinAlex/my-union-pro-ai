"use client";

import { useState, useCallback, useId, useRef, useEffect } from "react";
import Cropper from "react-easy-crop";
import type { Area, MediaSize, Size } from "react-easy-crop";
import { computePartnerLogoCroppedPixels } from "@/lib/partner-logo-crop";
import { alertError, alertWarning } from "@/lib/alert";

const ASPECT_SQUARE = 1;
/** Максимум приближения относительно «вписанного» масштаба (fitZoom × ZOOM_IN_FACTOR) */
const ZOOM_IN_FACTOR = 3;

interface PartnerLogoUploadProps {
  partnerId: string;
  value: string;
  onChange: (url: string) => void;
  disabled?: boolean;
  label?: string;
}

export default function PartnerLogoUpload({
  partnerId,
  value,
  onChange,
  disabled = false,
  label = "Логотип партнёра",
}: PartnerLogoUploadProps) {
  const id = useId();
  const pickId = `${id}-pick`;
  const changeId = `${id}-change`;

  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const croppedPixelsRef = useRef<Area | null>(null);
  const [mediaSize, setMediaSize] = useState<MediaSize | null>(null);
  const [cropSize, setCropSize] = useState<Size | null>(null);
  /** Минимальный zoom: всё изображение по касательной к квадрату кропа (нельзя «отдалить» сильнее) */
  const [fitZoom, setFitZoom] = useState(1);
  const fitAppliedForSrcRef = useRef<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [showCropper, setShowCropper] = useState(false);

  const syncCroppedPixels = useCallback((pixels: Area) => {
    croppedPixelsRef.current = pixels;
    setCroppedAreaPixels(pixels);
  }, []);

  const onCropComplete = useCallback(
    (_area: Area, pixels: Area) => {
      syncCroppedPixels(pixels);
    },
    [syncCroppedPixels]
  );

  const onCropAreaChange = useCallback(
    (_area: Area, pixels: Area) => {
      syncCroppedPixels(pixels);
    },
    [syncCroppedPixels]
  );

  useEffect(() => {
    if (!showCropper) {
      setMediaSize(null);
      setCropSize(null);
      setFitZoom(1);
      fitAppliedForSrcRef.current = null;
      croppedPixelsRef.current = null;
      setCroppedAreaPixels(null);
    }
  }, [showCropper]);

  useEffect(() => {
    croppedPixelsRef.current = null;
    setCroppedAreaPixels(null);
    fitAppliedForSrcRef.current = null;
  }, [imageSrc]);

  /** После загрузки превью: вписать всё изображение в квадрат кропа и зафиксировать minZoom = этому масштабу */
  useEffect(() => {
    if (!imageSrc || !mediaSize || !cropSize) return;
    if (fitAppliedForSrcRef.current === imageSrc) return;
    const mw = mediaSize.width;
    const mh = mediaSize.height;
    if (mw <= 0 || mh <= 0) return;
    const fit = Math.max(cropSize.width / mw, cropSize.height / mh);
    if (!Number.isFinite(fit) || fit <= 0) return;
    fitAppliedForSrcRef.current = imageSrc;
    setFitZoom(fit);
    setZoom(fit);
    setCrop({ x: 0, y: 0 });
  }, [imageSrc, mediaSize, cropSize]);

  const maxZoom = fitZoom * ZOOM_IN_FACTOR;
  useEffect(() => {
    setZoom((z) => Math.min(Math.max(z, fitZoom), maxZoom));
  }, [fitZoom, maxZoom]);

  const clampedZoom = Math.min(Math.max(zoom, fitZoom), maxZoom);

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (disabled) return;
    if (e.target.files?.[0]) {
      const file = e.target.files[0];
      if (!file.type.startsWith("image/")) {
        alertWarning("Выберите файл изображения", "Логотип");
        return;
      }
      if (file.size > 10 * 1024 * 1024) {
        alertWarning("Размер файла не должен превышать 10MB", "Логотип");
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

    let pixels: Area | null = croppedPixelsRef.current ?? croppedAreaPixels;
    if (!pixels && mediaSize && cropSize) {
      try {
        pixels = computePartnerLogoCroppedPixels(crop, mediaSize, cropSize, ASPECT_SQUARE, zoom, 0, true);
      } catch (e) {
        console.error("[PartnerLogoUpload] compute crop:", e);
      }
    }

    if (!pixels || pixels.width < 1 || pixels.height < 1) {
      alertWarning(
        "Не удалось определить область обрезки. Подождите секунду после появления превью или слегка сдвиньте кадр / масштаб и нажмите снова.",
        "Логотип"
      );
      return;
    }

    try {
      setUploading(true);
      const blob = await getCroppedImg(imageSrc, pixels);
      const formData = new FormData();
      formData.append("file", blob, "logo-square.jpg");

      const response = await fetch(`/api/admin/partners/${partnerId}/upload-logo`, {
        method: "POST",
        body: formData,
        credentials: "same-origin",
      });

      const raw = await response.text();
      let payload: { error?: string; url?: string; success?: boolean } = {};
      try {
        payload = raw ? (JSON.parse(raw) as typeof payload) : {};
      } catch {
        /* не JSON — например HTML-страница ошибки Next при сбое dev-сервера */
      }

      if (!response.ok) {
        let msg =
          typeof payload.error === "string" && payload.error.trim()
            ? payload.error
            : "Ошибка загрузки";
        if (
          msg === "Ошибка загрузки" &&
          (response.status >= 500 || raw.trimStart().startsWith("<!DOCTYPE"))
        ) {
          msg =
            "Сервер вернул ошибку (часто из‑за сбоя кэша dev: остановите dev-сервер, выполните «rm -rf .next» в каталоге проекта и запустите снова). Если не поможет — проверьте лог терминала.";
        }
        throw new Error(msg);
      }

      const data = payload;
      if (typeof data.url === "string") {
        onChange(data.url);
      }
      setShowCropper(false);
      setImageSrc(null);
      setCrop({ x: 0, y: 0 });
      setZoom(1);
      setFitZoom(1);
    } catch (err) {
      console.error(err);
      alertError(err instanceof Error ? err.message : "Не удалось загрузить логотип", "Логотип");
    } finally {
      setUploading(false);
    }
  };

  const handleCancel = () => {
    setShowCropper(false);
    setImageSrc(null);
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setFitZoom(1);
  };

  const handleRemove = async () => {
    if (disabled) return;
    try {
      setRemoving(true);
      const res = await fetch(`/api/admin/partners/${partnerId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ logoUrl: null }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(typeof data.error === "string" ? data.error : "Не удалось удалить логотип");
      }
      onChange("");
    } catch (err) {
      console.error(err);
      alertError(err instanceof Error ? err.message : "Не удалось удалить логотип", "Логотип");
    } finally {
      setRemoving(false);
    }
  };

  const hasPreview = Boolean(value?.trim());

  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">{label}</label>
      <p className="text-xs text-gray-500 dark:text-gray-400">
        Загрузите изображение: сначала оно вписывается в квадрат целиком, затем можно приблизить и сдвинуть кадр.
      </p>

      {!hasPreview && !showCropper && (
        <div>
          <input
            type="file"
            accept="image/*"
            onChange={onFileChange}
            className="hidden"
            id={pickId}
            disabled={disabled}
          />
          <label
            htmlFor={pickId}
            className={`flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-gray-300 bg-white px-4 py-8 hover-surface dark:border-gray-600 dark:bg-gray-800 dark:hover:bg-gray-700 ${
              disabled ? "pointer-events-none opacity-50" : ""
            }`}
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
              Выбрать изображение логотипа
            </span>
            <span className="mt-1 text-xs text-gray-500">PNG, JPG, WebP до 10MB</span>
          </label>
        </div>
      )}

      {showCropper && imageSrc && (
        <div className="space-y-4">
          <div className="relative mx-auto aspect-square w-full max-w-md overflow-hidden rounded-lg bg-gray-900">
            <Cropper
              key={imageSrc}
              image={imageSrc}
              crop={crop}
              zoom={clampedZoom}
              minZoom={fitZoom}
              maxZoom={maxZoom}
              aspect={ASPECT_SQUARE}
              cropShape="rect"
              showGrid={false}
              rotation={0}
              restrictPosition
              onCropChange={setCrop}
              onCropComplete={onCropComplete}
              onCropAreaChange={onCropAreaChange}
              onZoomChange={setZoom}
              onMediaLoaded={(size) => setMediaSize(size)}
              onCropSizeChange={(size) => setCropSize(size)}
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
              Масштаб (левый край — всё изображение в кадре; дальше уменьшить нельзя)
            </label>
            <input
              type="range"
              min={fitZoom}
              max={maxZoom}
              step={0.02}
              value={clampedZoom}
              onChange={(e) => setZoom(Number(e.target.value))}
              className="w-full"
            />
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleCancel}
              disabled={uploading}
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
          <div className="mx-auto flex h-40 w-40 items-center justify-center overflow-hidden rounded-lg border border-gray-200 bg-gray-100 dark:border-gray-700 dark:bg-gray-900">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={value}
              alt="Логотип партнёра"
              className="max-h-full max-w-full object-contain object-center"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <input
              type="file"
              accept="image/*"
              onChange={onFileChange}
              className="hidden"
              id={changeId}
              disabled={disabled}
            />
            <label
              htmlFor={changeId}
              className={`inline-flex flex-1 cursor-pointer items-center justify-center rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600 sm:flex-none ${
                disabled ? "pointer-events-none opacity-50" : ""
              }`}
            >
              Заменить изображение
            </label>
            <button
              type="button"
              onClick={handleRemove}
              disabled={disabled || removing}
              className="rounded-lg border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-red-800 dark:bg-gray-700 dark:text-red-400 dark:hover:bg-red-900/20"
            >
              {removing ? "Удаление…" : "Удалить логотип"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
