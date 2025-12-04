/**
 * Сжатие изображений перед загрузкой
 */

export async function compressImage(file: File, maxWidth = 1920, quality = 0.85): Promise<File> {
  // Если файл не изображение, возвращаем как есть
  if (!file.type.startsWith("image/")) {
    return file;
  }

  // Если файл уже маленький (< 1MB), не сжимаем
  if (file.size < 1024 * 1024) {
    return file;
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = (e) => {
      const img = new Image();
      
      img.onload = () => {
        try {
          // Вычисляем новые размеры
          let width = img.width;
          let height = img.height;
          
          if (width > maxWidth) {
            height = (height * maxWidth) / width;
            width = maxWidth;
          }
          
          // Создаем canvas
          const canvas = document.createElement("canvas");
          canvas.width = width;
          canvas.height = height;
          
          const ctx = canvas.getContext("2d");
          if (!ctx) {
            reject(new Error("Failed to get canvas context"));
            return;
          }
          
          // Рисуем изображение с новыми размерами
          ctx.drawImage(img, 0, 0, width, height);
          
          // Конвертируем в blob
          canvas.toBlob(
            (blob) => {
              if (!blob) {
                reject(new Error("Failed to compress image"));
                return;
              }
              
              // Создаем новый File объект
              const compressedFile = new File([blob], file.name, {
                type: file.type,
                lastModified: Date.now(),
              });
              
              console.log(`[compress-image] Сжато: ${(file.size / 1024 / 1024).toFixed(2)}MB → ${(compressedFile.size / 1024 / 1024).toFixed(2)}MB`);
              resolve(compressedFile);
            },
            file.type,
            quality
          );
        } catch (error) {
          console.error("[compress-image] Error:", error);
          // В случае ошибки возвращаем оригинальный файл
          resolve(file);
        }
      };
      
      img.onerror = () => {
        console.warn("[compress-image] Failed to load image, returning original");
        resolve(file);
      };
      
      img.src = e.target?.result as string;
    };
    
    reader.onerror = () => {
      console.error("[compress-image] Failed to read file");
      resolve(file);
    };
    
    reader.readAsDataURL(file);
  });
}

/**
 * Сжимает массив файлов (только изображения)
 */
export async function compressImages(files: File[]): Promise<File[]> {
  const compressedFiles = await Promise.all(
    files.map(file => compressImage(file))
  );
  return compressedFiles;
}

