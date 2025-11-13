import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import Chat from "@/components/chat/Chat";

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);

  if (!session) {
    redirect("/login");
  }

  // Редирект супер-админов в админ-панель
  const userRole = session.user.role;
  if (userRole === "SUPER_ADMIN") {
    redirect("/admin/dashboard");
  }

  // Главная страница - это чат (полная высота, без padding)
  return (
    <div className="h-screen w-full flex flex-col -mx-4 -my-8 sm:-mx-8 lg:-mx-12">
      <Chat />
    </div>
  );
}
