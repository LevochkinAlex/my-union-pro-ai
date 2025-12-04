/**
 * Конвертация HEIC файлов в JPEG на клиенте
 * Использует Canvas API для конвертации
 */

export async function convertHeicToJpeg(file: File): Promise<File> {
  try {
    // Проверяем, нужна ли конвертация
    const isHeic = file.name.toLowerCase().endsWith('.heic') || 
                   file.name.toLowerCase().endsWith('.heif') ||
                   file.type === 'image/heic' ||
                   file.type === 'image/heif';
    
    if (!isHeic) {
      return file; // Возвращаем оригинальный файл, если это не HEIC
    }

    // Создаем объект URL для файла
    const url = URL.createObjectURL(file);
    
    return new Promise((resolve, reject) => {
      const img = new Image();
      
      img.onload = () => {
        try {
          // Создаем canvas
          const canvas = document.createElement('canvas');
          canvas.width = img.width;
          canvas.height = img.height;
          
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            throw new Error('Failed to get canvas context');
          }
          
          // Рисуем изображение на canvas
          ctx.drawImage(img, 0, 0);
          
          // Конвертируем в JPEG blob
          canvas.toBlob(
            (blob) => {
              if (!blob) {
                reject(new Error('Failed to convert image'));
                return;
              }
              
              // Создаем новый File объект
              const newFileName = file.name.replace(/\.(heic|heif)$/i, '.jpg');
              const jpegFile = new File([blob], newFileName, {
                type: 'image/jpeg',
                lastModified: Date.now(),
              });
              
              // Освобождаем URL
              URL.revokeObjectURL(url);
              resolve(jpegFile);
            },
            'image/jpeg',
            0.92 // Качество JPEG (92%)
          );
        } catch (error) {
          URL.revokeObjectURL(url);
          reject(error);
        }
      };
      
      img.onerror = () => {
        URL.revokeObjectURL(url);
        // Если не получилось загрузить как изображение, возвращаем оригинал
        console.warn('Failed to load HEIC image, returning original file');
        resolve(file);
      };
      
      img.src = url;
    });
  } catch (error) {
    console.error('Error converting HEIC:', error);
    return file; // В случае ошибки возвращаем оригинальный файл
  }
}

/**
 * Создает превью для HEIC файла
 */
export async function createHeicPreview(file: File): Promise<string | null> {
  try {
    const isHeic = file.name.toLowerCase().endsWith('.heic') || 
                   file.name.toLowerCase().endsWith('.heif') ||
                   file.type === 'image/heic' ||
                   file.type === 'image/heif';
    
    if (!isHeic) {
      // Для обычных изображений просто создаем URL
      return URL.createObjectURL(file);
    }

    // Для HEIC создаем canvas превью
    const convertedFile = await convertHeicToJpeg(file);
    return URL.createObjectURL(convertedFile);
  } catch (error) {
    console.error('Error creating HEIC preview:', error);
    return null;
  }
}

