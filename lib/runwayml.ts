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
const API_BASE_URL = "https://api.dev.runwayml.com";

export async function generateImageWithRunwayML(
  config: RunwayMLConfig,
  request: RunwayMLGenerateRequest
): Promise<RunwayMLTask> {
  const { apiKey, apiVersion = DEFAULT_API_VERSION } = config;

  if (!apiKey) {
    throw new Error("RunwayML API key is required");
  }

  try {
    // Формируем body для запроса
    // Для gen4_image referenceImages обязателен и должен содержать минимум 1 элемент
    // Используем placeholder изображение, если referenceImages не предоставлен
    const body: any = {
      model: "gen4_image",
      promptText: request.prompt,
      ratio: request.aspectRatio || (request.width && request.height ? `${request.width}:${request.height}` : "1024:1024"),
      referenceImages: [
        {
          uri: "https://upload.wikimedia.org/wikipedia/commons/thumb/4/47/PNG_transparency_demonstration_1.png/280px-PNG_transparency_demonstration_1.png",
          tag: "reference"
        }
      ],
    };
    
    if (request.seed !== undefined) {
      body.seed = request.seed;
    }
    
    // Запускаем генерацию изображения
    const response = await fetch(`${API_BASE_URL}/v1/text_to_image`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
        "X-Runway-Version": apiVersion,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      let errorData;
      try {
        errorData = JSON.parse(errorText);
      } catch {
        errorData = { error: errorText || response.statusText };
      }
      const errorMessage = errorData.error?.message || errorData.error || errorData.issues?.[0]?.message || `RunwayML API error: ${response.statusText}`;
      console.error("[runwayml] API Error:", {
        status: response.status,
        statusText: response.statusText,
        error: errorData,
        body: JSON.stringify(body, null, 2),
      });
      throw new Error(errorMessage);
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
    const response = await fetch(`${API_BASE_URL}/v1/tasks/${taskId}`, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "X-Runway-Version": apiVersion,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      let errorData;
      try {
        errorData = JSON.parse(errorText);
      } catch {
        errorData = { error: errorText || response.statusText };
      }
      const errorMessage = errorData.error?.message || errorData.error || errorData.issues?.[0]?.message || `RunwayML API error: ${response.statusText}`;
      console.error("[runwayml] Task Status API Error:", {
        status: response.status,
        statusText: response.statusText,
        error: errorData,
        taskId,
      });
      throw new Error(errorMessage);
    }

    const data = await response.json();
    
    // Преобразуем статус из RunwayML в наш формат
    let status: "pending" | "processing" | "completed" | "failed" = "pending";
    if (data.status === "SUCCEEDED") {
      status = "completed";
    } else if (data.status === "FAILED" || data.status === "ABORTED") {
      status = "failed";
    } else if (data.status === "RUNNING") {
      status = "processing";
    } else if (data.status === "PENDING") {
      status = "pending";
    }
    
    return {
      id: taskId,
      status,
      result: data.output && data.output[0] ? { imageUrl: data.output[0] } : data.result,
      error: data.error || (status === "failed" ? "Task failed" : undefined),
    };
  } catch (error: any) {
    console.error("[runwayml] Error getting task status:", error);
    throw error;
  }
}
