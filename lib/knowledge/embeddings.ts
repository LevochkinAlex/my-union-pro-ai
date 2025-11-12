import { getOpenRouterEmbeddingConfig } from "@/lib/settings";

const OPENROUTER_EMBED_URL = "https://openrouter.ai/api/v1/embeddings";

export async function generateEmbedding(text: string): Promise<number[]> {
  const cleanedText = text.replace(/\s+/g, " ").trim();

  if (!cleanedText) {
    return [];
  }

  const { apiKey, model } = await getOpenRouterEmbeddingConfig();

  if (!apiKey) {
    throw new Error("OpenRouter embedding API key is not configured");
  }

  const response = await fetch(OPENROUTER_EMBED_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      "HTTP-Referer": process.env.NEXTAUTH_URL || "http://localhost:3004",
      "X-Title": "MyUnion Pro",
    },
    body: JSON.stringify({
      model,
      input: cleanedText,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Embedding request failed: ${errorText}`);
  }

  const payload = (await response.json()) as {
    data?: Array<{ embedding: number[] }>;
  };

  const embedding = payload.data?.[0]?.embedding;
  if (!embedding) {
    throw new Error("Embedding response did not include data");
  }

  return embedding;
}
