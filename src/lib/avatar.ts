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
