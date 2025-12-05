/**
 * Серверная конвертация HEIC файлов в JPEG
 * Использует heic-convert и sharp для конвертации на сервере
 */

import sharp from "sharp";
import convert from "heic-convert";

export async function convertHeicToJpegServer(
  buffer: Buffer,
  originalName: string
): Promise<{ buffer: Buffer; fileName: string; mimeType: string }> {
  try {
    // Проверяем, является ли файл HEIC/HEIF
    const isHeic = 
      originalName.toLowerCase().endsWith('.heic') ||
      originalName.toLowerCase().endsWith('.heif') ||
      buffer.slice(4, 8).toString('ascii') === 'ftyp' && (
        buffer.slice(8, 12).toString('ascii').includes('heic') ||
        buffer.slice(8, 12).toString('ascii').includes('heif')
      );

    if (!isHeic) {
      // Если это не HEIC, возвращаем оригинал
      return {
        buffer,
        fileName: originalName,
        mimeType: 'image/jpeg',
      };
    }

    // Конвертируем HEIC в JPEG
    const outputBuffer = await convert({
      buffer: buffer,
      format: 'JPEG',
      quality: 0.92,
    });

    // Оптимизируем через sharp
    const optimizedBuffer = await sharp(outputBuffer as Buffer)
      .jpeg({ quality: 92, mozjpeg: true })
      .toBuffer();

    // Генерируем новое имя файла
    const newFileName = originalName.replace(/\.(heic|heif)$/i, '.jpg');

    return {
      buffer: optimizedBuffer,
      fileName: newFileName,
      mimeType: 'image/jpeg',
    };
  } catch (error) {
    console.error('[heic-convert-server] Error converting HEIC:', error);
    // В случае ошибки возвращаем оригинал
    return {
      buffer,
      fileName: originalName,
      mimeType: 'image/jpeg',
    };
  }
}

