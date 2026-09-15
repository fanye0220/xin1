import { createAvatar } from '@dicebear/core';
import { bottts } from '@dicebear/collection';

export function getFallbackAvatar(seed: string, category?: string): string {
  const cat = (category || '').toLowerCase();
  
  if (cat.includes('快') || cat === 'qr' || cat.includes('quick')) {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><linearGradient id="g-qr" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#8b5cf6"/><stop offset="100%" stop-color="#6366f1"/></linearGradient></defs><rect width="100" height="100" rx="24" fill="url(#g-qr)"/><path d="M30 36h40c3.3 0 6 2.7 6 6v20c0 3.3-2.7 6-6 6H46l-12 10v-10h-4c-3.3 0-6-2.7-6-6V42c0-3.3 2.7-6 6-6z" fill="#ffffff" fill-opacity="0.95"/><circle cx="40" cy="52" r="3" fill="#6366f1"/><circle cx="50" cy="52" r="3" fill="#6366f1"/><circle cx="60" cy="52" r="3" fill="#6366f1"/></svg>';
    return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
  }
  if (cat.includes('预设') || cat === 'preset') {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><linearGradient id="g-pre" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#3b82f6"/><stop offset="100%" stop-color="#1d4ed8"/></linearGradient></defs><rect width="100" height="100" rx="24" fill="url(#g-pre)"/><path d="M30 38h40M30 50h40M30 62h40" stroke="#ffffff" stroke-width="4" stroke-linecap="round" fill="none"/><circle cx="42" cy="38" r="6" fill="#ffffff"/><circle cx="58" cy="50" r="6" fill="#ffffff"/><circle cx="38" cy="62" r="6" fill="#ffffff"/></svg>';
    return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
  }
  if (cat.includes('世界书') || cat === 'worldbook') {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><linearGradient id="g-wb" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#10b981"/><stop offset="100%" stop-color="#047857"/></linearGradient></defs><rect width="100" height="100" rx="24" fill="url(#g-wb)"/><path d="M26 34c8-4 16-4 24 2v34c-8-6-16-6-24-2V34zm48 0c-8-4-16-4-24 2v34c8-6 16-6 24-2V34z" fill="#ffffff" fill-opacity="0.95"/></svg>';
    return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
  }
  if (cat.includes('美化') || cat === 'theme') {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><linearGradient id="g-th" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#ec4899"/><stop offset="100%" stop-color="#be185d"/></linearGradient></defs><rect width="100" height="100" rx="24" fill="url(#g-th)"/><path d="M50 26c-13.3 0-24 10.7-24 24 0 10 6 18.5 14.5 21.5 2 .7 4.5-.8 4.5-3v-3c0-3.3 2.7-6 6-6h3c8.8 0 16-7.2 16-16 0-9.9-9-17.5-20-17.5z" fill="#ffffff" fill-opacity="0.95"/><circle cx="38" cy="42" r="3.5" fill="#ec4899"/><circle cx="48" cy="35" r="3.5" fill="#ec4899"/><circle cx="60" cy="40" r="3.5" fill="#ec4899"/><circle cx="66" cy="52" r="3.5" fill="#ec4899"/></svg>';
    return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
  }
  if (cat.includes('脚本') || cat === 'script' || cat.includes('工具') || cat === 'tool') {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><linearGradient id="g-sc" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#f59e0b"/><stop offset="100%" stop-color="#d97706"/></linearGradient></defs><rect width="100" height="100" rx="24" fill="url(#g-sc)"/><path d="M34 40l10 10-10 10M48 60h18" stroke="#ffffff" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>';
    return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
  }

  try {
    const avatar = createAvatar(bottts, {
      seed: seed || 'default',
    });
    const svgStr = avatar.toString();
    try {
      const encoded = encodeURIComponent(svgStr).replace(/%([0-9A-F]{2})/g,
          (match, p1) => String.fromCharCode(parseInt(p1, 16))
      );
      const base64 = typeof window !== 'undefined' ? window.btoa(encoded) : (typeof Buffer !== 'undefined' ? Buffer.from(svgStr).toString('base64') : btoa(encoded));
      return `data:image/svg+xml;base64,${base64}`;
    } catch {
      return `data:image/svg+xml;utf8,${encodeURIComponent(svgStr)}`;
    }
  } catch {
    const fallbackRobot = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><linearGradient id="g-rb" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#6366f1"/><stop offset="100%" stop-color="#4f46e5"/></linearGradient></defs><rect width="100" height="100" rx="24" fill="url(#g-rb)"/><rect x="28" y="32" width="44" height="36" rx="10" fill="#ffffff"/><circle cx="40" cy="48" r="5" fill="#4f46e5"/><circle cx="60" cy="48" r="5" fill="#4f46e5"/><rect x="42" y="58" width="16" height="4" rx="2" fill="#4f46e5"/><rect x="47" y="22" width="6" height="10" rx="3" fill="#ffffff"/><circle cx="50" cy="20" r="4" fill="#ffffff"/></svg>';
    return `data:image/svg+xml;utf8,${encodeURIComponent(fallbackRobot)}`;
  }
}

export function resolveAvatarUrl(avatarFallback: string | undefined | null, seed: string, category?: string): string {
  if (
    avatarFallback &&
    typeof avatarFallback === 'string' &&
    avatarFallback.trim().length > 0 &&
    avatarFallback !== 'undefined' &&
    avatarFallback !== 'null' &&
    !avatarFallback.includes('api.dicebear.com') &&
    (avatarFallback.startsWith('data:image/') ||
     avatarFallback.startsWith('http://') ||
     avatarFallback.startsWith('https://') ||
     avatarFallback.startsWith('blob:'))
  ) {
    return avatarFallback;
  }
  return getFallbackAvatar(seed, category);
}

/**
 * 把一张原图压成一张小缩略图, 专门给列表/卡片这种小尺寸展示场景用,
 * 避免列表里也要解码整张原图(参考卡库的做法: 列表只读小缩略图,
 * 详情页才用原图)。
 *
 * @param blob 原图
 * @param maxSize 缩略图长边最大像素, 默认 200(够卡片列表用了)
 * @param quality JPEG 压缩质量, 默认 0.82
 */
export async function generateThumbnail(
  blob: Blob,
  maxSize: number = 200,
  quality: number = 0.82,
): Promise<Blob> {
  const objectUrl = URL.createObjectURL(blob);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = (e) => reject(e);
      el.src = objectUrl;
    });

    let { width, height } = img;
    if (width <= maxSize && height <= maxSize) {
      return blob;
    }
    if (width > height) {
      height = Math.round((height * maxSize) / width);
      width = maxSize;
    } else {
      width = Math.round((width * maxSize) / height);
      height = maxSize;
    }

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return blob;
    ctx.drawImage(img, 0, 0, width, height);

    const thumbBlob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((b) => resolve(b), 'image/jpeg', quality);
    });
    return thumbBlob || blob;
  } catch {
    return blob;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
