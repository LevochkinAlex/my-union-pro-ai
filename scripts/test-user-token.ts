#!/usr/bin/env tsx
/**
 * Тестируем авторизацию конкретного пользователя в BestBenefits
 * Проверяем, можем ли мы получить токен для созданного пользователя
 */

async function testUserAuth() {
  const AUTH_URL = "https://bestbenefits.ru/api/auth";
  
  // Пробуем авторизоваться от имени пользователя ceo@yappix.ru
  const credentials = {
    email: "ceo@yappix.ru",
    password: "w+Aj7UH5/FpB", // пароль который мы устанавливали
  };

  console.log("🔐 Testing user authentication...");
  console.log("Email:", credentials.email);
  
  try {
    const response = await fetch(AUTH_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(credentials),
    });

    console.log("\n📊 Response status:", response.status, response.statusText);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.log("❌ Error response:", errorText);
      return;
    }

    const data = await response.json();
    console.log("\n✅ SUCCESS! User token received:");
    console.log(JSON.stringify(data, null, 2));
    
    console.log("\n🎯 TOKEN:", data.access_token);
    console.log("Expires in:", data.expires_in, "seconds");
    
    // Теперь пробуем использовать этот токен для получения скидок
    console.log("\n🔄 Testing token with /api/received endpoint...");
    
    const receivedResponse = await fetch("https://bestbenefits.ru/api/received", {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${data.access_token}`,
        "Accept": "application/json",
      },
    });
    
    console.log("Response status:", receivedResponse.status);
    const receivedData = await receivedResponse.json();
    console.log("Received discounts:", receivedData.data?.length || 0);
    
  } catch (error) {
    console.error("❌ Error:", error);
  }
}

testUserAuth();

