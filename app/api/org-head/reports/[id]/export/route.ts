/**
 * GET /api/org-head/reports/[id]/export?format=xlsx|pdf
 * Экспорт отчёта — делегирует в ppo-head export (который поддерживает org-head)
 */
import { NextRequest, NextResponse } from "next/server";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { searchParams } = new URL(request.url);
  const format = searchParams.get("format") || "xlsx";

  const baseUrl = request.nextUrl.origin;
  const redirectUrl = `${baseUrl}/api/ppo-head/reports/${id}/export?format=${format}`;

  return NextResponse.redirect(redirectUrl, 307);
}
