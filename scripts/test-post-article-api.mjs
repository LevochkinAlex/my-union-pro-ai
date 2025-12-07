#!/usr/bin/env node

/**
 * Тестовый скрипт для проверки API публикации статьи
 * Проверяет:
 * 1. Статья с картинкой-обложкой
 * 2. Статья с видео-обложкой
 * 3. Статья без обложки
 * 4. Статья с HTML контентом и изображениями внутри
 */

import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { readFileSync } from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Загружаем переменные окружения
dotenv.config({ path: join(__dirname, "..", ".env.local") });

const API_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3004";
const TEST_EMAIL = process.env.TEST_EMAIL || "test@example.com";
const TEST_PASSWORD = process.env.TEST_PASSWORD || "test123";

console.log("🧪 Тестирование API публикации статьи\n");
console.log(`API URL: ${API_URL}`);
console.log(`Test Email: ${TEST_EMAIL}\n`);

// Функция для получения сессии
async function getSession() {
  try {
    const response = await fetch(`${API_URL}/api/auth/signin`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email: TEST_EMAIL,
        password: TEST_PASSWORD,
      }),
    });

    if (!response.ok) {
      throw new Error(`Failed to sign in: ${response.status}`);
    }

    const cookies = response.headers.get("set-cookie");
    return cookies;
  } catch (error) {
    console.error("❌ Ошибка при получении сессии:", error.message);
    console.log("\n⚠️  Пропускаем тесты, требующие авторизации");
    return null;
  }
}

// Функция для создания тестового изображения (base64)
function createTestImageBase64() {
  // Минимальный валидный PNG 1x1 пиксель
  const pngBase64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
  return `data:image/png;base64,${pngBase64}`;
}

// Тест 1: Статья с картинкой-обложкой
async function testArticleWithImageCover(sessionCookie) {
  console.log("📝 Тест 1: Статья с картинкой-обложкой");
  
  const formData = new FormData();
  formData.append("content", "<p>Тестовая статья с обложкой-картинкой</p>");
  formData.append("postType", "article");
  formData.append("coverImage", createTestImageBase64());

  try {
    const response = await fetch(`${API_URL}/api/posts`, {
      method: "POST",
      headers: {
        Cookie: sessionCookie || "",
      },
      body: formData,
    });

    const data = await response.json();

    if (response.ok) {
      console.log("✅ Успешно создана статья с обложкой-картинкой");
      console.log(`   Post ID: ${data.post?.id}`);
      console.log(`   Cover Image: ${data.post?.coverImage || "не установлена"}`);
      return true;
    } else {
      console.log(`❌ Ошибка: ${data.error || response.status}`);
      console.log(`   Детали: ${JSON.stringify(data, null, 2)}`);
      return false;
    }
  } catch (error) {
    console.log(`❌ Исключение: ${error.message}`);
    return false;
  }
}

// Тест 2: Статья с видео-обложкой
async function testArticleWithVideoCover(sessionCookie) {
  console.log("\n📹 Тест 2: Статья с видео-обложкой");
  
  const formData = new FormData();
  formData.append("content", "<p>Тестовая статья с обложкой-видео</p>");
  formData.append("postType", "article");
  
  const videoMetadata = {
    videoType: "youtube",
    videoId: "dQw4w9WgXcQ",
    embedUrl: "https://www.youtube.com/embed/dQw4w9WgXcQ",
    url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
  };
  formData.append("videoMetadata", JSON.stringify(videoMetadata));

  try {
    const response = await fetch(`${API_URL}/api/posts`, {
      method: "POST",
      headers: {
        Cookie: sessionCookie || "",
      },
      body: formData,
    });

    const data = await response.json();

    if (response.ok) {
      console.log("✅ Успешно создана статья с обложкой-видео");
      console.log(`   Post ID: ${data.post?.id}`);
      console.log(`   Video Metadata: ${data.post?.videoMetadata ? "установлена" : "не установлена"}`);
      if (data.post?.videoMetadata) {
        const vm = typeof data.post.videoMetadata === "string" 
          ? JSON.parse(data.post.videoMetadata) 
          : data.post.videoMetadata;
        console.log(`   Video Type: ${vm.videoType}`);
        console.log(`   Video ID: ${vm.videoId}`);
      }
      return true;
    } else {
      console.log(`❌ Ошибка: ${data.error || response.status}`);
      console.log(`   Детали: ${JSON.stringify(data, null, 2)}`);
      return false;
    }
  } catch (error) {
    console.log(`❌ Исключение: ${error.message}`);
    return false;
  }
}

// Тест 3: Статья без обложки
async function testArticleWithoutCover(sessionCookie) {
  console.log("\n📄 Тест 3: Статья без обложки");
  
  const formData = new FormData();
  formData.append("content", "<p>Тестовая статья без обложки</p><p>Просто текст.</p>");
  formData.append("postType", "article");

  try {
    const response = await fetch(`${API_URL}/api/posts`, {
      method: "POST",
      headers: {
        Cookie: sessionCookie || "",
      },
      body: formData,
    });

    const data = await response.json();

    if (response.ok) {
      console.log("✅ Успешно создана статья без обложки");
      console.log(`   Post ID: ${data.post?.id}`);
      console.log(`   Cover Image: ${data.post?.coverImage || "не установлена"}`);
      return true;
    } else {
      console.log(`❌ Ошибка: ${data.error || response.status}`);
      console.log(`   Детали: ${JSON.stringify(data, null, 2)}`);
      return false;
    }
  } catch (error) {
    console.log(`❌ Исключение: ${error.message}`);
    return false;
  }
}

// Тест 4: Статья с HTML контентом и изображениями внутри
async function testArticleWithInlineImages(sessionCookie) {
  console.log("\n🖼️  Тест 4: Статья с HTML и изображениями внутри");
  
  const formData = new FormData();
  const htmlContent = `
    <h1>Заголовок статьи</h1>
    <p>Первый параграф с <strong>жирным текстом</strong>.</p>
    <p>Второй параграф с <em>курсивом</em>.</p>
    <img src="https://via.placeholder.com/300x200" alt="Placeholder" />
    <p>Третий параграф после изображения.</p>
  `;
  formData.append("content", htmlContent);
  formData.append("postType", "article");
  formData.append("coverImage", createTestImageBase64());

  try {
    const response = await fetch(`${API_URL}/api/posts`, {
      method: "POST",
      headers: {
        Cookie: sessionCookie || "",
      },
      body: formData,
    });

    const data = await response.json();

    if (response.ok) {
      console.log("✅ Успешно создана статья с HTML и изображениями");
      console.log(`   Post ID: ${data.post?.id}`);
      console.log(`   Content length: ${data.post?.content?.length || 0} символов`);
      const hasImgTag = data.post?.content?.includes("<img");
      console.log(`   Содержит img теги: ${hasImgTag ? "да" : "нет"}`);
      return true;
    } else {
      console.log(`❌ Ошибка: ${data.error || response.status}`);
      console.log(`   Детали: ${JSON.stringify(data, null, 2)}`);
      return false;
    }
  } catch (error) {
    console.log(`❌ Исключение: ${error.message}`);
    return false;
  }
}

// Главная функция
async function main() {
  console.log("=".repeat(60));
  
  const sessionCookie = await getSession();
  
  if (!sessionCookie) {
    console.log("\n⚠️  Не удалось получить сессию. Запускаю тесты без авторизации...");
    console.log("   (Некоторые тесты могут завершиться ошибкой 401)\n");
  }

  const results = [];

  // Запускаем все тесты
  results.push(await testArticleWithImageCover(sessionCookie));
  results.push(await testArticleWithVideoCover(sessionCookie));
  results.push(await testArticleWithoutCover(sessionCookie));
  results.push(await testArticleWithInlineImages(sessionCookie));

  // Итоги
  console.log("\n" + "=".repeat(60));
  console.log("📊 Итоги тестирования:");
  const passed = results.filter(r => r).length;
  const total = results.length;
  console.log(`   Пройдено: ${passed}/${total}`);
  
  if (passed === total) {
    console.log("✅ Все тесты пройдены успешно!");
    process.exit(0);
  } else {
    console.log(`❌ Провалено тестов: ${total - passed}`);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("💥 Критическая ошибка:", error);
  process.exit(1);
});

