"use client";

/**
 * Компонент чата - обёртка над ChatPageBase
 * Для обратной совместимости с существующими страницами
 */

import { ChatPageBase } from "./ChatPageBase";

export default function Chat() {
  return (
    <ChatPageBase
      baseUrl="/dashboard/chat"
      containerHeight="100vh"
      enableProfileClick={true}
    />
  );
}
