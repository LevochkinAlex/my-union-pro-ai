/**
 * html2canvas не умеет парсить CSS color: lab() / oklch() из Tailwind v4.
 * В клоне документа снимаем классы и задаём только hex/rgb inline.
 * Размеры — в px (в клоне rem часто «раздувается»). Печать — под таблицей реквизитов
 * через полупрозрачный фон ячеек, иначе белый td полностью её перекрывает.
 */
export function sanitizeClonedNodeForHtml2Canvas(root: HTMLElement): void {
  const elements: HTMLElement[] = [
    root,
    ...Array.from(root.querySelectorAll("*")).filter(
      (n): n is HTMLElement => n instanceof HTMLElement,
    ),
  ];

  for (const el of elements) {
    el.removeAttribute("class");
  }

  root.style.cssText =
    "background:#ffffff;color:#111827;font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:12.5px;line-height:1.58;padding:24px 26px 28px;box-sizing:border-box;border:none;box-shadow:none;outline:none;max-width:100%;";

  root.querySelectorAll("section").forEach((s, idx) => {
    const el = s as HTMLElement;
    let block =
      "display:block;background:transparent;box-sizing:border-box;";
    if (idx > 0) {
      block +=
        "margin:20px 0 0 0;padding:16px 0 0 0;border-top:1px solid #e5e7eb;";
    } else {
      block += "margin:0;padding:0;";
    }
    el.style.cssText += block;
  });

  root.querySelectorAll("h1").forEach((h) => {
    (h as HTMLElement).style.cssText +=
      "font-size:18px;font-weight:700;margin:0 0 10px 0;color:#111827;line-height:1.25;background:transparent;";
  });

  root.querySelectorAll("h2").forEach((h) => {
    (h as HTMLElement).style.cssText +=
      "font-size:13.5px;font-weight:600;margin:6px 0 10px 0;color:#111827;line-height:1.35;background:transparent;clear:both;";
  });

  root.querySelectorAll("p").forEach((p) => {
    (p as HTMLElement).style.cssText +=
      "margin:0 0 11px 0;color:#374151;background:transparent;font-size:12.5px;line-height:1.58;max-width:100%;";
  });

  root.querySelectorAll("a").forEach((a) => {
    (a as HTMLElement).style.cssText +=
      "color:#1d4ed8;text-decoration:underline;background:transparent;font-size:12.5px;";
  });

  root.querySelectorAll("ul").forEach((ul) => {
    (ul as HTMLElement).style.cssText +=
      "margin:8px 0 14px 0;padding:4px 0 6px 1.25em;list-style-type:disc;background:transparent;font-size:12.5px;line-height:1.55;";
  });

  root.querySelectorAll("li").forEach((li) => {
    (li as HTMLElement).style.cssText +=
      "margin:0 0 6px 0;color:#374151;background:transparent;font-size:12.5px;line-height:1.55;";
  });

  root.querySelectorAll("strong").forEach((s) => {
    (s as HTMLElement).style.fontWeight = "600";
    (s as HTMLElement).style.color = "#111827";
    (s as HTMLElement).style.background = "transparent";
    (s as HTMLElement).style.fontSize = "12.5px";
  });

  const rel = root.querySelector("[data-pdf-relative-wrapper]");
  if (rel instanceof HTMLElement) {
    rel.style.cssText +=
      "position:relative;min-height:160px;background:transparent;overflow:visible;";
  }

  const stamp = root.querySelector("[data-license-stamp]");
  if (stamp instanceof HTMLElement) {
    stamp.style.cssText +=
      "position:absolute;left:0;right:0;bottom:0;display:flex;justify-content:flex-end;align-items:flex-end;padding:4px 6px 6px;padding-top:28px;opacity:0.72;pointer-events:none;z-index:0;background:transparent;";
  }

  root.querySelectorAll('img[src*="license-stamp"]').forEach((img) => {
    if (img instanceof HTMLElement) {
      img.style.cssText +=
        "max-height:150px;width:auto;max-width:42%;min-width:120px;object-fit:contain;object-position:bottom right;display:block;";
    }
  });

  const tableWrap = root.querySelector("[data-pdf-table-layer]");
  if (tableWrap instanceof HTMLElement) {
    tableWrap.style.cssText +=
      "position:relative;z-index:1;border:1px solid #e5e7eb;border-radius:6px;background:transparent;overflow:visible;";
  }

  root.querySelectorAll("table").forEach((t) => {
    const te = t as HTMLElement;
    const inRequisites = te.closest("[data-pdf-table-layer]");
    te.style.cssText +=
      "width:100%;border-collapse:collapse;font-size:11px;color:#111827;" +
      (inRequisites ? "background:transparent;" : "background:#ffffff;");
    const par = te.parentElement;
    if (
      par instanceof HTMLElement &&
      par !== root &&
      !par.hasAttribute("data-pdf-table-layer")
    ) {
      par.style.cssText +=
        "display:block;overflow-x:visible;margin:12px 0 16px 0;border:1px solid #d1d5db;border-radius:8px;background:#ffffff;";
    }
  });

  root.querySelectorAll("tbody").forEach((tb) => {
    const inReq = tb.closest("[data-pdf-table-layer]");
    (tb as HTMLElement).style.background = inReq ? "transparent" : "#ffffff";
  });

  root.querySelectorAll("tr").forEach((tr) => {
    const inReq = tr.closest("[data-pdf-table-layer]");
    (tr as HTMLElement).style.background = inReq ? "transparent" : "#ffffff";
  });

  root.querySelectorAll("td, th").forEach((c) => {
    const cell = c as HTMLElement;
    const inReq = cell.closest("[data-pdf-table-layer]");
    if (inReq) {
      cell.style.cssText +=
        "border-bottom:1px solid #e2e8f0;padding:6px 10px;text-align:left;vertical-align:top;color:#111827;background:rgba(255,255,255,0.78);font-size:10.5px;";
      cell.style.textShadow =
        "0 0 2px #fff, 0 0 4px #fff, 0 1px 0 rgba(255,255,255,0.95)";
    } else if (cell.tagName === "TH") {
      cell.style.cssText +=
        "border-bottom:1px solid #d1d5db;padding:9px 12px;font-weight:600;color:#111827;background:#f3f4f6;text-align:left;vertical-align:middle;font-size:11px;";
    } else {
      cell.style.cssText +=
        "border-bottom:1px solid #e5e7eb;padding:7px 12px;text-align:left;vertical-align:top;color:#374151;background:#ffffff;font-size:11px;";
    }
  });

  root.querySelectorAll("thead").forEach((thead) => {
    (thead as HTMLElement).style.cssText +=
      "background:#f3f4f6;border-bottom:1px solid #d1d5db;";
  });
}
