import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

// GET /api/chat/users/find?matrixUserId=... - Find user by Matrix user ID
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const matrixUserId = searchParams.get('matrixUserId')?.trim();

    if (!matrixUserId) {
      return NextResponse.json({ error: 'matrixUserId is required' }, { status: 400 });
    }

    // Find user by matrixUserId
    const user = await prisma.user.findFirst({
      where: {
        matrixUserId: matrixUserId,
        id: { not: session.user.id }, // Exclude current user
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        avatarUrl: true,
        matrixUserId: true,
        jobTitle: true,
        organization: {
          select: { name: true }
        }
      }
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    return NextResponse.json({
      user: {
        id: user.id,
        matrixUserId: user.matrixUserId,
        displayName: [user.firstName, user.lastName].filter(Boolean).join(' ') || 'Пользователь',
        avatarUrl: user.avatarUrl,
        position: user.jobTitle,
        organization: user.organization?.name,
      }
    });
  } catch (error) {
    console.error('Error finding user:', error);
    return NextResponse.json({ error: 'Search failed' }, { status: 500 });
  }
}
