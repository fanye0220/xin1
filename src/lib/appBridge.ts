export const isAndroid = () => typeof window !== 'undefined' && !!(window as any).Android;

// Get image URL for <img> tags via the custom Android WebView bridge.
export function getLocalImageUrl(filePath: string, cacheBuster?: number | string): string {
  if (isAndroid()) {
    // Standard Android WebViewAssetLoader format used by the user's APK
    if (filePath) {
        let url = `https://appassets.androidplatform.net/localfile?path=${encodeURIComponent(filePath)}`;
        if (cacheBuster) url += `&t=${cacheBuster}`;
        return url;
    }
  }
  return '';
}

export async function shareFileOnAndroid(filename: string, buffer: ArrayBuffer, mimeType?: string): Promise<boolean> {
  if (!isAndroid()) return false;
  try {
     // Delegate to the native Android bridge's own share method, if exposed.
     const androidBridge = (window as any).Android;
     if (androidBridge && typeof androidBridge.shareFile === 'function') {
        const blob = new Blob([buffer], { type: mimeType || 'application/octet-stream' });
        const b64 = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve((reader.result as string).split(',')[1]);
            reader.onerror = () => reject(reader.error);
            reader.readAsDataURL(blob);
        });
        return await androidBridge.shareFile(filename, b64, mimeType || 'application/octet-stream');
     }
     return false;
  } catch (e) {
     console.error("Share failed", e);
     return false;
  }
}


export async function readLocalFileBuffer(path: string): Promise<ArrayBuffer | null> {
  if (!isAndroid()) return null;
  try {
     const url = getLocalImageUrl(path);
     if (!url) return null;
     const res = await fetch(url);
     if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.statusText}`);
     return await res.arrayBuffer();
  } catch (e) {
     console.error("Android bridge read via fetch failed:", e);
     // Fallback to old base64 method if fetch fails (e.g. CORS or not a capacitor path)
     try {
       const b64 = await (window as any).Android.readTavernFile(path);
       if (!b64) return null;
       const binaryString = atob(b64);
       const bytes = new Uint8Array(binaryString.length);
       for (let i = 0; i < binaryString.length; i++) {
           bytes[i] = binaryString.charCodeAt(i);
       }
       return bytes.buffer;
     } catch(fallbackError) {
       console.error("Fallback Android bridge read failed:", fallbackError);
       return null;
     }
  }
}

export async function saveToGallery(filename: string, buffer: ArrayBuffer): Promise<string | null> {
   if (!isAndroid()) return null;
   try {
      const blob = new Blob([buffer]);
      const b64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => {
              const dataUrl = reader.result as string;
              resolve(dataUrl.split(',')[1]);
          };
          reader.onerror = () => reject(reader.error);
          reader.readAsDataURL(blob);
      });
      return await (window as any).Android.saveTavernFile(filename, b64);
   } catch (e) {
      console.error("Android bridge save failed:", e);
      return null;
   }
}

export async function startAndroidZip(filename: string): Promise<boolean> {
  if (!isAndroid() || !(window as any).Android.startZip) return false;
  return await (window as any).Android.startZip(filename);
}

export async function addAndroidZipEntry(zipFilename: string, entryName: string, buffer: ArrayBuffer): Promise<boolean> {
  if (!isAndroid() || !(window as any).Android.addZipEntry) return false;
  try {
     const blob = new Blob([buffer]);
     const b64 = await new Promise<string>((resolve, reject) => {
         const reader = new FileReader();
         reader.onload = () => resolve((reader.result as string).split(',')[1]);
         reader.onerror = () => reject(reader.error);
         reader.readAsDataURL(blob);
     });
     return await (window as any).Android.addZipEntry(zipFilename, entryName, b64);
  } catch (e) {
     return false;
  }
}

export async function addAndroidLocalZipEntry(zipFilename: string, entryName: string, localFilePath: string): Promise<boolean> {
  if (!isAndroid() || !(window as any).Android.addLocalFileToZip) return false;
  return await (window as any).Android.addLocalFileToZip(zipFilename, entryName, localFilePath);
}

export async function finishAndroidZip(zipFilename: string): Promise<string | null> {
  if (!isAndroid() || !(window as any).Android.finishZip) return null;
  return await (window as any).Android.finishZip(zipFilename);
}

export async function deleteLocalGalleryFile(path: string): Promise<boolean> {
  if (!isAndroid()) return false;
  try {
    return await (window as any).Android.deleteFile(path);
  } catch (e) {
    return false;
  }
}

export async function renameLocalGalleryFile(oldPath: string, newPath: string): Promise<boolean> {
  if (!isAndroid() || !(window as any).Android.renameFile) return false;
  try {
    return await (window as any).Android.renameFile(oldPath, newPath);
  } catch (e) {
    return false;
  }
}

export async function pickAndroidFiles(): Promise<string[]> {
  if (!isAndroid()) return [];
  try {
    const jsonStr = await (window as any).Android.pickFiles();
    return JSON.parse(jsonStr || "[]") as string[];
  } catch (e) {
    console.error("Android bridge pick files failed:", e);
    return [];
  }
}

export async function startAndroidTempFile(filename: string): Promise<boolean> {
  if (!isAndroid() || !(window as any).Android.startTempFile) return false;
  return await (window as any).Android.startTempFile(filename);
}

export async function appendAndroidTempFile(filename: string, buffer: ArrayBuffer): Promise<boolean> {
  if (!isAndroid() || !(window as any).Android.appendTempFile) return false;
  try {
     const blob = new Blob([buffer]);
     const b64 = await new Promise<string>((resolve, reject) => {
         const reader = new FileReader();
         reader.onload = () => resolve((reader.result as string).split(',')[1]);
         reader.onerror = () => reject(reader.error);
         reader.readAsDataURL(blob);
     });
     return await (window as any).Android.appendTempFile(filename, b64);
  } catch (e) {
     return false;
  }
}

export async function unzipAndroidTempFile(filename: string, targetFolderName: string = "MIU_Import"): Promise<string[]> {
  if (!isAndroid() || !(window as any).Android.unzipTempFile) return [];
  try {
    const jsonStr = await (window as any).Android.unzipTempFile(filename, targetFolderName);
    return JSON.parse(jsonStr || "[]") as string[];
  } catch (e) {
    console.error("Android bridge unzipTempFile failed:", e);
    return [];
  }
}

/**
 * 委托 Android 原生解压 ZIP 文件。
 * 相比于 JS 层的 JSZip，原生解压不会占用 V8 内存、不卡主线程，且直接落盘文件结构。
 * @param zipFilePath 需要解压的本地 ZIP 绝对路径
 * @param targetFolderName 解压至 Download/MIU/<targetFolderName> 文件夹。不填则为根目录
 * @returns 解压出的所有文件绝对路径列表
 */
export async function unzipOnAndroid(zipFilePath: string, targetFolderName: string = "Extracted"): Promise<string[]> {
  if (!isAndroid() || !(window as any).Android.unzipFile) return [];
  try {
    const jsonStr = await (window as any).Android.unzipFile(zipFilePath, targetFolderName);
    return JSON.parse(jsonStr || "[]") as string[];
  } catch (e) {
    console.error("Android bridge unzip failed:", e);
    return [];
  }
}
