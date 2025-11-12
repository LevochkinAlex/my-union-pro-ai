import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import Chat from "@/components/chat/Chat";

export default async function ChatPage() {
  const session = await auth();

  if (!session) {
    redirect("/login");
  }

  return (
    <div className="h-screen">
      <Chat />
    </div>
  );
}

