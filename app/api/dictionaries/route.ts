import { NextResponse } from "next/server";
import { getJobTitles, getProfessions } from "@/lib/dictionaries";

export async function GET() {
  try {
    const [jobTitles, professions] = await Promise.all([
      getJobTitles(),
      getProfessions(),
    ]);

    return NextResponse.json({
      jobTitles: jobTitles.map((jt) => jt.name),
      professions: professions.map((p) => p.name),
    });
  } catch (error) {
    console.error("Error fetching dictionaries:", error);
    return NextResponse.json(
      { error: "Failed to fetch dictionaries" },
      { status: 500 }
    );
  }
}

