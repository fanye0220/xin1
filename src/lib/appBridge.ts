/**
 * appBridge.ts - Web-only stub
 * All Android-specific functionality removed. These functions are no-ops on web.
 */

export const isAndroid = () => false;

export function getLocalImageUrl(_filePath: string, _cacheBuster?: number | string): string {
  return '';
}

export async function shareFileOnAndroid(_filename: string, _buffer: ArrayBuffer, _mimeType?: string): Promise<boolean> {
  return false;
}

export async function saveToGallery(_filename: string, _buffer: ArrayBuffer): Promise<string | null> {
  return null;
}

export async function deleteLocalGalleryFile(_path: string): Promise<void> {
  // no-op on web
}

export async function readLocalFileBuffer(_path: string): Promise<ArrayBuffer | null> {
  return null;
}

export async function startAndroidZip(_filename: string): Promise<string | null> {
  return null;
}

export async function addAndroidZipEntry(_zipPath: string, _entryPath: string, _data: ArrayBuffer): Promise<void> {
  // no-op on web
}

export async function finishAndroidZip(_zipPath: string): Promise<string | null> {
  return null;
}

export async function startAndroidTempFile(_filename: string): Promise<string | null> {
  return null;
}

export async function appendAndroidTempFile(_path: string, _data: ArrayBuffer): Promise<void> {
  // no-op on web
}

export async function unzipAndroidTempFile(_path: string, _destDir: string): Promise<string | null> {
  return null;
}
