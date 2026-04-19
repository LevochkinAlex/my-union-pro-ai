import { cloneElement, isValidElement, type ReactNode } from "react";

const keyFromHref = (href: string) =>
  `nav-icon-${href.replace(/[^a-zA-Z0-9_-]/g, "_")}`;

/**
 * Иконки задаются в layout (часто RSC) и передаются в client (`Sidebar` / `MobileMenu`).
 * Явный `key` на элементе иконки снимает предупреждение React о дочерних элементах списка.
 */
export function withStableNavIconKey(icon: ReactNode, href: string): ReactNode {
  if (!isValidElement(icon)) return icon;
  return cloneElement(icon, { key: keyFromHref(href) });
}
