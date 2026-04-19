/**
 * Утилиты для работы с файлами и их отображением
 */

/**
 * Определяет, является ли файл изображением
 */
export function isImageFile(fileName: string, mimeType?: string | null): boolean {
  if (mimeType?.startsWith("image/")) return true;
  return ["jpg", "jpeg", "png", "gif", "webp", "svg", "bmp"].some((ext) =>
    fileName.toLowerCase().endsWith(`.${ext}`),
  );
}

/**
 * Форматирует размер файла в читаемый вид
 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + " Б";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " КБ";
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + " МБ";
  return (bytes / (1024 * 1024 * 1024)).toFixed(2) + " ГБ";
}
