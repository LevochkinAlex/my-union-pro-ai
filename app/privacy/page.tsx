import type { Metadata } from "next";
import Link from "next/link";
import { readFile } from "fs/promises";
import path from "path";
import mammoth from "mammoth";

export const metadata: Metadata = {
  title: "Политика конфиденциальности | МойСоюз",
  description:
    "Политика обработки персональных данных ООО «ЯППИКС» (актуальная редакция).",
};

const POLICY_DOC_FILENAME = "Политика_конфиденциальности_ООО_ЯППИКС_от_24_02_2026.docx";

function isSectionTitle(line: string): boolean {
  return /^\d+\.\s/.test(line);
}

function isSubSectionTitle(line: string): boolean {
  return /^\d+\.\d+(\.\d+)*\./.test(line);
}

async function getPolicyLines(): Promise<string[]> {
  const filePath = path.join(process.cwd(), "doc-huyoc", POLICY_DOC_FILENAME);
  const fileBuffer = await readFile(filePath);
  const extracted = await mammoth.extractRawText({ buffer: fileBuffer });

  return extracted.value
    .split(/\r?\n/)
    .map((line) => line.replace(/\u00a0/g, " ").trim())
    .filter(Boolean);
}

export default async function PrivacyPage() {
  let policyLines: string[] = [];
  let loadError = false;

  try {
    policyLines = await getPolicyLines();
  } catch (error) {
    loadError = true;
    console.error("[privacy] Failed to read policy DOCX:", error);
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="mx-auto max-w-3xl px-4 py-10 sm:py-14">
        <Link
          href="/login"
          className="inline-flex items-center text-sm text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white mb-8"
        >
          ← На страницу входа
        </Link>

        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
          Политика конфиденциальности
        </h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-8">
          и обработки персональных данных
        </p>

        <div className="mb-6 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900 dark:border-blue-900/40 dark:bg-blue-950/30 dark:text-blue-200">
          Актуальная редакция Политики от 24.02.2026.
        </div>

        <div className="prose prose-gray dark:prose-invert max-w-none text-gray-700 dark:text-gray-300">
          {loadError ? (
            <p>
              Не удалось загрузить текст политики. Пожалуйста, откройте оригинал
              документа по ссылке выше.
            </p>
          ) : (
            <div className="space-y-3">
              {policyLines.map((line, index) => {
                if (isSectionTitle(line)) {
                  return (
                    <h2
                      key={`${index}-${line}`}
                      className="pt-4 text-lg font-semibold text-gray-900 dark:text-white"
                    >
                      {line}
                    </h2>
                  );
                }
                if (isSubSectionTitle(line)) {
                  return (
                    <p
                      key={`${index}-${line}`}
                      className="font-medium text-gray-900 dark:text-gray-100"
                    >
                      {line}
                    </p>
                  );
                }
                return <p key={`${index}-${line}`}>{line}</p>;
              })}
            </div>
          )}
        </div>

        <div className="mt-12 pt-8 border-t border-gray-200 dark:border-gray-700">
          <Link
            href="/login"
            className="text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 underline"
          >
            ← Вернуться на страницу входа
          </Link>
        </div>
      </div>
    </div>
  );
}
