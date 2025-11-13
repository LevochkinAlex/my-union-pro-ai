import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const { query } = await request.json();

    if (!query || typeof query !== "string") {
      return NextResponse.json(
        { error: "Query параметр обязателен" },
        { status: 400 }
      );
    }

    const apiKey = process.env.DADATA_API_KEY;

    if (!apiKey) {
      console.error("DADATA_API_KEY не установлен в переменных окружения");
      return NextResponse.json(
        { error: "DaData API не настроен" },
        { status: 500 }
      );
    }

    const response = await fetch(
      "https://suggestions.dadata.ru/suggestions/api/4_1/rs/suggest/address",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Token ${apiKey}`,
        },
        body: JSON.stringify({
          query: query,
          count: 10,
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error("DaData API error:", response.status, errorText);
      return NextResponse.json(
        { error: "Ошибка получения подсказок адреса" },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error("DaData proxy error:", error);
    return NextResponse.json(
      { error: "Внутренняя ошибка сервера" },
      { status: 500 }
    );
  }
}

