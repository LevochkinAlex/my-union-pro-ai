import type { Metadata } from "next";
import Link from "next/link";
import { backNavLinkButtonClass } from "@/lib/back-nav-link-button";
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
        <Link href="/" className={`${backNavLinkButtonClass} mb-8`}>
          ← На главную
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

        <div className="mb-8 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-700 dark:border-gray-700 dark:bg-gray-800/50 dark:text-gray-300">
          <p className="font-medium text-gray-900 dark:text-white mb-1">
            Реестр Роскомнадзора
          </p>
          <p className="mb-2">
            ООО «ЯППИКС» внесено в реестр операторов, осуществляющих обработку персональных данных (Роскомнадзор). Сведения об операторе являются общедоступными в соответствии с Федеральным законом от 27.07.2006 № 152-ФЗ «О персональных данных».
          </p>
          <a
            href="https://pd.rkn.gov.ru/operators-registry/operators-list/?id=77-26-537390"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 font-medium underline underline-offset-2"
          >
            Запись в реестре операторов РКН
            <span className="sr-only"> (откроется в новой вкладке)</span>
          </a>
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
          <Link href="/" className={backNavLinkButtonClass}>
            ← На главную
          </Link>
        </div>
      </div>
    </div>
  );
}
