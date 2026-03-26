/**
 * html2canvas не умеет парсить CSS color: lab() / oklch() из Tailwind v4.
 * В клоне документа снимаем классы и задаём только hex/rgb inline.
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
    "background:#ffffff;color:#111827;font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:15px;line-height:1.65;padding:16px;box-sizing:border-box;border:none;box-shadow:none;outline:none;";

  root.querySelectorAll("section").forEach((s) => {
    (s as HTMLElement).style.cssText +=
      "display:block;margin:0;padding:0;background:transparent;";
  });

  root.querySelectorAll("h1").forEach((h) => {
    (h as HTMLElement).style.cssText +=
      "font-size:1.5rem;font-weight:700;margin:0 0 0.35em 0;color:#111827;line-height:1.25;background:transparent;";
  });

  root.querySelectorAll("h2").forEach((h) => {
    (h as HTMLElement).style.cssText +=
      "font-size:1.125rem;font-weight:600;margin:1.15em 0 0.5em 0;color:#111827;line-height:1.3;background:transparent;";
  });

  root.querySelectorAll("p").forEach((p) => {
    (p as HTMLElement).style.cssText +=
      "margin:0 0 0.35em 0;color:#374151;background:transparent;";
  });

  root.querySelectorAll("a").forEach((a) => {
    (a as HTMLElement).style.cssText +=
      "color:#1d4ed8;text-decoration:underline;background:transparent;";
  });

  root.querySelectorAll("ul").forEach((ul) => {
    (ul as HTMLElement).style.cssText +=
      "margin:0.4em 0;padding:0 0 0 1.25em;list-style-type:disc;background:transparent;";
  });

  root.querySelectorAll("li").forEach((li) => {
    (li as HTMLElement).style.cssText +=
      "margin:0.1em 0;color:#374151;background:transparent;";
  });

  root.querySelectorAll("strong").forEach((s) => {
    (s as HTMLElement).style.fontWeight = "600";
    (s as HTMLElement).style.color = "#111827";
    (s as HTMLElement).style.background = "transparent";
  });

  const rel = root.querySelector("[data-pdf-relative-wrapper]");
  if (rel instanceof HTMLElement) {
    rel.style.cssText +=
      "position:relative;min-height:140px;background:transparent;";
  }

  const stamp = root.querySelector("[data-license-stamp]");
  if (stamp instanceof HTMLElement) {
    stamp.style.cssText +=
      "position:absolute;left:0;right:0;bottom:0;display:flex;justify-content:flex-end;align-items:flex-end;padding:8px 8px 4px;padding-top:2.5rem;opacity:0.44;pointer-events:none;z-index:0;background:transparent;";
  }

  root.querySelectorAll('img[src*="license-stamp"]').forEach((img) => {
    if (img instanceof HTMLElement) {
      img.style.cssText +=
        "max-height:192px;width:auto;max-width:min(260px,52%);object-fit:contain;object-position:bottom;display:block;";
    }
  });

  const tableWrap = root.querySelector("[data-pdf-table-layer]");
  if (tableWrap instanceof HTMLElement) {
    tableWrap.style.cssText +=
      "position:relative;z-index:10;border:1px solid #e5e7eb;border-radius:8px;background:#ffffff;overflow-x:auto;";
  }

  root.querySelectorAll("table").forEach((t) => {
    const te = t as HTMLElement;
    te.style.cssText +=
      "width:100%;border-collapse:collapse;font-size:0.875rem;color:#111827;background:#ffffff;";
    const par = te.parentElement;
    if (
      par instanceof HTMLElement &&
      par !== root &&
      !par.hasAttribute("data-pdf-table-layer")
    ) {
      par.style.cssText +=
        "display:block;overflow-x:auto;margin:0.75em 0;border:1px solid #e5e7eb;border-radius:8px;background:#ffffff;";
    }
  });

  root.querySelectorAll("tbody").forEach((tb) => {
    (tb as HTMLElement).style.background = "#ffffff";
  });

  root.querySelectorAll("tr").forEach((tr) => {
    (tr as HTMLElement).style.background = "#ffffff";
  });

  root.querySelectorAll("td, th").forEach((c) => {
    const cell = c as HTMLElement;
    cell.style.cssText +=
      "border-bottom:1px solid #e5e7eb;padding:0.5rem 1rem;text-align:left;vertical-align:top;color:#111827;background:#ffffff;";
    cell.style.textShadow =
      "0 0 1px #ffffff, 0 0 3px #ffffff, 0 1px 2px rgba(255,255,255,0.95)";
  });
}
