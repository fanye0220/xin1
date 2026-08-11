const fs = require('fs');
let content = fs.readFileSync('src/lib/appBridge.ts', 'utf8');

const newSaveToGallery = `export async function saveToGallery(filename: string, buffer: ArrayBuffer): Promise<string | null> {
   if (!isAndroid()) return null;
   try {
      if ((window as any).Android.startExportFile && (window as any).Android.appendExportFile && (window as any).Android.finishExportFile) {
          const CHUNK = 384 * 1024; // 384KB chunks
          const totalSize = buffer.byteLength;
          await (window as any).Android.startExportFile(filename);
          for (let i = 0; i < totalSize; i += CHUNK) {
              const chunkBlob = new Blob([buffer.slice(i, i + CHUNK)]);
              const b64Chunk = await new Promise<string>((resolve, reject) => {
                  const reader = new FileReader();
                  reader.onload = () => resolve((reader.result as string).split(',')[1]);
                  reader.onerror = () => reject(reader.error);
                  reader.readAsDataURL(chunkBlob);
              });
              await (window as any).Android.appendExportFile(filename, b64Chunk);
          }
          return await (window as any).Android.finishExportFile(filename);
      }

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
}`;

content = content.replace(
    /export async function saveToGallery[\s\S]*?\}\n\}/,
    newSaveToGallery
);

fs.writeFileSync('src/lib/appBridge.ts', content);
console.log('Fixed saveToGallery!');
