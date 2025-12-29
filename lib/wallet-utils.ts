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

/**
 * Определяет, поддерживает ли устройство Apple Wallet
 */
export function supportsAppleWallet(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }
  
  const platform = detectPlatform();
  if (platform !== 'ios') {
    return false;
  }

  // Проверяем наличие Apple Wallet
  return typeof (window as any).AddPass !== 'undefined' || 
         /iPhone|iPad|iPod/.test(window.navigator.userAgent);
}

/**
 * Определяет, поддерживает ли устройство Google Pay
 */
export function supportsGoogleWallet(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }
  
  const platform = detectPlatform();
  return platform === 'android';
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
 * Конвертирует изображение в PDF и открывает в новой вкладке (для десктопа)
 */
async function downloadAsPDF(options: WalletDownloadOptions): Promise<void> {
  try {
    // Динамически импортируем jsPDF
    const { default: jsPDF } = await import('jspdf');

    // Загружаем изображение
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = reject;
      img.src = options.imageDataUrl;
    });

    // Размеры A4 в мм
    const a4Width = 210;
    const a4Height = 297;
    
    // Рассчитываем размеры изображения, чтобы оно поместилось на A4 с отступами
    const margin = 10; // отступы по 10мм с каждой стороны
    const maxWidth = a4Width - margin * 2;
    const maxHeight = a4Height - margin * 2;
    
    const imgAspectRatio = img.width / img.height;
    const maxAspectRatio = maxWidth / maxHeight;
    
    let pdfImgWidth: number;
    let pdfImgHeight: number;
    
    if (imgAspectRatio > maxAspectRatio) {
      // Изображение шире - используем всю доступную ширину
      pdfImgWidth = maxWidth;
      pdfImgHeight = maxWidth / imgAspectRatio;
    } else {
      // Изображение выше - используем всю доступную высоту
      pdfImgHeight = maxHeight;
      pdfImgWidth = maxHeight * imgAspectRatio;
    }

    // Центрируем изображение на странице
    const x = (a4Width - pdfImgWidth) / 2;
    const y = (a4Height - pdfImgHeight) / 2;

    // Создаем PDF в портретной ориентации A4
    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
    });

    // Добавляем изображение с правильными размерами и центрированием
    pdf.addImage(
      options.imageDataUrl,
      'PNG',
      x,
      y,
      pdfImgWidth,
      pdfImgHeight
    );

    // Генерируем blob и скачиваем файл
    const pdfBlob = pdf.output('blob');
    const pdfUrl = URL.createObjectURL(pdfBlob);
    
    // Скачиваем файл вместо открытия в новой вкладке
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

    // Если API еще не настроен (501), используем fallback
    if (response.status === 501) {
      console.warn('Google Pay API not configured, using image fallback');
      downloadImageFallback(options);
      return;
    }

    if (!response.ok) {
      throw new Error('Failed to generate Google Pay pass');
    }

    const data = await response.json();

    // Если есть URL для добавления в Google Wallet, открываем его
    if (data.saveUrl) {
      window.location.href = data.saveUrl;
    } else if (data.jwt) {
      // Если вернулся JWT, открываем его через Google Wallet API
      window.location.href = `https://pay.google.com/gp/v/save/${data.jwt}`;
    } else if (data.fallback?.imageDataUrl) {
      // Fallback на изображение
      downloadImageFallback(options);
    } else {
      throw new Error('Invalid response from Google Pay API');
    }
  } catch (error) {
    console.error('Failed to add to Google Wallet:', error);
    // Fallback: скачиваем как изображение
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

