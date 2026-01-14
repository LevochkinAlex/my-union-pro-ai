import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

// GET /api/chat/users/search?q=term - Search users for new chat
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const q = searchParams.get('q')?.trim();

    if (!q || q.length < 2) {
      return NextResponse.json({ users: [] });
    }

    // Search users by name, excluding current user and bot
    const users = await prisma.user.findMany({
      where: {
        AND: [
          { id: { not: session.user.id } },
          { matrixUserId: { not: null } },
          { email: { not: { contains: 'bot@' } } },
          {
            OR: [
              { firstName: { contains: q, mode: 'insensitive' } },
              { lastName: { contains: q, mode: 'insensitive' } },
              { email: { contains: q, mode: 'insensitive' } },
              { phone: { contains: q } },
            ],
          },
        ],
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        avatarUrl: true,
        matrixUserId: true,
        position: true,
        organization: {
          select: { name: true }
        }
      },
      take: 20,
      orderBy: [
        { firstName: 'asc' },
        { lastName: 'asc' }
      ]
    });

    const results = users.map(u => ({
      id: u.id,
      matrixUserId: u.matrixUserId,
      displayName: [u.firstName, u.lastName].filter(Boolean).join(' ') || 'Пользователь',
      avatarUrl: u.avatarUrl,
      position: u.position,
      organization: u.organization?.name,
    }));

    return NextResponse.json({ users: results });
  } catch (error) {
    console.error('Error searching users:', error);
    return NextResponse.json({ error: 'Search failed' }, { status: 500 });
  }
}
