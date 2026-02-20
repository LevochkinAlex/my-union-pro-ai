#!/usr/bin/env node
/**
 * Конвертирует README.md и docs/JUNIOR_GUIDE.md в PDF с рабочими ссылками на репозиторий.
 * Запуск: pnpm docs:pdf
 * Требует: Chrome (системный или PUPPETEER_EXECUTABLE_PATH / npx puppeteer browsers install chrome)
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { mdToPdf } from "md-to-pdf";

function getChromePath() {
  if (process.env.PUPPETEER_EXECUTABLE_PATH) return process.env.PUPPETEER_EXECUTABLE_PATH;
  const candidates = [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    process.platform === "win32" && path.join(process.env.LOCALAPPDATA || "", "Google", "Chrome", "Application", "chrome.exe"),
    process.platform === "linux" && "/usr/bin/google-chrome",
    process.platform === "linux" && "/usr/bin/chromium",
  ].filter(Boolean);
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return undefined;
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, "..");

const REPO_BASE = "https://github.com/usmanoffcom/my-union-pro-ai/blob/main";

/**
 * Заменяет относительные ссылки в markdown на абсолютные URL репозитория.
 * @param {string} md
 * @param {string} fileDir - директория исходного файла (для разрешения относительных путей)
 */
function resolveRelativeLinks(md, fileDir) {
  return md.replace(
    /\]\((?!https?:\/\/)([^)]+)\)/g,
    (match, linkUrl) => {
      const trimmed = linkUrl.trim();
      if (trimmed.startsWith("#") || trimmed.startsWith("mailto:")) return match;
      const [filePart, anchor] = trimmed.split("#");
      const normalized = path
        .normalize(path.join(fileDir, filePart.replace(/^\.\//, "")))
        .replace(/\\/g, "/");
      const relativeToRoot = path.relative(rootDir, normalized).replace(/\\/g, "/");
      const url = `${REPO_BASE}/${relativeToRoot}${anchor ? `#${anchor}` : ""}`;
      return `](${url})`;
    }
  );
}

async function main() {
  const outputs = [
    {
      name: "README",
      src: path.join(rootDir, "README.md"),
      dest: path.join(rootDir, "docs", "README.pdf"),
      dirForLinks: rootDir,
    },
    {
      name: "JUNIOR_GUIDE",
      src: path.join(rootDir, "docs", "JUNIOR_GUIDE.md"),
      dest: path.join(rootDir, "docs", "JUNIOR_GUIDE.pdf"),
      dirForLinks: path.join(rootDir, "docs"),
    },
  ];

  for (const { name, src, dest, dirForLinks } of outputs) {
    if (!fs.existsSync(src)) {
      console.warn(`⏭️  Пропуск: ${src} не найден`);
      continue;
    }
    console.log(`📄 Читаю ${name}...`);
    let content = fs.readFileSync(src, "utf-8");
    content = resolveRelativeLinks(content, dirForLinks);
    console.log(`📑 Генерирую PDF: ${dest}`);
    await mdToPdf(
      { content },
      {
        dest,
        pdf_options: {
          format: "A4",
          margin: { top: "20mm", right: "20mm", bottom: "20mm", left: "20mm" },
          printBackground: true,
        },
        launch_options: (() => {
          const opts = {
            args: [
              "--no-sandbox",
              "--disable-setuid-sandbox",
              "--disable-dev-shm-usage",
            ],
          };
          const chrome = getChromePath();
          if (chrome) opts.executablePath = chrome;
          return opts;
        })(),
      }
    );
    console.log(`✅ Сохранено: ${dest}`);
  }

  console.log("\n✨ Готово. PDF в папке docs/.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
