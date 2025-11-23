#!/usr/bin/env node

/**
 * Check user documents to debug bot behavior
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function checkDocs() {
  try {
    // Найти пользователя по email или ID
    const email = process.argv[2] || "ceo@yappix.ru";
    
    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      console.error(`❌ User not found: ${email}`);
      process.exit(1);
    }

    console.log(`👤 User: ${user.email} (${user.id})\n`);

    const docs = await prisma.document.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
    });

    console.log(`📄 Documents: ${docs.length}\n`);

    if (docs.length === 0) {
      console.log("No documents found");
    } else {
      docs.forEach((doc, i) => {
        console.log(`${i + 1}. ${doc.type}`);
        console.log(`   Status: ${doc.status}`);
        console.log(`   Title: ${doc.title}`);
        console.log(`   Created: ${doc.createdAt.toLocaleString()}`);
        console.log();
      });
    }

    // Проверяем логику hasGeneratedDocuments
    const generatedDocs = await prisma.document.findMany({
      where: {
        userId: user.id,
        type: {
          in: ["MEMBERSHIP_APPLICATION", "CONTRIBUTION_APPLICATION"],
        },
        status: {
          not: "DRAFT",
        },
      },
      take: 1,
    });

    const hasGeneratedDocuments = generatedDocs.length > 0;
    console.log(`\n✅ hasGeneratedDocuments: ${hasGeneratedDocuments}`);
    
    if (hasGeneratedDocuments) {
      console.log(`   Found ${generatedDocs.length} non-draft documents`);
      console.log(`   Bot should NOT ask to fill profile again`);
    } else {
      console.log(`   No generated documents found`);
      console.log(`   Bot WILL ask to fill profile`);
    }

  } catch (error) {
    console.error("❌ Error:", error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

checkDocs();

