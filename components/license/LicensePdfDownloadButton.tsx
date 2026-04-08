import { FileDown } from "lucide-react";

/** Статический файл в `public/offerta.pdf` */
const OFFER_PDF_HREF = "/offerta.pdf";
const OFFER_PDF_FILENAME = "offerta.pdf";

export function LicensePdfDownloadButton() {
  return (
    <a
      href={OFFER_PDF_HREF}
      download={OFFER_PDF_FILENAME}
      className="inline-flex items-center gap-2 rounded-xl border border-border/60 bg-background/80 px-4 py-2.5 text-sm font-semibold text-foreground shadow-sm backdrop-blur-sm transition hover:bg-muted/80 hover:border-border dark:bg-background/60 dark:hover:bg-muted/50 print:hidden"
    >
      <FileDown className="h-4 w-4 shrink-0" aria-hidden />
      Скачать PDF
    </a>
  );
}
