import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { searchCompanies, getCompanyByInn } from "@/lib/dadata";

/**
 * GET /api/dadata/companies?query=... - Поиск компаний
 * GET /api/dadata/companies?inn=... - Получить компанию по ИНН
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Не авторизован" },
        { status: 401 }
      );
    }

    const searchParams = request.nextUrl.searchParams;
    const query = searchParams.get("query");
    const inn = searchParams.get("inn");

    // Поиск по ИНН
    if (inn) {
      const company = await getCompanyByInn(inn);
      
      if (!company) {
        return NextResponse.json(
          { error: "Компания не найдена" },
          { status: 404 }
        );
      }

      return NextResponse.json({
        success: true,
        company,
      });
    }

    // Поиск по названию
    if (!query) {
      return NextResponse.json(
        { error: "Необходимо указать query или inn" },
        { status: 400 }
      );
    }

    const companies = await searchCompanies(query);

    return NextResponse.json({
      success: true,
      suggestions: companies,
    });
  } catch (error: any) {
    console.error("[api/dadata/companies] Error:", error);
    return NextResponse.json(
      { error: error?.message || "Ошибка при поиске компаний" },
      { status: 500 }
    );
  }
}

