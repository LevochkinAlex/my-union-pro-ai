const DEFAULT_MAX_CHARS = 1500;

function splitParagraphs(text: string) {
  return text
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
}

export function chunkText(text: string, maxChars: number = DEFAULT_MAX_CHARS) {
  const paragraphs = splitParagraphs(text);
  const chunks: string[] = [];
  let current = "";

  for (const paragraph of paragraphs) {
    if (!paragraph) continue;

    if ((current + "\n\n" + paragraph).length > maxChars && current.length > 0) {
      chunks.push(current.trim());
      current = paragraph;
      continue;
    }

    current = current ? `${current}\n\n${paragraph}` : paragraph;
  }

  if (current.trim()) {
    chunks.push(current.trim());
  }

  if (chunks.length === 0 && text.trim()) {
    chunks.push(text.trim().slice(0, maxChars));
  }

  return chunks;
}
