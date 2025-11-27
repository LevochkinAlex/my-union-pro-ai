const WHATSAPP_ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN || "EAAd6IqvMNZBMBQAZBbn8uXthHYahh7WUlZBKE5NVlBWeFBV9LVYx6MZAt0bdE7zkFoZAItDuvFRpmAHG6NSQdz9FPInDJeXPxQGtFYgpkUDzKpWsM20ALLa21vmOCf7X1K8lEqnnZAn77vxXyEIW2dmNr7iVJr1f3lx5M67vGYGoPYZBBoxLeuSqoglsTZBE0K118QZDZD";
const WHATSAPP_PHONE_NUMBER_ID = "895789906949534";

const phone = "79874157897"; // Проверяем ваш номер

console.log("🔍 Проверка доступности номера в WhatsApp:", phone);

const url = `https://graph.facebook.com/v21.0/${WHATSAPP_PHONE_NUMBER_ID}/messages`;

// Пробуем отправить простое текстовое сообщение (не шаблон)
const requestBody = {
  messaging_product: "whatsapp",
  to: phone,
  type: "text",
  text: {
    body: "Тестовое сообщение от МойСоюз"
  }
};

try {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${WHATSAPP_ACCESS_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(requestBody),
  });

  const data = await response.json();

  if (!response.ok) {
    console.error("❌ Ошибка:", data);
    if (data.error?.code === 131026) {
      console.log("\n🚫 ПРОБЛЕМА: Номер не зарегистрирован в WhatsApp или заблокирован");
    } else if (data.error?.code === 131047) {
      console.log("\n⚠️ ПРОБЛЕМА: Нужно подтвердить номер телефона");
    } else if (data.error?.code === 130472) {
      console.log("\n⚠️ ПРОБЛЕМА: Пользователь заблокировал бизнес-аккаунт");
    }
  } else {
    console.log("✅ Сообщение отправлено:", data);
  }
} catch (error) {
  console.error("❌ Ошибка запроса:", error.message);
}
