#!/usr/bin/env node

/**
 * Script to generate test documents for a user
 * Usage: node scripts/generate-test-documents.mjs <userId>
 */

import { PrismaClient } from "@prisma/client";
import { generateMembershipApplication, generateContributionsApplication } from "../lib/documents.ts";

const prisma = new PrismaClient();

async function main() {
  // Get user ID from command line or use test user
  const userId = process.argv[2];

  if (!userId) {
    console.error("❌ Usage: node scripts/generate-test-documents.mjs <userId>");
    process.exit(1);
  }

  console.log(`📋 Generating documents for user: ${userId}`);

  try {
    // Get user
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { organization: true },
    });

    if (!user) {
      console.error(`❌ User not found: ${userId}`);
      process.exit(1);
    }

    console.log(`👤 User: ${user.firstName} ${user.lastName}`);

    // Check if profile is complete
    const isComplete =
      user.firstName &&
      user.lastName &&
      user.dateOfBirth &&
      user.phone &&
      user.address &&
      user.jobTitle &&
      user.profession &&
      user.education;

    if (!isComplete) {
      console.log("\n⚠️  Profile is incomplete. Missing fields:");
      if (!user.firstName) console.log("  - firstName");
      if (!user.lastName) console.log("  - lastName");
      if (!user.dateOfBirth) console.log("  - dateOfBirth");
      if (!user.phone) console.log("  - phone");
      if (!user.address) console.log("  - address");
      if (!user.jobTitle) console.log("  - jobTitle");
      if (!user.profession) console.log("  - profession");
      if (!user.education) console.log("  - education");

      console.log("\n📝 Filling profile with test data...");

      // Fill profile with test data
      await prisma.user.update({
        where: { id: userId },
        data: {
          firstName: user.firstName || "Иван",
          lastName: user.lastName || "Иванов",
          middleName: user.middleName || "Иванович",
          dateOfBirth: user.dateOfBirth || new Date("1985-03-15"),
          phone: user.phone || "+7 (800) 555-35-35",
          address: user.address || "ул. Пушкина, д. 10, кв. 42, г. Москва",
          jobTitle: user.jobTitle || "Инженер",
          profession: user.profession || "Инженер-программист",
          education: user.education || "Высшее (бакалавриат)",
        },
      });

      console.log("✅ Profile updated!");
    }

    // Get updated user
    const updatedUser = await prisma.user.findUnique({
      where: { id: userId },
      include: { organization: true },
    });

    const ppoChairman = updatedUser.organization?.chairmanName || "Председатель ППО";

    console.log("\n📄 Generating documents...");

    // Generate documents
    const [membershipPath, contributionsPath] = await Promise.all([
      generateMembershipApplication(updatedUser, ppoChairman),
      generateContributionsApplication(updatedUser, ppoChairman),
    ]);

    console.log("✅ Documents generated!");
    console.log(`  - Membership: ${membershipPath}`);
    console.log(`  - Contributions: ${contributionsPath}`);

    // Check for existing documents
    const existingDocs = await prisma.document.findMany({
      where: {
        userId: userId,
        type: { in: ["MEMBERSHIP_APPLICATION", "CONTRIBUTION_APPLICATION"] },
      },
    });

    console.log(`\n📊 Existing documents: ${existingDocs.length}`);
    existingDocs.forEach((doc) => {
      console.log(`  - ${doc.type}: ${doc.fileName}`);
    });

    // Create documents in database if they don't exist
    if (existingDocs.length === 0) {
      console.log("\n💾 Saving documents to database...");

      await Promise.all([
        prisma.document.create({
          data: {
            type: "MEMBERSHIP_APPLICATION",
            status: "DRAFT",
            title: "Заявление о вступлении в профсоюз",
            filePath: membershipPath,
            fileName: `membership_${userId}.pdf`,
            userId: userId,
            organizationId: updatedUser.organizationId || null,
          },
        }),
        prisma.document.create({
          data: {
            type: "CONTRIBUTION_APPLICATION",
            status: "DRAFT",
            title: "Заявление о взносах",
            filePath: contributionsPath,
            fileName: `contributions_${userId}.pdf`,
            userId: userId,
            organizationId: updatedUser.organizationId || null,
          },
        }),
      ]);

      console.log("✅ Documents saved!");
    }

    // Show summary
    console.log("\n✨ Success! Documents are ready:");
    console.log("  1. Membership Application");
    console.log("  2. Contribution Application");

    process.exit(0);
  } catch (error) {
    console.error("❌ Error:", error.message);
    process.exit(1);
  }
}

main();

