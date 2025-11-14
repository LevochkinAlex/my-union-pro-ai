import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { verifyUploadedDocument, verifyDocumentWithAI } from "@/lib/document-verification";

/**
 * Проверка загруженного документа
 * GET /api/documents/[id]/verify - проверка документа
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Не авторизован" },
        { status: 401 }
      );
    }

    const { id: documentId } = await params;
    const searchParams = request.nextUrl.searchParams;
    const useAI = searchParams.get("ai") === "true";

    // Проверяем документ
    const verificationResult = useAI
      ? await verifyDocumentWithAI(documentId, session.user.id)
      : await verifyUploadedDocument(documentId, session.user.id);

    return NextResponse.json(verificationResult);
  } catch (error) {
    console.error("Error verifying document:", error);
    return NextResponse.json(
      { error: "Ошибка при проверке документа" },
      { status: 500 }
    );
  }
}

