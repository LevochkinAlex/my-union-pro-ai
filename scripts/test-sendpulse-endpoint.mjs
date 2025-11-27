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

async function testEndpoints(token) {
  const botId = SENDPULSE_WHATSAPP_BOT_ID;
  const phone = "79874157897";
  
  const endpoints = [
    {
      name: "sendTemplateByPhones (current)",
      url: `${SENDPULSE_API_BASE}/whatsapp/contacts/sendTemplateByPhones`,
      body: {
        bot_id: botId,
        phones: [phone],
        template: {
          name: "authentication_template_",
          language: { code: "en" },
          components: [{
            type: "body",
            parameters: [{ type: "text", text: "1234" }],
          }],
        },
      },
    },
    {
      name: "sendTemplate (alternative)",
      url: `${SENDPULSE_API_BASE}/whatsapp/contacts/sendTemplate`,
      body: {
        bot_id: botId,
        phone: phone,
        template: {
          name: "authentication_template_",
          language: { code: "en" },
          components: [{
            type: "body",
            parameters: [{ type: "text", text: "1234" }],
          }],
        },
      },
    },
    {
      name: "sendMessage (simple)",
      url: `${SENDPULSE_API_BASE}/whatsapp/contacts/sendMessage`,
      body: {
        bot_id: botId,
        phone: phone,
        message: { text: "Test message" },
      },
    },
  ];

  for (const endpoint of endpoints) {
    console.log(`\n🔍 Testing: ${endpoint.name}`);
    console.log(`URL: ${endpoint.url}`);
    
    try {
      const response = await fetch(endpoint.url, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(endpoint.body),
      });

      const text = await response.text();
      console.log(`Status: ${response.status} ${response.statusText}`);
      console.log(`Response: ${text.substring(0, 500)}`);
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
    
    await testEndpoints(token);
  } catch (error) {
    console.error("❌ Error:", error);
  }
}

main();
