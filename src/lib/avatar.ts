import { createAvatar } from '@dicebear/core';
import { bottts } from '@dicebear/collection';

export function getFallbackAvatar(seed: string): string {
  const avatar = createAvatar(bottts, {
    seed: seed,
  });
  
  const svgStr = avatar.toString();
  // Properly encode unicode (e.g., em-dashes in SVG metadata) to base64
  try {
    const encoded = encodeURIComponent(svgStr).replace(/%([0-9A-F]{2})/g,
        (match, p1) => String.fromCharCode(parseInt(p1, 16))
    );
    const base64 = typeof window !== 'undefined' ? window.btoa(encoded) : btoa(encoded);
    return `data:image/svg+xml;base64,${base64}`;
  } catch (err) {
    return `data:image/svg+xml,${encodeURIComponent(svgStr)}`;
  }
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
      // 原图已经比缩略图还小, 没必要再压一遍
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
    // 生成缩略图失败(比如格式不支持), 直接退回用原图, 不影响主流程
    return blob;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
