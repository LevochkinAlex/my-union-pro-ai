/**
 * Генератор красивых карточек с промокодами
 * Создает PNG изображение с QR-кодом, промокодом и информацией о пользователе
 * Или карточку без промокода с изображением и описанием скидки
 */

import QRCode from 'qrcode';

interface PromoCardData {
  promoCode?: string; // Опционально
  userName: string;
  discountName: string;
  discountDescription?: string; // Описание для карточек без промокода
  imageUrl?: string;
  validUntil?: Date;
}

/**
 * Вспомогательная функция для обрезки текста по ширине
 */
function truncateText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  const width = ctx.measureText(text).width;
  if (width <= maxWidth) {
    return text;
  }
  
  let truncated = text;
  while (ctx.measureText(truncated + '...').width > maxWidth && truncated.length > 0) {
    truncated = truncated.slice(0, -1);
  }
  return truncated + '...';
}

/**
 * Разбивает текст на строки по максимальной ширине
 */
function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let currentLine = '';

  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    const metrics = ctx.measureText(testLine);
    
    if (metrics.width > maxWidth && currentLine) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = testLine;
    }
  }
  
  if (currentLine) {
    lines.push(currentLine);
  }
  
  return lines;
}

/**
 * Генерирует красивую карточку в формате Blob
 */
export async function generatePromoCard(data: PromoCardData): Promise<Blob> {
  const {
    promoCode,
    userName,
    discountName,
    discountDescription,
    imageUrl,
    validUntil,
  } = data;

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  
  if (!ctx) {
    throw new Error('Failed to get canvas context');
  }

  const width = 1200;
  const height = 630;
  canvas.width = width;
  canvas.height = height;

  // Фон с градиентом
  const gradient = ctx.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, '#667eea');
  gradient.addColorStop(1, '#764ba2');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  // Белая карточка с тенью
  ctx.shadowColor = 'rgba(0, 0, 0, 0.3)';
  ctx.shadowBlur = 20;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 10;
  
  const cardPadding = 40;
  const cardX = cardPadding;
  const cardY = cardPadding;
  const cardWidth = width - cardPadding * 2;
  const cardHeight = height - cardPadding * 2;
  
  ctx.fillStyle = '#ffffff';
  ctx.roundRect(cardX, cardY, cardWidth, cardHeight, 20);
  ctx.fill();
  
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;

  // Логотип MyUnion (левый верхний угол)
  ctx.fillStyle = '#667eea';
  ctx.font = 'bold 32px Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
  ctx.fillText('MyUnion', cardX + 30, cardY + 50);

  if (promoCode) {
    // РЕЖИМ С ПРОМОКОДОМ: QR + промокод
    
    // Название скидки
    ctx.fillStyle = '#1a202c';
    ctx.font = 'bold 28px Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    ctx.textAlign = 'left';
    const maxTextWidth = cardWidth - 300;
    const truncatedName = truncateText(ctx, discountName, maxTextWidth);
    ctx.fillText(truncatedName, cardX + 30, cardY + 110);

    // QR-код
    const qrSize = 200;
    const qrX = cardX + cardWidth - qrSize - 30;
    const qrY = cardY + 30;
    
    try {
      const qrDataUrl = await QRCode.toDataURL(promoCode, {
        width: qrSize,
        margin: 1,
        color: {
          dark: '#1a202c',
          light: '#ffffff',
        },
      });
      
      const qrImage = new Image();
      await new Promise((resolve, reject) => {
        qrImage.onload = resolve;
        qrImage.onerror = reject;
        qrImage.src = qrDataUrl;
      });
      
      ctx.drawImage(qrImage, qrX, qrY, qrSize, qrSize);
    } catch (error) {
      console.error('Failed to generate QR code:', error);
    }

    // Промокод
    const promoY = cardY + 200;
    ctx.fillStyle = '#1a202c';
    ctx.font = 'bold 40px Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('Промокод:', cardX + 30, promoY);
    
    const codeY = promoY + 55;
    const codeX = cardX + 30;
    const codeBoxWidth = cardWidth - 300;
    const codeBoxHeight = 80;
    
    ctx.fillStyle = '#f7fafc';
    ctx.roundRect(codeX, codeY, codeBoxWidth, codeBoxHeight, 10);
    ctx.fill();
    
    ctx.strokeStyle = '#667eea';
    ctx.lineWidth = 3;
    ctx.roundRect(codeX, codeY, codeBoxWidth, codeBoxHeight, 10);
    ctx.stroke();
    
    ctx.fillStyle = '#667eea';
    ctx.font = 'bold 42px "Courier New", Courier, monospace';
    ctx.textAlign = 'center';
    ctx.fillText(promoCode, codeX + codeBoxWidth / 2, codeY + 55);

  } else {
    // РЕЖИМ БЕЗ ПРОМОКОДА: Картинка + описание
    
    // Название скидки
    ctx.fillStyle = '#1a202c';
    ctx.font = 'bold 36px Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    ctx.textAlign = 'left';
    
    const titleLines = wrapText(ctx, discountName, cardWidth - 60);
    let currentY = cardY + 110;
    titleLines.slice(0, 2).forEach((line) => {
      ctx.fillText(line, cardX + 30, currentY);
      currentY += 45;
    });

    // Картинка скидки (если есть)
    if (imageUrl) {
      try {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        await new Promise((resolve, reject) => {
          img.onload = resolve;
          img.onerror = () => resolve(null); // Игнорируем ошибки загрузки
          img.src = imageUrl;
        });
        
        if (img.complete && img.naturalWidth > 0) {
          const imgSize = 200;
          const imgX = cardX + cardWidth - imgSize - 30;
          const imgY = cardY + 30;
          
          // Рисуем картинку с закругленными углами
          ctx.save();
          ctx.beginPath();
          ctx.roundRect(imgX, imgY, imgSize, imgSize, 15);
          ctx.clip();
          ctx.drawImage(img, imgX, imgY, imgSize, imgSize);
          ctx.restore();
          
          // Рамка вокруг картинки
          ctx.strokeStyle = '#e2e8f0';
          ctx.lineWidth = 2;
          ctx.roundRect(imgX, imgY, imgSize, imgSize, 15);
          ctx.stroke();
        }
      } catch (error) {
        console.error('Failed to load discount image:', error);
      }
    }

    // Описание скидки
    if (discountDescription) {
      currentY += 30;
      ctx.fillStyle = '#4a5568';
      ctx.font = '20px Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
      
      const descLines = wrapText(ctx, discountDescription, cardWidth - 280);
      descLines.slice(0, 4).forEach((line) => {
        ctx.fillText(line, cardX + 30, currentY);
        currentY += 30;
      });
    }
  }

  // Информация о пользователе и сроке действия (внизу)
  ctx.textAlign = 'left';
  ctx.font = '20px Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
  ctx.fillStyle = '#4a5568';
  
  const infoY = cardY + cardHeight - 80;
  ctx.fillText(`👤 ${userName}`, cardX + 30, infoY);
  
  if (validUntil) {
    const dateStr = validUntil.toLocaleDateString('ru-RU', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
    ctx.fillText(`⏰ Действует до: ${dateStr}`, cardX + 30, infoY + 35);
  }

  // Конвертируем canvas в Blob
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
      } else {
        reject(new Error('Failed to generate image blob'));
      }
    }, 'image/png');
  });
}
