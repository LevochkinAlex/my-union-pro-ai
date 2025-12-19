/**
 * Утилита для работы с файловым хранилищем на VDS
 * Использует SSH/SCP для загрузки файлов на удаленный сервер
 */

import { exec } from "child_process";
import { promisify } from "util";
import path from "path";
import { writeFile, mkdir, readFile, unlink } from "fs/promises";
import { existsSync } from "fs";

const execAsync = promisify(exec);

/**
 * SECURITY: Санитизация пути файла для предотвращения command injection
 * Удаляет опасные символы и блокирует path traversal
 */
function sanitizeFileKey(fileKey: string): string {
  // Удаляем null bytes
  let sanitized = fileKey.replace(/\0/g, '');
  
  // Блокируем path traversal
  sanitized = sanitized.replace(/\.\.\//g, '').replace(/\.\./g, '');
  
  // Удаляем опасные shell символы
  sanitized = sanitized.replace(/[;|&$`\\!#*?<>{}()\[\]'"]/g, '');
  
  // Удаляем newlines и control characters
  sanitized = sanitized.replace(/[\r\n\t]/g, '');
  
  // Нормализуем множественные слеши
  sanitized = sanitized.replace(/\/+/g, '/');
  
  // Удаляем начальный слеш если есть
  sanitized = sanitized.replace(/^\/+/, '');
  
  // Ограничиваем длину
  if (sanitized.length > 500) {
    sanitized = sanitized.substring(0, 500);
  }
  
  // Проверяем что путь не пустой после санитизации
  if (!sanitized || sanitized === '/') {
    throw new Error('Invalid file key after sanitization');
  }
  
  return sanitized;
}

export interface VDSStorageConfig {
  host: string; // IP или домен VDS сервера
  user: string; // SSH пользователь (обычно root)
  password?: string; // SSH пароль (если используется)
  privateKey?: string; // Путь к приватному ключу SSH (альтернатива паролю)
  port?: number; // SSH порт (по умолчанию 22)
  remotePath: string; // Путь на VDS, куда загружать файлы (например, /var/www/uploads)
  publicUrl: string; // Публичный URL для доступа к файлам (например, https://files.example.com/uploads)
  useLocalFallback?: boolean; // Использовать локальное хранилище, если VDS недоступен
}

let vdsConfig: VDSStorageConfig | null = null;

/**
 * Инициализирует конфигурацию VDS хранилища
 */
export function initVDSStorage(config: VDSStorageConfig) {
  vdsConfig = config;
  console.log("[vds-storage] VDS storage initialized", {
    host: config.host,
    remotePath: config.remotePath,
    publicUrl: config.publicUrl,
  });
}

/**
 * Получает конфигурацию из переменных окружения
 */
export function getVDSConfigFromEnv(): VDSStorageConfig | null {
  const host = process.env.VDS_STORAGE_HOST || process.env.VDS_HOST;
  if (!host) {
    // В production выбрасываем ошибку, в development возвращаем null для более мягкой обработки
    if (process.env.NODE_ENV === "production") {
      throw new Error("VDS_STORAGE_HOST or VDS_HOST environment variable is required for production");
    }
    console.error("[vds-storage] VDS_STORAGE_HOST or VDS_HOST environment variable is required");
    return null;
  }
  const user = process.env.VDS_STORAGE_USER || process.env.VDS_USER || "root";
  const password = process.env.VDS_STORAGE_PASSWORD || process.env.VDS_PASSWORD;
  const privateKey = process.env.VDS_STORAGE_PRIVATE_KEY_PATH || process.env.VDS_PRIVATE_KEY;
  const port = process.env.VDS_STORAGE_PORT || process.env.VDS_PORT ? parseInt(process.env.VDS_STORAGE_PORT || process.env.VDS_PORT || "22") : 22;
  // Путь на VDS, где находится проект (обычно /opt/my-union-pro или /root/my-union-pro-ai)
  const projectPath = process.env.VDS_PROJECT_PATH || process.env.PROJECT_PATH || "/opt/my-union-pro";
  const remotePath = process.env.VDS_STORAGE_REMOTE_PATH || `${projectPath}/public/uploads`;
  const publicUrl = process.env.VDS_STORAGE_PUBLIC_URL || process.env.VDS_PUBLIC_URL || "https://myunion.pro/uploads";
  const useLocalFallback = false; // Отключаем локальный fallback - все должно быть на сервере

  if (!password && !privateKey) {
    // В production выбрасываем ошибку, в development возвращаем null для более мягкой обработки
    if (process.env.NODE_ENV === "production") {
      throw new Error("VDS storage credentials not provided (VDS_STORAGE_PASSWORD or VDS_STORAGE_PRIVATE_KEY_PATH required)");
    }
    console.error("[vds-storage] VDS storage credentials not provided (VDS_STORAGE_PASSWORD or VDS_STORAGE_PRIVATE_KEY_PATH required)");
    return null;
  }

  return {
    host,
    user,
    password,
    privateKey,
    port,
    remotePath,
    publicUrl,
    useLocalFallback,
  };
}

/**
 * Инициализирует хранилище из переменных окружения
 */
export function initVDSStorageFromEnv() {
  const config = getVDSConfigFromEnv();
  if (config) {
    initVDSStorage(config);
  }
}

/**
 * Создает SSH команду для выполнения на VDS
 */
function buildSSHCommand(command: string): string {
  if (!vdsConfig) {
    throw new Error("VDS storage not initialized");
  }

  const sshOptions: string[] = [
    "-o", "StrictHostKeyChecking=no",
    "-o", "UserKnownHostsFile=/dev/null",
    "-o", "ConnectTimeout=10",
  ];

  if (vdsConfig.privateKey) {
    sshOptions.push("-i", vdsConfig.privateKey);
  }

  if (vdsConfig.port && vdsConfig.port !== 22) {
    sshOptions.push("-p", vdsConfig.port.toString());
  }

  const sshTarget = `${vdsConfig.user}@${vdsConfig.host}`;
  
  if (vdsConfig.password) {
    // Используем sshpass для пароля (экранируем специальные символы)
    const escapedPassword = vdsConfig.password.replace(/'/g, "'\\''").replace(/\$/g, "\\$");
    return `sshpass -p '${escapedPassword}' ssh ${sshOptions.join(" ")} ${sshTarget} '${command.replace(/'/g, "'\\''")}'`;
  } else {
    return `ssh ${sshOptions.join(" ")} ${sshTarget} '${command.replace(/'/g, "'\\''")}'`;
  }
}

/**
 * Создает SCP команду для копирования файла на VDS
 */
function buildSCPCommand(localPath: string, remotePath: string): string {
  if (!vdsConfig) {
    throw new Error("VDS storage not initialized");
  }

  const scpOptions: string[] = [
    "-o", "StrictHostKeyChecking=no",
    "-o", "UserKnownHostsFile=/dev/null",
    "-o", "ConnectTimeout=10",
  ];

  if (vdsConfig.privateKey) {
    scpOptions.push("-i", vdsConfig.privateKey);
  }

  if (vdsConfig.port && vdsConfig.port !== 22) {
    scpOptions.push("-P", vdsConfig.port.toString());
  }

  const remoteTarget = `${vdsConfig.user}@${vdsConfig.host}:${remotePath}`;
  
  if (vdsConfig.password) {
    // Используем sshpass для пароля
    return `sshpass -p '${vdsConfig.password.replace(/'/g, "'\\''")}' scp ${scpOptions.join(" ")} '${localPath}' '${remoteTarget}'`;
  } else {
    return `scp ${scpOptions.join(" ")} '${localPath}' '${remoteTarget}'`;
  }
}

/**
 * Создает директорию на VDS, если её нет
 */
async function ensureRemoteDirectory(remoteDir: string): Promise<void> {
  if (!vdsConfig) {
    throw new Error("VDS storage not initialized");
  }

  try {
    const command = buildSSHCommand(`mkdir -p '${remoteDir}'`);
    await execAsync(command);
  } catch (error) {
    console.error("[vds-storage] Error creating remote directory:", error);
    throw new Error(`Failed to create remote directory: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Загружает файл на VDS
 */
export async function uploadFileToVDS(
  fileKey: string, // Путь к файлу относительно remotePath (например, "documents/user123/file.pdf")
  buffer: Buffer,
  contentType?: string
): Promise<string> {
  // SECURITY: Санитизация пути
  fileKey = sanitizeFileKey(fileKey);
  
  if (!vdsConfig) {
    // Если VDS не настроен, используем локальное хранилище
    if (vdsConfig?.useLocalFallback) {
      return uploadFileLocally(fileKey, buffer);
    }
    throw new Error("VDS storage not initialized. Call initVDSStorage() or initVDSStorageFromEnv() first.");
  }

  // ВСЕГДА сначала пытаемся сохранить напрямую (если мы на VDS)
  // Это быстрее и надежнее, чем SCP
  const directPath = path.join(vdsConfig.remotePath, fileKey).replace(/\\/g, "/");
  const directDir = path.dirname(directPath);
  
  try {
    // Пытаемся создать директорию и сохранить файл напрямую
    await mkdir(directDir, { recursive: true });
    await writeFile(directPath, buffer);
    
    // Проверяем, что файл действительно записался
    if (existsSync(directPath)) {
      const stats = await require("fs/promises").stat(directPath);
      if (stats.size === buffer.length) {
        const relativePath = `/uploads/${fileKey}`;
        console.log("[vds-storage] ✅ File saved directly and verified:", directPath, `(${stats.size} bytes)`);
        return relativePath;
      } else {
        throw new Error(`File size mismatch: expected ${buffer.length}, got ${stats.size}`);
      }
    } else {
      throw new Error("File was not created");
    }
  } catch (directError: any) {
    // Если прямой путь не работает (ENOENT, EACCES и т.д.), используем SCP
    // Это означает, что мы не на VDS или нет доступа к remotePath
    const errorCode = directError?.code;
    console.log(`[vds-storage] Direct save failed (${errorCode}), using SCP fallback:`, directError.message);
  }

  // Fallback: используем SCP для загрузки на удаленный сервер
  try {
    // Создаем временный локальный файл для SCP передачи
    const tempDir = path.join(process.cwd(), "tmp", "uploads");
    await mkdir(tempDir, { recursive: true });
    
    const tempFileName = `${Date.now()}_${path.basename(fileKey)}`;
    const tempFilePath = path.join(tempDir, tempFileName);
    
    await writeFile(tempFilePath, buffer);

    // Определяем путь на удаленном сервере
    const remoteFilePath = path.join(vdsConfig.remotePath, fileKey).replace(/\\/g, "/");
    const remoteDir = path.dirname(remoteFilePath).replace(/\\/g, "/");

    // Создаем директорию на VDS
    await ensureRemoteDirectory(remoteDir);

    // Копируем файл на VDS с retry логикой
    const scpCommand = buildSCPCommand(tempFilePath, remoteFilePath);
    let lastError: Error | null = null;
    const maxRetries = 3;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        await execAsync(scpCommand);
        console.log(`[vds-storage] ✅ File uploaded via SCP (attempt ${attempt})`);
        break; // Успешно загружено
      } catch (scpError) {
        lastError = scpError instanceof Error ? scpError : new Error(String(scpError));
        console.warn(`[vds-storage] SCP upload attempt ${attempt} failed:`, lastError.message);
        
        if (attempt < maxRetries) {
          // Ждем перед следующей попыткой (экспоненциальная задержка)
          const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
          await new Promise(resolve => setTimeout(resolve, delay));
        } else {
          throw lastError;
        }
      }
    }

    // Удаляем временный файл
    try {
      await unlink(tempFilePath);
    } catch (e) {
      // Игнорируем ошибки удаления временного файла
    }

    // Возвращаем относительный путь для использования через API роуты
    // Файл будет доступен через /api/uploads/{category}/{filename}
    // Формат: /uploads/posts/filename.jpg
    const relativePath = `/uploads/${fileKey}`;
    console.log("[vds-storage] File uploaded successfully to VDS:", fileKey);
    console.log("[vds-storage] File will be served via API route:", relativePath);
    
    return relativePath;
  } catch (error) {
    console.error("[vds-storage] Error uploading file to VDS:", error);
    
    // Если включен fallback на локальное хранилище
    if (vdsConfig.useLocalFallback) {
      console.warn("[vds-storage] Falling back to local storage");
      return uploadFileLocally(fileKey, buffer);
    }
    
    throw new Error(`Failed to upload file to VDS: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Сохраняет файл напрямую на VDS (когда код уже запущен на VDS)
 */
async function saveFileDirectlyOnVDS(fileKey: string, buffer: Buffer): Promise<string> {
  if (!vdsConfig) {
    throw new Error("VDS storage not initialized");
  }

  const filePath = path.join(vdsConfig.remotePath, fileKey).replace(/\\/g, "/");
  const fileDir = path.dirname(filePath);
  
  // Создаем директорию локально (мы уже на VDS)
  await mkdir(fileDir, { recursive: true });
  
  // Сохраняем файл напрямую
  await writeFile(filePath, buffer);
  
  const relativePath = `/uploads/${fileKey}`;
  console.log("[vds-storage] File saved directly on VDS:", filePath);
  console.log("[vds-storage] File will be served via:", relativePath);
  
  return relativePath;
}

/**
 * Загружает файл локально (fallback)
 */
async function uploadFileLocally(fileKey: string, buffer: Buffer): Promise<string> {
  const localPath = path.join(process.cwd(), "public", "uploads", fileKey);
  const localDir = path.dirname(localPath);
  
  await mkdir(localDir, { recursive: true });
  await writeFile(localPath, buffer);
  
  return `/uploads/${fileKey}`;
}

/**
 * Получает файл с VDS (через HTTP или скачивание через SCP)
 */
export async function getFileFromVDS(fileKey: string): Promise<Buffer> {
  // SECURITY: Санитизация пути
  fileKey = sanitizeFileKey(fileKey);
  
  if (!vdsConfig) {
    throw new Error("VDS storage not initialized");
  }

  // Если мы уже НА VDS сервере, читаем файл напрямую
  if (isRunningOnVDS()) {
    console.log("[vds-storage] Running on VDS, reading file directly");
    const filePath = path.join(vdsConfig.remotePath, fileKey).replace(/\\/g, "/");
    
    if (existsSync(filePath)) {
      const buffer = await readFile(filePath);
      console.log("[vds-storage] File read directly from VDS, size:", buffer.length);
      return buffer;
    } else {
      throw new Error(`File not found on VDS: ${filePath}`);
    }
  }

  // Если файл доступен через HTTP, скачиваем его
  const fileUrl = `${vdsConfig.publicUrl}/${fileKey}`;
  
  console.log("[vds-storage] Attempting to fetch file via HTTP:", fileUrl);
  try {
    const response = await fetch(fileUrl);
    if (!response.ok) {
      console.error(`[vds-storage] HTTP fetch failed: ${response.status} ${response.statusText}`);
      throw new Error(`Failed to fetch file: ${response.status} ${response.statusText}`);
    }
    
    const arrayBuffer = await response.arrayBuffer();
    console.log("[vds-storage] File fetched successfully via HTTP, size:", arrayBuffer.byteLength);
    return Buffer.from(arrayBuffer);
  } catch (error) {
    console.error("[vds-storage] Error fetching file via HTTP, trying SCP:", error);
    console.error("[vds-storage] File URL was:", fileUrl);
    
    // Fallback: скачиваем через SCP
    try {
      const remoteFilePath = path.join(vdsConfig.remotePath, fileKey).replace(/\\/g, "/");
      console.log("[vds-storage] Attempting to download via SCP from:", remoteFilePath);
      
      const tempDir = path.join(process.cwd(), "tmp", "downloads");
      await mkdir(tempDir, { recursive: true });
      
      const tempFileName = `${Date.now()}_${path.basename(fileKey)}`;
      const tempFilePath = path.join(tempDir, tempFileName);
      
      // Скачиваем файл через SCP (обратный порядок)
      const scpCommand = buildSCPCommand(
        `${vdsConfig.user}@${vdsConfig.host}:${remoteFilePath}`,
        tempFilePath
      );
      console.log("[vds-storage] Executing SCP command...");
      await execAsync(scpCommand);
      
      const buffer = await readFile(tempFilePath);
      console.log("[vds-storage] File downloaded successfully via SCP, size:", buffer.length);
      
      // Удаляем временный файл
      try {
        await unlink(tempFilePath);
      } catch (e) {
        // Игнорируем ошибки
      }
      
      return buffer;
    } catch (scpError) {
      console.error("[vds-storage] SCP download also failed:", scpError);
      console.error("[vds-storage] Remote file path was:", path.join(vdsConfig.remotePath, fileKey));
      throw new Error(`Failed to get file from VDS (HTTP and SCP both failed): ${scpError instanceof Error ? scpError.message : String(scpError)}`);
    }
  }
}

/**
 * Удаляет файл с VDS
 */
export async function deleteFileFromVDS(fileKey: string): Promise<void> {
  // SECURITY: Санитизация пути
  fileKey = sanitizeFileKey(fileKey);
  
  if (!vdsConfig) {
    throw new Error("VDS storage not initialized");
  }

  const remoteFilePath = path.join(vdsConfig.remotePath, fileKey).replace(/\\/g, "/");

  // Если мы на VDS, удаляем напрямую
  if (isRunningOnVDS()) {
    try {
      await unlink(remoteFilePath);
      console.log("[vds-storage] File deleted directly on VDS:", fileKey);
    } catch (error) {
      // Игнорируем ошибку, если файл не существует
      console.warn("[vds-storage] File may not exist:", fileKey);
    }
    return;
  }

  try {
    const command = buildSSHCommand(`rm -f '${remoteFilePath}'`);
    await execAsync(command);
    console.log("[vds-storage] File deleted successfully:", fileKey);
  } catch (error) {
    console.error("[vds-storage] Error deleting file from VDS:", error);
    throw new Error(`Failed to delete file from VDS: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Проверяет существование файла на VDS
 */
export async function fileExistsOnVDS(fileKey: string): Promise<boolean> {
  // SECURITY: Санитизация пути
  try {
    fileKey = sanitizeFileKey(fileKey);
  } catch {
    return false;
  }
  
  if (!vdsConfig) {
    return false;
  }

  const remoteFilePath = path.join(vdsConfig.remotePath, fileKey).replace(/\\/g, "/");

  // Если мы на VDS, проверяем напрямую
  if (isRunningOnVDS()) {
    return existsSync(remoteFilePath);
  }

  try {
    const command = buildSSHCommand(`test -f '${remoteFilePath}' && echo 'exists' || echo 'not found'`);
    const { stdout } = await execAsync(command);
    return stdout.trim() === "exists";
  } catch (error) {
    console.error("[vds-storage] Error checking file existence:", error);
    return false;
  }
}

/**
 * Получает публичный URL файла
 */
export function getPublicUrl(fileKey: string): string | null {
  if (!vdsConfig) {
    return null;
  }

  return `${vdsConfig.publicUrl}/${fileKey}`;
}

/**
 * Определяет, настроено ли VDS хранилище
 */
export function isVDSStorageConfigured(): boolean {
  return vdsConfig !== null;
}

/**
 * Проверяет, запущен ли код на самом VDS сервере
 * В этом случае файлы сохраняются напрямую, без SCP
 */
export function isRunningOnVDS(): boolean {
  // Если установлена переменная окружения VDS_IS_LOCAL=true, значит мы на VDS
  if (process.env.VDS_IS_LOCAL === "true") {
    return true;
  }
  
  // Также проверяем по hostname или NEXTAUTH_URL
  const nextAuthUrl = process.env.NEXTAUTH_URL || "";
  if (nextAuthUrl.includes("myunion.pro") && !nextAuthUrl.includes("localhost")) {
    return true;
  }
  
  return false;
}

