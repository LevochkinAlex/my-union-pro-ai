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

async function testContactOperations(token) {
  const botId = SENDPULSE_WHATSAPP_BOT_ID;
  const phone = "79874157897";
  
  // Попробуем найти контакт
  console.log("\n🔍 1. Searching for contact by phone...");
  try {
    const searchResponse = await fetch(
      `${SENDPULSE_API_BASE}/whatsapp/contacts?bot_id=${botId}&phone=${phone}`,
      {
        method: "GET",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      }
    );
    const searchData = await searchResponse.text();
    console.log(`Status: ${searchResponse.status}`);
    console.log(`Response: ${searchData.substring(0, 500)}`);
  } catch (error) {
    console.error(`Error: ${error.message}`);
  }

  // Попробуем создать контакт
  console.log("\n🔍 2. Creating contact...");
  try {
    const createResponse = await fetch(
      `${SENDPULSE_API_BASE}/whatsapp/contacts`,
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          bot_id: botId,
          phone: phone,
        }),
      }
    );
    const createData = await createResponse.text();
    console.log(`Status: ${createResponse.status}`);
    console.log(`Response: ${createData.substring(0, 500)}`);
  } catch (error) {
    console.error(`Error: ${error.message}`);
  }

  // Попробуем получить список контактов
  console.log("\n🔍 3. Getting contacts list...");
  try {
    const listResponse = await fetch(
      `${SENDPULSE_API_BASE}/whatsapp/contacts?bot_id=${botId}`,
      {
        method: "GET",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      }
    );
    const listData = await listResponse.text();
    console.log(`Status: ${listResponse.status}`);
    console.log(`Response: ${listData.substring(0, 500)}`);
  } catch (error) {
    console.error(`Error: ${error.message}`);
  }
}

async function main() {
  try {
    console.log("🔑 Getting access token...");
    const token = await getAccessToken();
    console.log("✅ Token obtained");
    
    await testContactOperations(token);
  } catch (error) {
    console.error("❌ Error:", error);
  }
}

main();
