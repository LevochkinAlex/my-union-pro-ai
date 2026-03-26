"use client";

import { useCallback, useState } from "react";
import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";
import { FileDown, Loader2 } from "lucide-react";

const PDF_ROOT_ID = "license-offer-pdf";

export function LicensePdfDownloadButton() {
  const [loading, setLoading] = useState(false);

  const handleDownload = useCallback(async () => {
    const el = document.getElementById(PDF_ROOT_ID);
    if (!el) {
      console.error("[license-pdf] Element not found:", PDF_ROOT_ID);
      return;
    }

    setLoading(true);
    try {
      const canvas = await html2canvas(el, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: "#ffffff",
        windowWidth: el.scrollWidth,
        onclone: (doc) => {
          const node = doc.getElementById(PDF_ROOT_ID);
          if (!node) return;
          node.style.backgroundColor = "#ffffff";
          node.style.color = "#111827";
          node.querySelectorAll("h1, h2, p, li, td, th, strong, span").forEach((el) => {
            (el as HTMLElement).style.color = "#111827";
          });
          node.querySelectorAll("a").forEach((el) => {
            (el as HTMLElement).style.color = "#1d4ed8";
          });
          node.querySelectorAll("table, th, td").forEach((el) => {
            (el as HTMLElement).style.borderColor = "#e5e7eb";
          });
        },
      });

      const dataUrl = canvas.toDataURL("image/png", 1.0);
      const pdf = new jsPDF({
        orientation: "portrait",
        unit: "mm",
        format: "a4",
        compress: true,
      });

      const margin = 10;
      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();
      const contentH = pageH - 2 * margin;
      const imgW = pageW - 2 * margin;
      const imgH = (canvas.height * imgW) / canvas.width;

      let y = margin;
      pdf.addImage(dataUrl, "PNG", margin, y, imgW, imgH);

      let remaining = imgH - contentH;
      while (remaining > 0) {
        y -= contentH;
        pdf.addPage();
        pdf.addImage(dataUrl, "PNG", margin, y, imgW, imgH);
        remaining -= contentH;
      }

      pdf.save("myunion-pro-public-offer.pdf");
    } catch (e) {
      console.error("[license-pdf]", e);
    } finally {
      setLoading(false);
    }
  }, []);

  return (
    <button
      type="button"
      onClick={handleDownload}
      disabled={loading}
      className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3.5 py-2 text-sm font-medium text-gray-800 shadow-sm transition hover:bg-gray-50 hover:border-gray-400 disabled:opacity-60 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:hover:bg-gray-700"
    >
      {loading ? (
        <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden />
      ) : (
        <FileDown className="h-4 w-4 shrink-0" aria-hidden />
      )}
      {loading ? "Формируем PDF…" : "Скачать PDF"}
    </button>
  );
}
