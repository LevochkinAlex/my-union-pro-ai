/**
 * Серверная конвертация HEIC файлов в JPEG
 * Использует heic-convert и sharp для конвертации на сервере
 */

import sharp from "sharp";
import convert from "heic-convert";

export async function convertHeicToJpegServer(
  buffer: Buffer,
  originalName: string,
  mimeType?: string
): Promise<{ buffer: Buffer; fileName: string; mimeType: string }> {
  try {
    // Проверяем по расширению файла
    const lowerName = originalName.toLowerCase();
    const isHeicByExtension = lowerName.endsWith('.heic') || lowerName.endsWith('.heif');
    
    // Проверяем по MIME type
    const isHeicByMime = mimeType === 'image/heic' || mimeType === 'image/heif';
    
    // Проверяем по magic bytes (HEIC/HEIF файлы начинаются с ftyp)
    let isHeicByMagic = false;
    if (buffer.length >= 12) {
      const ftyp = buffer.slice(4, 8).toString('ascii');
      if (ftyp === 'ftyp') {
        const brand = buffer.slice(8, 12).toString('ascii');
        // Проверяем различные бренды HEIC/HEIF
        isHeicByMagic = 
          brand.includes('heic') || 
          brand.includes('heif') ||
          brand.includes('mif1') || // HEIF brand
          brand.includes('msf1');   // HEIF sequence brand
      }
    }
    
    const isHeic = isHeicByExtension || isHeicByMime || isHeicByMagic;

    if (!isHeic) {
      // Если это не HEIC, возвращаем оригинал с правильным MIME type
      // Определяем MIME type по расширению, если не передан
      let detectedMimeType = mimeType || 'image/jpeg';
      if (!mimeType) {
        if (lowerName.endsWith('.gif')) {
          detectedMimeType = 'image/gif';
        } else if (lowerName.endsWith('.png')) {
          detectedMimeType = 'image/png';
        } else if (lowerName.endsWith('.webp')) {
          detectedMimeType = 'image/webp';
        } else if (lowerName.endsWith('.jpg') || lowerName.endsWith('.jpeg')) {
          detectedMimeType = 'image/jpeg';
        }
      }
      
      return {
        buffer,
        fileName: originalName,
        mimeType: detectedMimeType,
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
    console.error('[heic-convert-server] Error details:', {
      fileName: originalName,
      mimeType: mimeType,
      bufferLength: buffer.length,
      errorMessage: error instanceof Error ? error.message : String(error),
    });
    
    // В случае ошибки возвращаем оригинал с правильным MIME type
    let fallbackMimeType = mimeType || 'image/jpeg';
    if (!mimeType) {
      const lowerName = originalName.toLowerCase();
      if (lowerName.endsWith('.gif')) {
        fallbackMimeType = 'image/gif';
      } else if (lowerName.endsWith('.png')) {
        fallbackMimeType = 'image/png';
      } else if (lowerName.endsWith('.webp')) {
        fallbackMimeType = 'image/webp';
      }
    }
    
    return {
      buffer,
      fileName: originalName,
      mimeType: fallbackMimeType,
    };
  }
}

