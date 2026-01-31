import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function createSuperAdmin() {
  try {
    const email = "super@admin.com";

    console.log(`[create-super-admin] Creating super admin: ${email}`);
    console.log("[create-super-admin] Вход без пароля — по magic link (вкладка «По Email»)");

    // Check if user exists
    const existing = await prisma.user.findUnique({
      where: { email },
    });

    if (existing) {
      console.log("[create-super-admin] User already exists, updating role...");
      const updated = await prisma.user.update({
        where: { email },
        data: {
          role: "SUPER_ADMIN",
          emailVerified: new Date(),
          membershipStatus: "APPROVED",
        },
      });
      console.log("[create-super-admin] ✅ Super admin updated:", updated.email, updated.role);
    } else {
      const user = await prisma.user.create({
        data: {
          email,
          role: "SUPER_ADMIN",
          firstName: "Super",
          lastName: "Admin",
          emailVerified: new Date(),
          membershipStatus: "APPROVED",
        },
      });
      console.log("[create-super-admin] ✅ Super admin created:", user.email, user.role);
    }
  } catch (error) {
    console.error("[create-super-admin] Error:", error);
  } finally {
    await prisma.$disconnect();
  }
}

createSuperAdmin();

