/**
 * Утилиты для работы с файлами и их отображением
 */

/**
 * Определяет, является ли файл изображением
 */
export function isImageFile(fileName: string, mimeType?: string | null): boolean {
  if (mimeType?.startsWith("image/")) return true;
  return ["jpg", "jpeg", "png", "gif", "webp", "svg", "bmp"].some(ext => 
    fileName.toLowerCase().endsWith(`.${ext}`)
  );
}

/**
 * Определяет, является ли файл видео
 */
export function isVideoFile(fileName: string, mimeType?: string | null): boolean {
  if (mimeType?.startsWith("video/")) return true;
  return ["mp4", "webm", "ogg", "mov", "avi", "mkv"].some(ext => 
    fileName.toLowerCase().endsWith(`.${ext}`)
  );
}

/**
 * Определяет, является ли файл аудио
 */
export function isAudioFile(fileName: string, mimeType?: string | null): boolean {
  if (mimeType?.startsWith("audio/")) return true;
  return ["mp3", "wav", "ogg", "aac", "flac", "m4a"].some(ext => 
    fileName.toLowerCase().endsWith(`.${ext}`)
  );
}

/**
 * Определяет, является ли файл документом (PDF, DOC, DOCX и т.д.)
 */
export function isDocumentFile(fileName: string, mimeType?: string | null): boolean {
  const docMimeTypes = [
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.ms-powerpoint",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "text/plain",
  ];
  
  if (mimeType && docMimeTypes.includes(mimeType)) return true;
  
  return ["pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "txt", "rtf"].some(ext => 
    fileName.toLowerCase().endsWith(`.${ext}`)
  );
}

/**
 * Получает иконку для типа файла
 */
export function getFileIcon(fileName: string, mimeType?: string | null): string {
  if (isImageFile(fileName, mimeType)) return "image";
  if (isVideoFile(fileName, mimeType)) return "video";
  if (isAudioFile(fileName, mimeType)) return "audio";
  if (isDocumentFile(fileName, mimeType)) return "document";
  return "file";
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

/**
 * Получает расширение файла
 */
export function getFileExtension(fileName: string): string {
  const lastDot = fileName.lastIndexOf(".");
  if (lastDot === -1 || lastDot === fileName.length - 1) return "";
  return fileName.substring(lastDot + 1).toLowerCase();
}

/**
 * Получает имя файла без расширения
 */
export function getFileNameWithoutExtension(fileName: string): string {
  const lastDot = fileName.lastIndexOf(".");
  if (lastDot === -1) return fileName;
  return fileName.substring(0, lastDot);
}

/**
 * Проверяет, является ли расширение файла опасным (исполняемые файлы)
 */
export function isDangerousExtension(fileName: string): boolean {
  const dangerousExtensions = [".exe", ".bat", ".cmd", ".sh", ".ps1", ".js", ".jar", ".app", ".deb", ".rpm", ".dmg"];
  const ext = getFileExtension(fileName);
  return dangerousExtensions.includes(`.${ext}`);
}

