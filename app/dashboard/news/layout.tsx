import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { DEMO_MEMBER_USER_ID } from "@/lib/demo-constants";

export const dynamic = "force-dynamic";

export default async function NewsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    redirect("/login");
  }

  if (session.user.id === DEMO_MEMBER_USER_ID) {
    return <>{children}</>;
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { membershipStatus: true, unionMembershipStatus: true },
  });

  const isReApplying =
    user?.unionMembershipStatus === "REMOVED" &&
    (user?.membershipStatus === "DOCUMENTS_PENDING" ||
      user?.membershipStatus === "PROFILE_INCOMPLETE");
  const isExcluded =
    (user?.membershipStatus === "EXCLUDED" ||
      user?.unionMembershipStatus === "REMOVED") &&
    !isReApplying;

  if (isExcluded) {
    redirect("/dashboard");
  }

  return <>{children}</>;
}
