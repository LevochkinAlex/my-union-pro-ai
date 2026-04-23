import sharp from "sharp";
import path from "path";

export interface OptimizedImage {
  buffer: Buffer;
  width: number;
  height: number;
  format: "webp" | "jpeg" | "png";
  size: number;
  originalSize: number;
  savings: number; // процент экономии
}

export interface ImageOptimizeOptions {
  maxWidth?: number;
  maxHeight?: number;
  quality?: number; // 1-100
  format?: "webp" | "jpeg" | "png" | "auto";
  progressive?: boolean;
}

// Настройки по умолчанию для разных типов изображений
export const IMAGE_PRESETS = {
  // Аватары - маленькие, высокое качество
  avatar: {
    maxWidth: 400,
    maxHeight: 400,
    quality: 85,
    format: "webp" as const,
  },
  // Миниатюры для списков
  thumbnail: {
    maxWidth: 300,
    maxHeight: 300,
    quality: 80,
    format: "webp" as const,
  },
  // Изображения для постов и чата
  post: {
    maxWidth: 1200,
    maxHeight: 1200,
    quality: 85,
    format: "webp" as const,
  },
  // Обложки новостей
  cover: {
    maxWidth: 1920,
    maxHeight: 1080,
    quality: 85,
    format: "webp" as const,
  },
  // Полноразмерные для просмотра
  full: {
    maxWidth: 2560,
    maxHeight: 2560,
    quality: 90,
    format: "webp" as const,
  },
};

/**
 * Оптимизирует изображение с минимальной потерей качества
 */
export async function optimizeImage(
  input: Buffer | string,
  options: ImageOptimizeOptions = {}
): Promise<OptimizedImage> {
  const {
    maxWidth = 1920,
    maxHeight = 1920,
    quality = 85,
    format = "webp",
    progressive = true,
  } = options;

  // Получаем информацию об оригинале
  const originalBuffer = typeof input === "string" 
    ? await sharp(input).toBuffer() 
    : input;
  const originalSize = originalBuffer.length;
  const metadata = await sharp(originalBuffer).metadata();

  // Определяем нужно ли изменять размер
  let pipeline = sharp(originalBuffer);
  
  // Автоповорот на основе EXIF
  pipeline = pipeline.rotate();

  // Изменяем размер только если изображение больше лимитов
  const needsResize = 
    (metadata.width && metadata.width > maxWidth) ||
    (metadata.height && metadata.height > maxHeight);

  if (needsResize) {
    pipeline = pipeline.resize(maxWidth, maxHeight, {
      fit: "inside", // Сохраняем пропорции
      withoutEnlargement: true, // Не увеличиваем маленькие изображения
    });
  }

  // Определяем выходной формат
  let outputFormat: "webp" | "jpeg" | "png" = format === "auto" 
    ? "webp" // По умолчанию WebP - лучшее сжатие
    : format;

  // Для PNG с прозрачностью сохраняем формат
  if (metadata.hasAlpha && format === "auto") {
    outputFormat = "webp"; // WebP поддерживает прозрачность
  }

  // Применяем сжатие
  switch (outputFormat) {
    case "webp":
      pipeline = pipeline.webp({
        quality,
        effort: 4, // Баланс скорости и сжатия (0-6)
        smartSubsample: true,
        nearLossless: quality >= 90, // Почти без потерь для высокого качества
      });
      break;
    case "jpeg":
      pipeline = pipeline.jpeg({
        quality,
        progressive,
        mozjpeg: true, // Лучшее сжатие
        chromaSubsampling: quality >= 90 ? "4:4:4" : "4:2:0",
      });
      break;
    case "png":
      pipeline = pipeline.png({
        quality,
        progressive,
        compressionLevel: 9,
        effort: 10,
      });
      break;
  }

  // Удаляем метаданные для уменьшения размера
  pipeline = pipeline.withMetadata({
    orientation: undefined, // Убираем EXIF ориентацию (уже применена rotate)
  });

  const outputBuffer = await pipeline.toBuffer();
  const outputMetadata = await sharp(outputBuffer).metadata();

  const savings = Math.round((1 - outputBuffer.length / originalSize) * 100);

  console.log(
    `[ImageOptimizer] ${(originalSize / 1024).toFixed(1)}KB -> ${(outputBuffer.length / 1024).toFixed(1)}KB ` +
    `(${savings}% saved) | ${metadata.width}x${metadata.height} -> ${outputMetadata.width}x${outputMetadata.height} | ${outputFormat}`
  );

  return {
    buffer: outputBuffer,
    width: outputMetadata.width || 0,
    height: outputMetadata.height || 0,
    format: outputFormat,
    size: outputBuffer.length,
    originalSize,
    savings,
  };
}

/**
 * Оптимизирует изображение с использованием пресета
 */
export async function optimizeWithPreset(
  input: Buffer | string,
  preset: keyof typeof IMAGE_PRESETS
): Promise<OptimizedImage> {
  return optimizeImage(input, IMAGE_PRESETS[preset]);
}

/**
 * Логотип партнёра: всегда WebP (ресайз по пресету avatar, сжатие).
 * При сбое основного пайплайна — запасной encode через sharp.webp.
 */
export async function optimizePartnerLogoToWebp(input: Buffer): Promise<OptimizedImage> {
  try {
    return await optimizeImage(input, { ...IMAGE_PRESETS.avatar, format: "webp" });
  } catch (e) {
    console.warn("[image-optimizer] optimizePartnerLogoToWebp fallback:", e);
    const originalSize = input.length;
    const { maxWidth, maxHeight, quality } = IMAGE_PRESETS.avatar;
    const metadata = await sharp(input).metadata();
    let pipeline = sharp(input).rotate();
    const needsResize =
      (metadata.width && metadata.width > maxWidth) ||
      (metadata.height && metadata.height > maxHeight);
    if (needsResize) {
      pipeline = pipeline.resize(maxWidth, maxHeight, {
        fit: "inside",
        withoutEnlargement: true,
      });
    }
    const outputBuffer = await pipeline.webp({ quality, effort: 4, smartSubsample: true }).toBuffer();
    const outMeta = await sharp(outputBuffer).metadata();
    return {
      buffer: outputBuffer,
      width: outMeta.width || 0,
      height: outMeta.height || 0,
      format: "webp",
      size: outputBuffer.length,
      originalSize,
      savings: Math.round((1 - outputBuffer.length / originalSize) * 100),
    };
  }
}

/**
 * Баннер площадки партнёра (16:9 / широкий): всегда WebP, пресет cover (1920×1080 max).
 * При сбое основного пайплайна — запасной encode через sharp.webp.
 */
export async function optimizePartnerVenueBannerToWebp(input: Buffer): Promise<OptimizedImage> {
  try {
    return await optimizeImage(input, { ...IMAGE_PRESETS.cover, format: "webp" });
  } catch (e) {
    console.warn("[image-optimizer] optimizePartnerVenueBannerToWebp fallback:", e);
    const originalSize = input.length;
    const { maxWidth, maxHeight, quality } = IMAGE_PRESETS.cover;
    const metadata = await sharp(input).metadata();
    let pipeline = sharp(input).rotate();
    const needsResize =
      (metadata.width && metadata.width > maxWidth) ||
      (metadata.height && metadata.height > maxHeight);
    if (needsResize) {
      pipeline = pipeline.resize(maxWidth, maxHeight, {
        fit: "inside",
        withoutEnlargement: true,
      });
    }
    const outputBuffer = await pipeline.webp({ quality, effort: 4, smartSubsample: true }).toBuffer();
    const outMeta = await sharp(outputBuffer).metadata();
    return {
      buffer: outputBuffer,
      width: outMeta.width || 0,
      height: outMeta.height || 0,
      format: "webp",
      size: outputBuffer.length,
      originalSize,
      savings: Math.round((1 - outputBuffer.length / originalSize) * 100),
    };
  }
}

/**
 * Проверяет, является ли файл изображением
 */
export function isImageFile(filename: string): boolean {
  const ext = path.extname(filename).toLowerCase();
  return [".jpg", ".jpeg", ".png", ".gif", ".webp", ".heic", ".heif", ".avif"].includes(ext);
}

/**
 * Получает MIME тип для формата
 */
export function getMimeType(format: "webp" | "jpeg" | "png"): string {
  switch (format) {
    case "webp": return "image/webp";
    case "jpeg": return "image/jpeg";
    case "png": return "image/png";
  }
}

/**
 * Генерирует имя файла с новым расширением
 */
export function getOptimizedFilename(originalName: string, format: "webp" | "jpeg" | "png"): string {
  const baseName = path.basename(originalName, path.extname(originalName));
  return `${baseName}.${format}`;
}

