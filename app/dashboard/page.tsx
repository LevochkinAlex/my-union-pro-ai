import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);

  if (!session) {
    redirect("/login");
  }

  const membershipStatus = (session.user as any)?.membershipStatus;
  if (
    membershipStatus === "PROFILE_INCOMPLETE" ||
    membershipStatus === "PENDING_VERIFICATION"
  ) {
    redirect("/dashboard/chat");
  }

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-center">
        <h1 className="mb-4 text-2xl font-bold">Добро пожаловать в MyUnion!</h1>
        <p className="text-gray-600 dark:text-gray-400">
          Dashboard будет здесь
        </p>
      </div>
    </div>
  );
}
