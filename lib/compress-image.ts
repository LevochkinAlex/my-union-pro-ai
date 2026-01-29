/**
 * Сжатие изображений перед загрузкой (как в WhatsApp).
 * Большие фото сжимаются до разумного размера и конвертируются в JPEG.
 */

const MIN_SIZE_TO_COMPRESS = 512 * 1024; // 500 KB — сжимаем всё что больше
const DEFAULT_MAX_WIDTH = 1920;
const DEFAULT_QUALITY = 0.85;

export async function compressImage(
  file: File,
  maxWidth = DEFAULT_MAX_WIDTH,
  quality = DEFAULT_QUALITY
): Promise<File> {
  if (!file.type.startsWith("image/")) return file;
  // GIF не сжимаем — сохраняем анимацию
  if (file.type === "image/gif") return file;
  if (file.size < MIN_SIZE_TO_COMPRESS) return file;

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        try {
          let width = img.width;
          let height = img.height;
          if (width > maxWidth) {
            height = (height * maxWidth) / width;
            width = maxWidth;
          }
          const canvas = document.createElement("canvas");
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext("2d");
          if (!ctx) {
            reject(new Error("Failed to get canvas context"));
            return;
          }
          ctx.drawImage(img, 0, 0, width, height);
          // JPEG даёт лучшее сжатие для фото (как в WhatsApp)
          const outputType = "image/jpeg";
          const baseName = (file.name || "image").replace(/\.[^.]+$/i, "") || "image";
          const newName = `${baseName}.jpg`;
          canvas.toBlob(
            (blob) => {
              if (!blob) {
                reject(new Error("Failed to compress image"));
                return;
              }
              const compressedFile = new File([blob], newName, {
                type: outputType,
                lastModified: Date.now(),
              });
              const saved = ((1 - compressedFile.size / file.size) * 100).toFixed(0);
              console.log(
                `[compress-image] ${(file.size / 1024 / 1024).toFixed(2)}MB → ${(compressedFile.size / 1024 / 1024).toFixed(2)}MB (-${saved}%)`
              );
              resolve(compressedFile);
            },
            outputType,
            quality
          );
        } catch (error) {
          console.error("[compress-image] Error:", error);
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

