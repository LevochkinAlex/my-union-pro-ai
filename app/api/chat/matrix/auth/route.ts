import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { 
  registerMatrixUser, 
  loginMatrixUser, 
  generateMatrixUsername 
} from '@/lib/matrix-client';

/**
 * POST /api/chat/matrix/auth
 * Get or create Matrix credentials for current user
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        matrixUserId: true,
        matrixAccessToken: true
      }
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // If user already has Matrix credentials, try to login
    if (user.matrixUserId && user.matrixAccessToken) {
      // Validate token by trying to use it
      const response = await fetch(`${process.env.MATRIX_SERVER_URL}/_matrix/client/v3/account/whoami`, {
        headers: { 'Authorization': `Bearer ${user.matrixAccessToken}` }
      });

      if (response.ok) {
        return NextResponse.json({
          userId: user.matrixUserId,
          accessToken: user.matrixAccessToken,
          serverUrl: process.env.NEXT_PUBLIC_MATRIX_URL || 'https://matrix.myunion.pro'
        });
      }

      // Token expired, need to re-login
    }

    // Generate Matrix credentials
    const matrixUsername = generateMatrixUsername(user.id);
    const matrixPassword = `mu_${user.id}_${Date.now()}`; // Secure random password
    const displayName = [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email || 'User';

    // Try to login first (user might already exist)
    let matrixUser = await loginMatrixUser(matrixUsername, matrixPassword);

    // If login failed, register new user
    if (!matrixUser) {
      matrixUser = await registerMatrixUser(matrixUsername, matrixPassword, displayName);
    }

    if (!matrixUser) {
      return NextResponse.json(
        { error: 'Failed to create Matrix account' },
        { status: 500 }
      );
    }

    // Save Matrix credentials to user
    await prisma.user.update({
      where: { id: user.id },
      data: {
        matrixUserId: matrixUser.userId,
        matrixAccessToken: matrixUser.accessToken
      }
    });

    return NextResponse.json({
      userId: matrixUser.userId,
      accessToken: matrixUser.accessToken,
      serverUrl: process.env.NEXT_PUBLIC_MATRIX_URL || 'https://matrix.myunion.pro'
    });

  } catch (error) {
    console.error('Matrix auth error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
