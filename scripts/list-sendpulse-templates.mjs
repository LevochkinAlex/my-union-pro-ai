import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, "..", ".env.local") });

const SENDPULSE_USER_ID = process.env.SENDPULSE_USER_ID;
const SENDPULSE_SECRET = process.env.SENDPULSE_SECRET;
const SENDPULSE_WHATSAPP_BOT_ID = process.env.SENDPULSE_WHATSAPP_BOT_ID;
const SENDPULSE_API_BASE = "https://api.sendpulse.com";

async function getAccessToken() {
  const response = await fetch(`${SENDPULSE_API_BASE}/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "client_credentials",
      client_id: SENDPULSE_USER_ID,
      client_secret: SENDPULSE_SECRET,
    }),
  });

  if (!response.ok) {
    throw new Error(`Token error: ${response.status}`);
  }

  const data = await response.json();
  return data.access_token;
}

async function listTemplates(token) {
  const botId = SENDPULSE_WHATSAPP_BOT_ID;
  
  console.log("\n🔍 Получение списка шаблонов...");
  try {
    const response = await fetch(
      `${SENDPULSE_API_BASE}/whatsapp/templates?bot_id=${botId}`,
      {
        method: "GET",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      }
    );
    
    const data = await response.json();
    console.log(`Status: ${response.status}`);
    console.log(`Response:`, JSON.stringify(data, null, 2));
    
    if (data.success && data.data) {
      console.log("\n📋 Доступные шаблоны:");
      data.data.forEach((template, index) => {
        console.log(`\n${index + 1}. Имя: ${template.name}`);
        console.log(`   Язык: ${template.language || 'N/A'}`);
        console.log(`   Статус: ${template.status || 'N/A'}`);
        console.log(`   Категория: ${template.category || 'N/A'}`);
      });
    }
  } catch (error) {
    console.error(`Error: ${error.message}`);
  }
}

async function main() {
  try {
    console.log("🔑 Getting access token...");
    const token = await getAccessToken();
    console.log("✅ Token obtained");
    
    await listTemplates(token);
  } catch (error) {
    console.error("❌ Error:", error);
  }
}

main();
