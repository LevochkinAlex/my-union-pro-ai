/**
 * Универсальный медиа-процессор для обработки изображений и других медиа-файлов
 * Использует file-type для точного определения типа файла и Sharp для обработки
 */

import { fileTypeFromBuffer } from "file-type";
import sharp from "sharp";
import { convertHeicToJpegServer } from "./heic-convert-server";

export interface MediaFileInfo {
  buffer: Buffer;
  mimeType: string;
  ext: string;
  fileName: string;
  width?: number;
  height?: number;
  size: number;
}

export interface ProcessMediaOptions {
  /**
   * Максимальная ширина изображения (автоматическое масштабирование)
   */
  maxWidth?: number;
  /**
   * Максимальная высота изображения (автоматическое масштабирование)
   */
  maxHeight?: number;
  /**
   * Качество JPEG (0-100, по умолчанию 85)
   */
  quality?: number;
  /**
   * Конвертировать HEIC/HEIF в JPEG
   */
  convertHeic?: boolean;
  /**
   * Формат вывода (если нужно конвертировать)
   */
  outputFormat?: "jpeg" | "png" | "webp";
}

/**
 * Определяет тип файла по содержимому (magic bytes)
 */
export async function detectFileType(buffer: Buffer, originalName?: string): Promise<{
  mimeType: string;
  ext: string;
} | null> {
  try {
    // Используем file-type для определения по magic bytes
    const fileType = await fileTypeFromBuffer(buffer);
    
    if (fileType) {
      return {
        mimeType: fileType.mime,
        ext: fileType.ext,
      };
    }
    
    // Fallback: определяем по расширению файла
    if (originalName) {
      const ext = originalName.toLowerCase().split('.').pop() || '';
      const mimeMap: Record<string, string> = {
        'jpg': 'image/jpeg',
        'jpeg': 'image/jpeg',
        'png': 'image/png',
        'gif': 'image/gif',
        'webp': 'image/webp',
        'heic': 'image/heic',
        'heif': 'image/heif',
        'svg': 'image/svg+xml',
        'bmp': 'image/bmp',
        'tiff': 'image/tiff',
        'ico': 'image/x-icon',
        'pdf': 'application/pdf',
        'mp4': 'video/mp4',
        'webm': 'video/webm',
        'mov': 'video/quicktime',
        'avi': 'video/x-msvideo',
      };
      
      if (mimeMap[ext]) {
        return {
          mimeType: mimeMap[ext],
          ext: ext,
        };
      }
    }
    
    return null;
  } catch (error) {
    console.error('[media-processor] Error detecting file type:', error);
    return null;
  }
}

/**
 * Обрабатывает медиа-файл: определяет тип, конвертирует при необходимости, оптимизирует
 */
export async function processMediaFile(
  buffer: Buffer,
  originalName: string,
  options: ProcessMediaOptions = {}
): Promise<MediaFileInfo> {
  const {
    maxWidth,
    maxHeight,
    quality = 85,
    convertHeic = true,
    outputFormat,
  } = options;

  // Определяем тип файла
  const detectedType = await detectFileType(buffer, originalName);
  let mimeType = detectedType?.mimeType || 'application/octet-stream';
  let ext = detectedType?.ext || originalName.split('.').pop() || 'bin';
  let processedBuffer = buffer;

  // Обрабатываем HEIC/HEIF
  if (convertHeic && (mimeType === 'image/heic' || mimeType === 'image/heif' || 
      originalName.toLowerCase().endsWith('.heic') || originalName.toLowerCase().endsWith('.heif'))) {
    try {
      const converted = await convertHeicToJpegServer(buffer, originalName, mimeType);
      processedBuffer = converted.buffer as Buffer;
      mimeType = converted.mimeType;
      ext = 'jpg';
      originalName = converted.fileName;
    } catch (error) {
      console.error('[media-processor] Error converting HEIC:', error);
      // Продолжаем с оригинальным файлом
    }
  }

  // Обрабатываем изображения через Sharp
  if (mimeType.startsWith('image/') && mimeType !== 'image/svg+xml' && mimeType !== 'image/gif') {
    try {
      let sharpInstance = sharp(processedBuffer);

      // Получаем метаданные
      const metadata = await sharpInstance.metadata();
      const currentWidth = metadata.width || 0;
      const currentHeight = metadata.height || 0;

      // Масштабируем, если нужно
      if ((maxWidth && currentWidth > maxWidth) || (maxHeight && currentHeight > maxHeight)) {
        sharpInstance = sharpInstance.resize(maxWidth, maxHeight, {
          fit: 'inside',
          withoutEnlargement: true,
        });
      }

      // Конвертируем в нужный формат, если указан
      if (outputFormat) {
        switch (outputFormat) {
          case 'jpeg':
            processedBuffer = await sharpInstance.jpeg({ quality, mozjpeg: true }).toBuffer();
            mimeType = 'image/jpeg';
            ext = 'jpg';
            break;
          case 'png':
            processedBuffer = await sharpInstance.png({ quality, compressionLevel: 9 }).toBuffer();
            mimeType = 'image/png';
            ext = 'png';
            break;
          case 'webp':
            processedBuffer = await sharpInstance.webp({ quality }).toBuffer();
            mimeType = 'image/webp';
            ext = 'webp';
            break;
        }
      } else {
        // Оптимизируем в текущем формате
        if (mimeType === 'image/jpeg') {
          processedBuffer = await sharpInstance.jpeg({ quality, mozjpeg: true }).toBuffer();
        } else if (mimeType === 'image/png') {
          processedBuffer = await sharpInstance.png({ quality, compressionLevel: 9 }).toBuffer();
        } else if (mimeType === 'image/webp') {
          processedBuffer = await sharpInstance.webp({ quality }).toBuffer();
        } else {
          // Для других форматов просто оптимизируем без изменения формата
          processedBuffer = await sharpInstance.toBuffer();
        }
      }

      // Получаем финальные размеры
      const finalMetadata = await sharp(processedBuffer).metadata();
      const width = finalMetadata.width;
      const height = finalMetadata.height;

      return {
        buffer: processedBuffer,
        mimeType,
        ext,
        fileName: originalName.replace(/\.[^.]+$/, `.${ext}`),
        width,
        height,
        size: processedBuffer.length,
      };
    } catch (error) {
      console.error('[media-processor] Error processing image with Sharp:', error);
      // Если Sharp не может обработать, возвращаем оригинал
      return {
        buffer: processedBuffer,
        mimeType,
        ext,
        fileName: originalName,
        size: processedBuffer.length,
      };
    }
  }

  // Для не-изображений просто возвращаем информацию
  return {
    buffer: processedBuffer,
    mimeType,
    ext,
    fileName: originalName,
    size: processedBuffer.length,
  };
}
