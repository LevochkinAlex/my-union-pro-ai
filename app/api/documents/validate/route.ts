import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { OpenAI } from "openai";
import { createWorker } from "tesseract.js";
import sharp from "sharp";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/**
 * POST /api/documents/validate
 * Валидирует загруженный документ с помощью AI
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get("file") as File;
    const documentType = formData.get("documentType") as string;

    if (!file) {
      return NextResponse.json({ error: "Файл не предоставлен" }, { status: 400 });
    }

    console.log("[validate-document] Validating:", {
      fileName: file.name,
      fileType: file.type,
      fileSize: file.size,
      documentType,
    });

    // Конвертируем файл в base64
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    let textContent = "";
    let imageBase64 = "";

    // Обработка изображений (JPG, PNG)
    if (file.type.startsWith("image/")) {
      // Оптимизируем изображение для OCR
      const optimizedBuffer = await sharp(buffer)
        .resize(2000, 2000, { fit: "inside", withoutEnlargement: true })
        .grayscale()
        .normalize()
        .toBuffer();

      imageBase64 = `data:${file.type};base64,${optimizedBuffer.toString("base64")}`;

      // OCR для извлечения текста из изображения
      console.log("[validate-document] Performing OCR...");
      const worker = await createWorker("rus");
      const { data } = await worker.recognize(optimizedBuffer);
      textContent = data.text;
      await worker.terminate();
      console.log("[validate-document] OCR completed, extracted text length:", textContent.length);
    }

    // Определяем что должен содержать документ
    const expectedContent = documentType === "MEMBERSHIP_APPLICATION"
      ? {
          title: "Заявление о вступлении в профсоюз",
          requiredFields: [
            "профсоюз",
            "вступление",
            "заявление",
            "фио", 
            "подпись",
            "дата",
          ],
          description: "Документ должен быть заявлением о вступлении в Профсоюз работников здравоохранения РФ с подписью и датой."
        }
      : {
          title: "Заявление о перечислении членских взносов",
          requiredFields: [
            "взнос",
            "профсоюз",
            "заявление",
            "перечисл",
            "фио",
            "подпись",
            "дата",
          ],
          description: "Документ должен быть заявлением о перечислении членских профсоюзных взносов с подписью и датой."
        };

    // AI-валидация
    console.log("[validate-document] Validating with AI...");
    
    const messages: any[] = [
      {
        role: "system",
        content: `Ты — эксперт по проверке документов профсоюза. 
        
Твоя задача — проверить, что загруженный документ соответствует требованиям.

Требуемый документ: ${expectedContent.title}

${expectedContent.description}

Документ ОБЯЗАТЕЛЬНО должен содержать:
${expectedContent.requiredFields.map((f, i) => `${i + 1}. ${f}`).join("\n")}

Проверь документ и верни JSON ответ в формате:
{
  "valid": true/false,
  "confidence": 0-100,
  "reason": "причина отклонения или подтверждения",
  "missingFields": ["список отсутствующих полей"]
}

Если документ соответствует требованиям и является подписанным заявлением, верни valid: true.
Если это не тот документ, или отсутствуют обязательные поля, или документ не подписан, верни valid: false.`,
      },
    ];

    // Если это изображение, отправляем его вместе с текстом
    if (file.type.startsWith("image/") && imageBase64) {
      messages.push({
        role: "user",
        content: [
          {
            type: "text",
            text: `Проверь этот документ. Извлеченный текст (OCR):\n\n${textContent}`,
          },
          {
            type: "image_url",
            image_url: {
              url: imageBase64,
              detail: "high",
            },
          },
        ],
      });
    } else {
      // Для PDF отправляем только извлеченный текст
      messages.push({
        role: "user",
        content: `Проверь этот документ. Текст документа:\n\n${textContent || "Не удалось извлечь текст"}`,
      });
    }

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages,
      temperature: 0.3,
      response_format: { type: "json_object" },
    });

    const aiResponse = completion.choices[0]?.message?.content;
    if (!aiResponse) {
      return NextResponse.json(
        { valid: false, error: "Не удалось проверить документ" },
        { status: 500 }
      );
    }

    const validation = JSON.parse(aiResponse);
    console.log("[validate-document] AI validation result:", validation);

    if (!validation.valid) {
      return NextResponse.json({
        valid: false,
        error: validation.reason || "Документ не соответствует требованиям",
        details: validation,
      });
    }

    return NextResponse.json({
      valid: true,
      message: "Документ успешно проверен",
      confidence: validation.confidence,
    });

  } catch (error) {
    console.error("[validate-document] Error:", error);
    return NextResponse.json(
      {
        valid: false,
        error: "Ошибка при проверке документа",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

