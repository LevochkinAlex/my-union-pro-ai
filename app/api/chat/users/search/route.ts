import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getOrgHead } from '@/lib/ppo-head-utils';

/**
 * GET /api/chat/users/search
 * Поиск пользователей для создания нового чата.
 * По умолчанию: только пользователи той же организации.
 * Для RPO_HEAD: глобальный поиск по системе.
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });
    }

    const currentUser = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { organizationId: true },
    });
    const myOrgId = currentUser?.organizationId ?? null;
    const orgHead = await getOrgHead(session.user.id);
    const isGlobalSearchAllowed = orgHead?.level === "RPO";

    const searchParams = request.nextUrl.searchParams;
    const q = searchParams.get('q')?.trim();
    const limit = parseInt(searchParams.get('limit') || '50');

    const baseConditions: any[] = [
      { id: { not: session.user.id } },
      { membershipStatus: 'APPROVED' as const },
    ];
    if (!isGlobalSearchAllowed) {
      if (myOrgId !== null) {
        baseConditions.push({ organizationId: myOrgId });
      } else {
        baseConditions.push({ organizationId: null });
      }
    }

    const whereCondition: any = q && q.length >= 2
      ? {
          AND: [
            ...baseConditions,
            {
              OR: [
                { firstName: { contains: q, mode: 'insensitive' as const } },
                { lastName: { contains: q, mode: 'insensitive' as const } },
                { email: { contains: q, mode: 'insensitive' as const } },
                { phone: { contains: q } },
              ],
            },
          ],
        }
      : {
          AND: baseConditions,
        };

    const users = await prisma.user.findMany({
      where: whereCondition,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        middleName: true,
        avatarUrl: true,
        email: true,
        phone: true,
        jobTitle: true,
        profession: true,
        organization: {
          select: { 
            id: true,
            name: true 
          }
        }
      },
      take: Math.min(limit, 100),
      orderBy: [
        { lastName: 'asc' },
        { firstName: 'asc' }
      ]
    });

    const results = users.map(u => ({
      id: u.id,
      firstName: u.firstName,
      lastName: u.lastName,
      middleName: u.middleName,
      avatarUrl: u.avatarUrl,
      email: u.email,
      phone: u.phone,
      jobTitle: u.jobTitle,
      profession: u.profession,
      organization: u.organization ? {
        id: u.organization.id,
        name: u.organization.name,
      } : null,
    }));

    return NextResponse.json({ users: results });
  } catch (error) {
    console.error('[chat/users/search] Error:', error);
    return NextResponse.json({ error: 'Ошибка поиска' }, { status: 500 });
  }
}
