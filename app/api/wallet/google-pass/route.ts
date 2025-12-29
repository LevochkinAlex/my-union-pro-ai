import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { createDiscountPass } from '@/lib/google-pay-passes';

/**
 * API endpoint для генерации Google Pay pass для Android
 * 
 * Требования:
 * 1. GOOGLE_PAY_ISSUER_ID в .env.local
 * 2. Включенный Google Pay Passes API в Google Cloud Console
 * 3. Service Account с правами на Google Pay API
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Проверяем наличие Issuer ID
    if (!process.env.GOOGLE_PAY_ISSUER_ID) {
      console.warn('GOOGLE_PAY_ISSUER_ID is not set, returning fallback');
      const body = await request.json();
      return NextResponse.json(
        {
          error: 'Google Pay integration requires GOOGLE_PAY_ISSUER_ID',
          message: 'Для работы Google Pay необходимо настроить GOOGLE_PAY_ISSUER_ID в .env.local',
          fallback: {
            imageDataUrl: body.imageDataUrl,
          },
        },
        { status: 501 } // Not Implemented
      );
    }

    const body = await request.json();
    const {
      discountId,
      discountTitle,
      promoCode,
      userName,
      validUntil,
      imageDataUrl,
    } = body;

    // Извлекаем URL изображения из dataUrl если нужно
    let imageUrl: string | undefined;
    if (imageDataUrl) {
      // Если это data URL, можно сохранить его или использовать как есть
      // Для Google Pay лучше использовать публичный URL
      // Пока используем data URL, но в продакшене лучше загружать на сервер
      imageUrl = imageDataUrl.startsWith('http') ? imageDataUrl : undefined;
    }

    // Используем сгенерированное изображение карточки как cardImageDataUrl
    // Для Google Wallet лучше загрузить на сервер и использовать публичный URL
    // Пока передаем dataUrl, но Google Wallet может не принять его напрямую
    // В продакшене нужно загрузить изображение и получить публичный URL
    const cardImageDataUrl = imageDataUrl?.startsWith('http') ? imageDataUrl : undefined;

    console.log('[Google Pay API] Creating discount pass:', {
      discountId,
      discountTitle,
      userId: String(session.user.id),
      userName: userName || session.user.email || 'Пользователь',
      promoCode,
      validUntil,
      hasImageUrl: !!imageUrl,
      hasCardImageDataUrl: !!cardImageDataUrl,
    });

    // Создаем пропуск
    const { saveUrl, jwt } = await createDiscountPass(
      discountId,
      discountTitle,
      String(session.user.id),
      userName || session.user.email || 'Пользователь',
      promoCode,
      validUntil,
      imageUrl,
      cardImageDataUrl
    );

    console.log('[Google Pay API] Pass created successfully:', { saveUrl: saveUrl.substring(0, 100) + '...' });

    return NextResponse.json({
      saveUrl,
      jwt,
    });
  } catch (error) {
    console.error('[Google Pay API] Error generating pass:', error);
    console.error('[Google Pay API] Error details:', {
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
    });
    
    // Если ошибка связана с настройкой API, возвращаем fallback
    if (error instanceof Error && (
      error.message.includes('GOOGLE_PAY_ISSUER_ID') ||
      error.message.includes('401') ||
      error.message.includes('403')
    )) {
      try {
        const body = await request.json().catch(() => ({}));
        return NextResponse.json(
          {
            error: 'Google Pay API configuration error',
            message: error.message,
            fallback: {
              imageDataUrl: body.imageDataUrl,
            },
          },
          { status: 501 }
        );
      } catch (e) {
        return NextResponse.json(
          {
            error: 'Google Pay API configuration error',
            message: error.message,
          },
          { status: 501 }
        );
      }
    }

    return NextResponse.json(
      { 
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
        stack: process.env.NODE_ENV === 'development' && error instanceof Error ? error.stack : undefined,
      },
      { status: 500 }
    );
  }
}

