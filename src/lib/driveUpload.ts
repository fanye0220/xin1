// CapacitorHttp (native fetch/XHR bridge, enabled for the tavern-pull CORS fix)
// has a well-documented bug where Blob/ArrayBuffer request bodies get mangled
// or JSON-stringified on native Android/iOS — uploads that pass an ArrayBuffer
// body work fine on web but silently corrupt or fail on the native app.
// (https://github.com/ionic-team/capacitor/issues/6132, #7473)
//
// Plain string bodies are unaffected, so instead of sending the zip/PNG bytes
// as an ArrayBuffer, we base64-encode them and send a hand-built
// multipart/related body (RFC 2387) — this is a real, first-class Google
// upload format (uploadType=multipart) that lets each part declare its own
// Content-Transfer-Encoding, so the base64 part is decoded server-side.

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 0x8000; // 32KB chunks — avoids call-stack overflow on large files
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode.apply(null, Array.from(chunk));
  }
  return btoa(binary);
}

export async function uploadBlobToDrive(
  accessToken: string,
  fileId: string,
  blob: Blob,
  mimeType: string,
): Promise<Response> {
  const buffer = await blob.arrayBuffer();
  const base64Data = arrayBufferToBase64(buffer);
  const boundary = `----MiuDriveBoundary${Math.random().toString(16).slice(2)}${Date.now().toString(16)}`;

  const body =
    `--${boundary}\r\n` +
    `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
    `{}\r\n` +
    `--${boundary}\r\n` +
    `Content-Type: ${mimeType}\r\n` +
    `Content-Transfer-Encoding: base64\r\n\r\n` +
    `${base64Data}\r\n` +
    `--${boundary}--`;

  return fetch(`https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=multipart`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': `multipart/related; boundary=${boundary}`,
      'X-HTTP-Method-Override': 'PATCH',
    },
    body,
  });
}

export async function createDriveFileWithContent(
  accessToken: string,
  metadata: Record<string, any>,
  blob: Blob,
  mimeType: string,
): Promise<{ ok: boolean; status: number; json: () => Promise<any>; text: () => Promise<string> }> {
  const buffer = await blob.arrayBuffer();
  const base64Data = arrayBufferToBase64(buffer);
  const boundary = `----MiuDriveBoundary${Math.random().toString(16).slice(2)}${Date.now().toString(16)}`;

  const body =
    `--${boundary}\r\n` +
    `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
    `${JSON.stringify(metadata)}\r\n` +
    `--${boundary}\r\n` +
    `Content-Type: ${mimeType}\r\n` +
    `Content-Transfer-Encoding: base64\r\n\r\n` +
    `${base64Data}\r\n` +
    `--${boundary}--`;

  return fetch(`https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': `multipart/related; boundary=${boundary}`,
    },
    body,
  });
}
