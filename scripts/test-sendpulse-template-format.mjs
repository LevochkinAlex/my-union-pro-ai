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

async function testTemplateFormats(token) {
  const botId = SENDPULSE_WHATSAPP_BOT_ID;
  const phone = "79874157897";
  
  // Сначала найдем контакт
  console.log("\n🔍 Поиск контакта...");
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
  
  const searchData = await searchResponse.json();
  let contactId = null;
  
  if (searchResponse.ok && searchData.success && searchData.data && searchData.data.length > 0) {
    contactId = searchData.data[0].id;
    console.log(`✅ Контакт найден, ID: ${contactId}`);
  } else {
    console.log("❌ Контакт не найден");
    return;
  }

  // Тестируем разные форматы
  const formats = [
    {
      name: "Format 1: body (lowercase)",
      template: {
        name: "sample_template",
        language: { code: "en_US" },
        components: [{
          type: "body",
          parameters: [{ type: "text", text: "1234" }],
        }],
      },
    },
    {
      name: "Format 2: BODY (uppercase)",
      template: {
        name: "sample_template",
        language: { code: "en_US" },
        components: [{
          type: "BODY",
          parameters: [{ type: "text", text: "1234" }],
        }],
      },
    },
    {
      name: "Format 3: без language в components",
      template: {
        name: "sample_template",
        language: "en_US",
        components: [{
          type: "body",
          parameters: [{ type: "text", text: "1234" }],
        }],
      },
    },
  ];

  for (const format of formats) {
    console.log(`\n🔍 Тестируем: ${format.name}`);
    try {
      const response = await fetch(
        `${SENDPULSE_API_BASE}/whatsapp/contacts/sendTemplate`,
        {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            bot_id: botId,
            contact_id: contactId,
            template: format.template,
          }),
        }
      );

      const data = await response.json();
      console.log(`Status: ${response.status}`);
      console.log(`Response: ${JSON.stringify(data, null, 2).substring(0, 500)}`);
      
      if (response.ok && data.success) {
        console.log("✅ УСПЕХ! Этот формат работает!");
        break;
      }
    } catch (error) {
      console.error(`Error: ${error.message}`);
    }
  }
}

async function main() {
  try {
    console.log("🔑 Getting access token...");
    const token = await getAccessToken();
    console.log("✅ Token obtained");
    
    await testTemplateFormats(token);
  } catch (error) {
    console.error("❌ Error:", error);
  }
}

main();
