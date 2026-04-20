/**
 * Утилиты для работы с Wallet (Apple Wallet, Google Pay, PDF)
 */

/**
 * Определяет платформу устройства
 */
export function detectPlatform(): 'ios' | 'android' | 'desktop' {
  if (typeof window === 'undefined') {
    return 'desktop';
  }

  const userAgent = window.navigator.userAgent || window.navigator.vendor || (window as any).opera;

  // iOS detection
  if (/iPad|iPhone|iPod/.test(userAgent) && !(window as any).MSStream) {
    return 'ios';
  }

  // Android detection
  if (/android/i.test(userAgent)) {
    return 'android';
  }

  return 'desktop';
}

interface WalletDownloadOptions {
  imageBlob: Blob;
  imageDataUrl: string;
  discountId: number;
  discountTitle: string;
  promoCode?: string;
  userName?: string;
  validUntil?: Date;
}

/**
 * Обрабатывает скачивание в зависимости от платформы
 */
export async function handleWalletDownload(options: WalletDownloadOptions): Promise<void> {
  const platform = detectPlatform();

  switch (platform) {
    case 'desktop':
      await downloadAsPDF(options);
      break;
    case 'ios':
      await downloadForAppleWallet(options);
      break;
    case 'android':
      await downloadForGoogleWallet(options);
      break;
  }
}

/**
 * Конвертирует изображение в PDF - просто вставляет картинку как есть
 */
async function downloadAsPDF(options: WalletDownloadOptions): Promise<void> {
  try {
    // Динамически импортируем jsPDF
    const { default: jsPDF } = await import('jspdf');

    // Загружаем изображение, чтобы узнать его размеры
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = reject;
      img.src = options.imageDataUrl;
    });

    // Конвертируем пиксели в мм (при 96 DPI: 1px = 0.264583mm)
    const pxToMm = 0.264583;
    const imgWidthMm = img.width * pxToMm;
    const imgHeightMm = img.height * pxToMm;

    // Создаем PDF с размерами изображения
    const pdf = new jsPDF({
      orientation: imgWidthMm > imgHeightMm ? 'landscape' : 'portrait',
      unit: 'mm',
      format: [imgWidthMm, imgHeightMm],
    });

    // Просто вставляем изображение на всю страницу (0, 0) с реальными размерами
    pdf.addImage(
      options.imageDataUrl,
      'PNG',
      0,
      0,
      imgWidthMm,
      imgHeightMm
    );

    // Генерируем blob и скачиваем файл
    const pdfBlob = pdf.output('blob');
    const pdfUrl = URL.createObjectURL(pdfBlob);
    
    // Скачиваем файл
    const a = document.createElement('a');
    a.href = pdfUrl;
    a.download = `discount-${options.discountId}.pdf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    // Очищаем URL после загрузки
    setTimeout(() => URL.revokeObjectURL(pdfUrl), 1000);
  } catch (error) {
    console.error('Failed to generate PDF:', error);
    // Fallback: скачиваем как изображение
    downloadImageFallback(options);
  }
}

/**
 * Загружает .pkpass файл для Apple Wallet
 */
async function downloadForAppleWallet(options: WalletDownloadOptions): Promise<void> {
  try {
    // Запрашиваем .pkpass файл с сервера
    const response = await fetch('/api/wallet/apple-pass', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        discountId: options.discountId,
        discountTitle: options.discountTitle,
        promoCode: options.promoCode,
        userName: options.userName,
        validUntil: options.validUntil?.toISOString(),
        imageDataUrl: options.imageDataUrl,
      }),
    });

    // Если API еще не настроен (501), используем fallback
    if (response.status === 501) {
      console.warn('Apple Wallet API not configured, using image fallback');
      downloadImageFallback(options);
      return;
    }

    if (!response.ok) {
      throw new Error('Failed to generate Apple Wallet pass');
    }

    // Проверяем тип ответа
    const contentType = response.headers.get('content-type');
    if (contentType?.includes('application/vnd.apple.pkpass')) {
      // Это .pkpass файл
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `discount-${options.discountId}.pkpass`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      // На iOS это должно автоматически открыть Wallet
    } else {
      // JSON ответ с ошибкой или fallback
      const data = await response.json();
      if (data.fallback?.imageDataUrl) {
        downloadImageFallback(options);
      } else {
        throw new Error(data.message || 'Failed to generate pass');
      }
    }
  } catch (error) {
    console.error('Failed to download Apple Wallet pass:', error);
    // Fallback: скачиваем как изображение
    downloadImageFallback(options);
  }
}

/**
 * Загружает Google Pay pass для Android
 */
async function downloadForGoogleWallet(options: WalletDownloadOptions): Promise<void> {
  try {
    console.log('[Google Wallet] Starting download for Android:', {
      discountId: options.discountId,
      discountTitle: options.discountTitle,
    });

    // Запрашиваем Google Pay pass с сервера
    const response = await fetch('/api/wallet/google-pass', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        discountId: options.discountId,
        discountTitle: options.discountTitle,
        promoCode: options.promoCode,
        userName: options.userName,
        validUntil: options.validUntil?.toISOString(),
        imageDataUrl: options.imageDataUrl,
      }),
    });

    console.log('[Google Wallet] API response status:', response.status);

    // Если API еще не настроен (501), используем fallback
    if (response.status === 501) {
      console.warn('[Google Wallet] API not configured (501), using image fallback');
      downloadImageFallback(options);
      return;
    }

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[Google Wallet] API error:', {
        status: response.status,
        statusText: response.statusText,
        error: errorText,
      });
      throw new Error(`Failed to generate Google Pay pass: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    console.log('[Google Wallet] API response data:', {
      hasSaveUrl: !!data.saveUrl,
      hasJwt: !!data.jwt,
      hasError: !!data.error,
      error: data.error,
      message: data.message,
    });

    // Проверяем наличие ошибки в ответе
    if (data.error) {
      console.error('[Google Wallet] Error in response:', data.error, data.message);
      downloadImageFallback(options);
      return;
    }

    // Если есть URL для добавления в Google Wallet, открываем его
    if (data.saveUrl) {
      console.log('[Google Wallet] Opening saveUrl:', data.saveUrl.substring(0, 100) + '...');
      window.location.href = data.saveUrl;
    } else if (data.jwt) {
      // Если вернулся JWT, открываем его через Google Wallet API
      const saveUrl = `https://pay.google.com/gp/v/save/${data.jwt}`;
      console.log('[Google Wallet] Opening JWT saveUrl:', saveUrl.substring(0, 100) + '...');
      window.location.href = saveUrl;
    } else if (data.fallback?.imageDataUrl) {
      // Fallback на изображение
      console.warn('[Google Wallet] Using fallback image');
      downloadImageFallback(options);
    } else {
      console.error('[Google Wallet] Invalid response:', data);
      throw new Error('Invalid response from Google Pay API');
    }
  } catch (error) {
    console.error('[Google Wallet] Failed to add to Google Wallet:', error);
    console.error('[Google Wallet] Error details:', {
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
    });
    // Fallback: скачиваем как изображение
    alert('Не удалось добавить в Google Wallet. Скачивается изображение карточки.');
    downloadImageFallback(options);
  }
}

/**
 * Вспомогательная функция для скачивания изображения как fallback
 */
function downloadImageFallback(options: WalletDownloadOptions): void {
  const url = URL.createObjectURL(options.imageBlob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `discount-${options.discountId}.png`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

