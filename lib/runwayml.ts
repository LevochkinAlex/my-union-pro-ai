/**
 * RunwayML API интеграция
 */

export interface RunwayMLConfig {
  apiKey: string;
  apiVersion?: string;
}

export interface RunwayMLGenerateRequest {
  prompt: string;
  width?: number;
  height?: number;
  aspectRatio?: string;
  seed?: number;
}

export interface RunwayMLTask {
  id: string;
  status: "pending" | "processing" | "completed" | "failed";
  result?: {
    imageUrl?: string;
    image?: string; // base64
  };
  error?: string;
}

const DEFAULT_API_VERSION = "2024-11-06";
const API_BASE_URL = "https://api.dev.runwayml.com/v1";

export async function generateImageWithRunwayML(
  config: RunwayMLConfig,
  request: RunwayMLGenerateRequest
): Promise<RunwayMLTask> {
  const { apiKey, apiVersion = DEFAULT_API_VERSION } = config;

  if (!apiKey) {
    throw new Error("RunwayML API key is required");
  }

  try {
    // Запускаем генерацию изображения
    const response = await fetch(`${API_BASE_URL}/image/generate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
        "X-API-Version": apiVersion,
      },
      body: JSON.stringify({
        prompt: request.prompt,
        width: request.width || 1024,
        height: request.height || 1024,
        aspectRatio: request.aspectRatio,
        seed: request.seed,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error?.message || `RunwayML API error: ${response.statusText}`);
    }

    const data = await response.json();
    return {
      id: data.taskId || data.id,
      status: "pending",
    };
  } catch (error: any) {
    console.error("[runwayml] Error generating image:", error);
    throw error;
  }
}

export async function getRunwayMLTaskStatus(
  config: RunwayMLConfig,
  taskId: string
): Promise<RunwayMLTask> {
  const { apiKey, apiVersion = DEFAULT_API_VERSION } = config;

  if (!apiKey) {
    throw new Error("RunwayML API key is required");
  }

  try {
    const response = await fetch(`${API_BASE_URL}/tasks/${taskId}`, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "X-API-Version": apiVersion,
      },
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error?.message || `RunwayML API error: ${response.statusText}`);
    }

    const data = await response.json();
    return {
      id: taskId,
      status: data.status || "pending",
      result: data.result,
      error: data.error,
    };
  } catch (error: any) {
    console.error("[runwayml] Error getting task status:", error);
    throw error;
  }
}

