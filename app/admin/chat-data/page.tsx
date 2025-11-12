import { redirect } from "next/navigation";

export default function AdminChatDataPage() {
  redirect("/admin/ai-chat?tab=training");
  return null;
}

