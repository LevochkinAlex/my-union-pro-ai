import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function testAuth() {
  const email = "support@myunion.pro";
  const testPassword = "Admin@123456";

  const user = await prisma.user.findUnique({
    where: { email },
    select: {
      id: true,
      email: true,
      password: true,
      firstName: true,
      lastName: true,
      role: true,
    },
  });

  if (!user) {
    console.log("❌ User not found!");
    return;
  }

  console.log("✅ User found:");
  console.log("   Email:", user.email);
  console.log("   Name:", `${user.firstName} ${user.lastName}`);
  console.log("   Role:", user.role);
  console.log("   Password hash:", user.password?.substring(0, 20) + "...");

  if (!user.password) {
    console.log("❌ No password set!");
    return;
  }

  const isValid = await bcrypt.compare(testPassword, user.password);
  console.log("🔐 Password validation:", isValid ? "✅ VALID" : "❌ INVALID");

  if (!isValid) {
    console.log("\nTrying to recreate password hash...");
    const newHash = await bcrypt.hash(testPassword, 10);
    
    await prisma.user.update({
      where: { email },
      data: { password: newHash },
    });
    
    console.log("✅ Password updated!");
  }

  await prisma.$disconnect();
}

testAuth();
