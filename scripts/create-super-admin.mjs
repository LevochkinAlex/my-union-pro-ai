import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function createSuperAdmin() {
  try {
    const email = "super@admin.com";
    const password = "admin123456";

    console.log(`[create-super-admin] Creating super admin: ${email}`);

    // Check if user exists
    const existing = await prisma.user.findUnique({
      where: { email },
    });

    if (existing) {
      console.log("[create-super-admin] User already exists, updating role...");
      const hashedPassword = await bcrypt.hash(password, 10);
      const updated = await prisma.user.update({
        where: { email },
        data: {
          role: "SUPER_ADMIN",
          password: hashedPassword,
          emailVerified: new Date(),
          membershipStatus: "APPROVED",
        },
      });
      console.log("[create-super-admin] ✅ Super admin updated:", updated.email, updated.role);
    } else {
      const hashedPassword = await bcrypt.hash(password, 10);
      const user = await prisma.user.create({
        data: {
          email,
          password: hashedPassword,
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

