/**
 * Тестовый скрипт для проверки RunwayML API
 */

import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Загружаем переменные окружения
dotenv.config({ path: join(__dirname, "..", ".env.local") });
dotenv.config({ path: join(__dirname, "..", ".env") });

const RUNWAYML_API_KEY = process.env.RUNWAYML_API_KEY;
const RUNWAYML_API_VERSION = process.env.RUNWAYML_API_VERSION || "2024-11-06";
const API_BASE_URL = "https://api.dev.runwayml.com";

console.log("🧪 Тестирование RunwayML API");
console.log("==============================");
console.log(`API Key: ${RUNWAYML_API_KEY ? RUNWAYML_API_KEY.substring(0, 20) + "..." : "НЕ НАЙДЕН"}`);
console.log(`API Version: ${RUNWAYML_API_VERSION}`);
console.log(`Base URL: ${API_BASE_URL}`);
console.log("");

if (!RUNWAYML_API_KEY) {
  console.error("❌ Ошибка: RUNWAYML_API_KEY не найден в переменных окружения");
  process.exit(1);
}

async function testGenerateImage() {
  try {
    console.log("📤 Отправляем запрос на генерацию изображения...");
    console.log("Промпт: 'A beautiful sunset over mountains'");
    
    const response = await fetch(`${API_BASE_URL}/v1/text_to_image`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${RUNWAYML_API_KEY}`,
        "X-Runway-Version": RUNWAYML_API_VERSION,
      },
      body: JSON.stringify({
        model: "gen4_image",
        promptText: "A beautiful sunset over mountains",
        ratio: "1024:1024",
        referenceImages: [{
          uri: "https://upload.wikimedia.org/wikipedia/commons/thumb/4/47/PNG_transparency_demonstration_1.png/280px-PNG_transparency_demonstration_1.png",
          tag: "reference"
        }],
      }),
    });

    console.log(`Статус ответа: ${response.status} ${response.statusText}`);
    
    if (!response.ok) {
      const text = await response.text();
      let errorData;
      try {
        errorData = JSON.parse(text);
      } catch {
        errorData = { error: text };
      }
      console.error("❌ Ошибка API:", JSON.stringify(errorData, null, 2));
      return null;
    }

    const data = await response.json();
    console.log("✅ Запрос успешен!");
    console.log("Ответ:", JSON.stringify(data, null, 2));
    
    if (data.taskId || data.id) {
      const taskId = data.taskId || data.id;
      console.log(`\n📋 Task ID: ${taskId}`);
      console.log("⏳ Ожидаем завершения генерации...");
      
      // Проверяем статус задачи
      await checkTaskStatus(taskId);
    }
    
    return data;
  } catch (error) {
    console.error("❌ Ошибка при запросе:", error.message);
    if (error.stack) {
      console.error("Stack:", error.stack);
    }
    return null;
  }
}

async function checkTaskStatus(taskId) {
  let attempts = 0;
  const maxAttempts = 12; // 1 минута максимум (12 * 5 секунд)
  
  while (attempts < maxAttempts) {
    await new Promise(resolve => setTimeout(resolve, 5000)); // Ждем 5 секунд
    
    try {
      const response = await fetch(`${API_BASE_URL}/v1/tasks/${taskId}`, {
        method: "GET",
        headers: {
          "Authorization": `Bearer ${RUNWAYML_API_KEY}`,
          "X-Runway-Version": RUNWAYML_API_VERSION,
        },
      });

      if (!response.ok) {
        let errorData;
        try {
          errorData = await response.json();
        } catch {
          const text = await response.text();
          errorData = { error: text };
        }
        console.error("❌ Ошибка при проверке статуса:", JSON.stringify(errorData, null, 2));
        return;
      }

      const data = await response.json();
      const status = data.status || data.task?.status;
      
      console.log(`\n[Попытка ${attempts + 1}/${maxAttempts}] Статус: ${status}`);
      
      if (status === "SUCCEEDED" || status === "completed") {
        console.log("✅ Генерация завершена!");
        console.log("Результат:", JSON.stringify(data, null, 2));
        if (data.output && data.output[0]) {
          console.log(`\n🖼️ Изображение: ${data.output[0]}`);
        } else if (data.result?.imageUrl || data.imageUrl) {
          console.log(`\n🖼️ Изображение: ${data.result?.imageUrl || data.imageUrl}`);
        }
        return;
      } else if (status === "FAILED" || status === "ABORTED" || status === "failed") {
        console.error("❌ Генерация не удалась");
        console.error("Ошибка:", data.error || data.message || "Unknown error");
        return;
      } else if (status === "RUNNING" || status === "PENDING" || status === "processing" || status === "pending") {
        console.log("⏳ Генерация в процессе...");
      }
      
      attempts++;
    } catch (error) {
      console.error("❌ Ошибка при проверке статуса:", error.message);
      attempts++;
    }
  }
  
  console.log("⏱️ Превышено время ожидания");
}

// Запускаем тест
testGenerateImage()
  .then(() => {
    console.log("\n✅ Тест завершен");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n❌ Тест завершился с ошибкой:", error);
    process.exit(1);
  });

