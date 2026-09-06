// CapacitorHttp (native fetch/XHR bridge) has a long-standing bug where it
// mis-serializes `FormData` bodies — boundaries/headers get mangled, which
// servers using strict multipart parsers (like busboy, which SillyTavern
// uses) reject as "Malformed part header". Plain Blob/ArrayBuffer bodies are
// passed through byte-for-byte, so we build the multipart body ourselves as
// a Blob instead of relying on `new FormData()`.
export async function buildMultipartFormData(
  fields: { name: string; value: string }[],
  fileField: { name: string; blob: Blob; filename: string },
): Promise<{ body: Blob; contentType: string }> {
  const boundary = `----MiuFormBoundary${Math.random().toString(16).slice(2)}${Date.now().toString(16)}`;
  const CRLF = '\r\n';
  const parts: BlobPart[] = [];

  for (const f of fields) {
    parts.push(
      `--${boundary}${CRLF}Content-Disposition: form-data; name="${f.name}"${CRLF}${CRLF}${f.value}${CRLF}`,
    );
  }

  parts.push(
    `--${boundary}${CRLF}Content-Disposition: form-data; name="${fileField.name}"; filename="${fileField.filename}"${CRLF}Content-Type: ${fileField.blob.type || 'application/octet-stream'}${CRLF}${CRLF}`,
  );
  parts.push(fileField.blob);
  parts.push(`${CRLF}--${boundary}--${CRLF}`);

  const body = new Blob(parts);
  return { body, contentType: `multipart/form-data; boundary=${boundary}` };
}
