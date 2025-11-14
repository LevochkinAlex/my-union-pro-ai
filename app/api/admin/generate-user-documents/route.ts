import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import type { Session } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Logger } from "@/lib/logger";
import { generateMembershipApplication, generateContributionsApplication } from "@/lib/documents";

/**
 * Force generate documents for a specific user
 * POST /api/admin/generate-user-documents
 * 
 * Body: { userId: string }
 */
export async function POST(request: NextRequest) {
  let session: Session | null = null;
  try {
    session = await getServerSession(authOptions);

    // Check authorization - only admins
    const role = session?.user?.role as string | undefined;
    if (!role || !["SUPER_ADMIN", "ADMIN"].includes(role)) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 403 }
      );
    }

    const { userId } = await request.json();

    if (!userId) {
      return NextResponse.json(
        { error: "userId is required" },
        { status: 400 }
      );
    }

    console.log(`[generate-documents] Forcing document generation for user: ${userId}`);

    // Get user with organization
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { organization: true },
    });

    if (!user) {
      return NextResponse.json(
        { error: "User not found" },
        { status: 404 }
      );
    }

    console.log(`[generate-documents] Found user: ${user.firstName} ${user.lastName}`);

    // Check if profile is complete
    const isProfileComplete =
      user.firstName &&
      user.lastName &&
      user.dateOfBirth &&
      user.phone &&
      user.address &&
      user.jobTitle &&
      user.profession &&
      user.education;

    const profileStatus = {
      complete: isProfileComplete,
      fields: {
        firstName: !!user.firstName,
        lastName: !!user.lastName,
        dateOfBirth: !!user.dateOfBirth,
        phone: !!user.phone,
        address: !!user.address,
        jobTitle: !!user.jobTitle,
        profession: !!user.profession,
        education: !!user.education,
      },
    };

    if (!isProfileComplete) {
      console.warn(`[generate-documents] Profile incomplete for user ${userId}`, profileStatus);
      return NextResponse.json({
        success: false,
        error: "Profile is incomplete",
        profile: profileStatus,
        user: {
          id: user.id,
          email: user.email,
          name: `${user.firstName} ${user.lastName}`,
        },
      }, { status: 400 });
    }

    console.log(`[generate-documents] Profile is complete for user ${userId}`);

    // Generate documents
    try {
      const ppoChairman = user.organization?.chairmanName || "Председатель ПОО";

      console.log(`[generate-documents] Generating documents for ${user.firstName} ${user.lastName}...`);

      let membershipPath: string;
      let contributionsPath: string;
      
      try {
        console.log("[generate-documents] Generating membership application...");
        membershipPath = await generateMembershipApplication(user, ppoChairman);
        console.log(`[generate-documents] Membership generated: ${membershipPath}`);
      } catch (membershipError) {
        console.error("[generate-documents] Error generating membership:", membershipError);
        throw new Error(`Ошибка при генерации заявления о вступлении: ${membershipError instanceof Error ? membershipError.message : String(membershipError)}`);
      }

      try {
        console.log("[generate-documents] Generating contributions application...");
        contributionsPath = await generateContributionsApplication(user, ppoChairman);
        console.log(`[generate-documents] Contributions generated: ${contributionsPath}`);
      } catch (contribError) {
        console.error("[generate-documents] Error generating contributions:", contribError);
        throw new Error(`Ошибка при генерации заявления о взносах: ${contribError instanceof Error ? contribError.message : String(contribError)}`);
      }

      console.log(`[generate-documents] Documents generated: ${membershipPath}, ${contributionsPath}`);

      // Check for existing documents
      const existingDocs = await prisma.document.findMany({
        where: {
          userId: userId,
          type: { in: ["MEMBERSHIP_APPLICATION", "CONTRIBUTION_APPLICATION"] },
        },
      });

      if (existingDocs.length > 0) {
        console.log(`[generate-documents] Removing ${existingDocs.length} existing documents`);
        await prisma.document.deleteMany({
          where: {
            id: { in: existingDocs.map(doc => doc.id) },
          },
        });
      }

      // Save new documents to database
      const [membershipDoc, contributionDoc] = await Promise.all([
        prisma.document.create({
          data: {
            type: "MEMBERSHIP_APPLICATION",
            status: "DRAFT",
            title: "Заявление о вступлении в профсоюз",
            filePath: membershipPath,
            fileName: `membership_${userId}.pdf`,
            userId: userId,
            organizationId: user.organizationId || null,
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
            organizationId: user.organizationId || null,
          },
        }),
      ]);

      console.log(`[generate-documents] ✅ Documents saved to DB for user ${userId}`);

      return NextResponse.json({
        success: true,
        message: "Documents generated successfully",
        user: {
          id: user.id,
          email: user.email,
          name: `${user.firstName} ${user.lastName}`,
        },
        documents: [
          {
            id: membershipDoc.id,
            type: "MEMBERSHIP_APPLICATION",
            title: membershipDoc.title,
            fileName: membershipDoc.fileName,
          },
          {
            id: contributionDoc.id,
            type: "CONTRIBUTION_APPLICATION",
            title: contributionDoc.title,
            fileName: contributionDoc.fileName,
          },
        ],
      });
    } catch (generateError) {
      console.error(`[generate-documents] Error generating documents:`, generateError);
      
      await Logger.error(
        "api/admin/generate-user-documents/POST",
        "Failed to generate documents",
        generateError,
        { userId },
        session?.user?.id
      );
      
      return NextResponse.json(
        {
          success: false,
          error: "Failed to generate documents",
          details: generateError instanceof Error ? generateError.message : String(generateError),
        },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error("[generate-documents] Error:", error);
    
    await Logger.error(
      "api/admin/generate-user-documents/POST",
      "Unhandled error in document generation",
      error,
      {},
      session?.user?.id
    );
    
    return NextResponse.json(
      {
        success: false,
        error: "Internal server error",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}

/**
 * Force generate documents for all users with complete profiles
 * POST /api/admin/generate-user-documents?all=true
 */
export async function PUT(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    // Check authorization - only super admins
    if (session?.user?.role !== "SUPER_ADMIN") {
      return NextResponse.json(
        { error: "Only super admins can generate documents for all users" },
        { status: 403 }
      );
    }

    console.log("[generate-documents-all] Starting bulk document generation...");

    // Get all users with complete profiles and no documents
    const users = await prisma.user.findMany({
      where: {
        AND: [
          { firstName: { not: null } },
          { lastName: { not: null } },
          { dateOfBirth: { not: null } },
          { phone: { not: null } },
          { address: { not: null } },
          { jobTitle: { not: null } },
          { profession: { not: null } },
          { education: { not: null } },
        ],
      },
      include: { organization: true, documents: true },
    });

    console.log(`[generate-documents-all] Found ${users.length} users with complete profiles`);

    const results = {
      total: users.length,
      generated: 0,
      skipped: 0,
      errors: 0,
      details: [] as any[],
    };

    // Generate documents for each user
    for (const user of users) {
      try {
        // Skip if user already has documents
        if (user.documents && user.documents.length >= 2) {
          console.log(`[generate-documents-all] Skipping ${user.email} - already has documents`);
          results.skipped++;
          results.details.push({
            email: user.email,
            status: "skipped",
            reason: "already has documents",
          });
          continue;
        }

        const ppoChairman = user.organization?.chairmanName || "Председатель ППО";

        console.log(`[generate-documents-all] Generating for ${user.email}...`);

        const [membershipPath, contributionsPath] = await Promise.all([
          generateMembershipApplication(user, ppoChairman),
          generateContributionsApplication(user, ppoChairman),
        ]);

        // Delete old documents if any
        if (user.documents && user.documents.length > 0) {
          await prisma.document.deleteMany({
            where: { id: { in: user.documents.map(d => d.id) } },
          });
        }

        // Create new documents
        await Promise.all([
          prisma.document.create({
            data: {
              type: "MEMBERSHIP_APPLICATION",
              status: "DRAFT",
              title: "Заявление о вступлении в профсоюз",
              filePath: membershipPath,
              fileName: `membership_${user.id}.pdf`,
              userId: user.id,
              organizationId: user.organizationId || null,
            },
          }),
          prisma.document.create({
            data: {
              type: "CONTRIBUTION_APPLICATION",
              status: "DRAFT",
              title: "Заявление о взносах",
              filePath: contributionsPath,
              fileName: `contributions_${user.id}.pdf`,
              userId: user.id,
              organizationId: user.organizationId || null,
            },
          }),
        ]);

        console.log(`[generate-documents-all] ✅ Generated for ${user.email}`);
        results.generated++;
        results.details.push({
          email: user.email,
          status: "generated",
        });
      } catch (error) {
        console.error(`[generate-documents-all] Error for ${user.email}:`, error);
        results.errors++;
        results.details.push({
          email: user.email,
          status: "error",
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    console.log(`[generate-documents-all] Bulk generation complete:`, results);

    return NextResponse.json({
      success: true,
      message: "Bulk document generation completed",
      results,
    });
  } catch (error) {
    console.error("[generate-documents-all] Error:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Internal server error",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}

