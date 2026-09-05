export async function extractTavernData(buffer: ArrayBuffer): Promise<any | null> {
  const dataView = new DataView(buffer);
  const uint8 = new Uint8Array(buffer);

  // Check PNG signature
  if (
    uint8[0] !== 0x89 ||
    uint8[1] !== 0x50 ||
    uint8[2] !== 0x4e ||
    uint8[3] !== 0x47 ||
    uint8[4] !== 0x0d ||
    uint8[5] !== 0x0a ||
    uint8[6] !== 0x1a ||
    uint8[7] !== 0x0a
  ) {
    return null;
  }

  let offset = 8;
  let charaData: any | null = null;
  let ccv3Data: any | null = null;

  while (offset < buffer.byteLength) {
    const length = dataView.getUint32(offset);
    const type = String.fromCharCode(
      uint8[offset + 4],
      uint8[offset + 5],
      uint8[offset + 6],
      uint8[offset + 7]
    );

    const dataOffset = offset + 8;
    const data = uint8.slice(dataOffset, dataOffset + length);

    if (type === 'tEXt') {
      const text = new TextDecoder('utf-8').decode(data);
      if (text.startsWith('chara\0')) {
        const payload = text.substring(6);
        if (charaData === null) charaData = parsePayload(payload);
      } else if (text.startsWith('ccv3\0')) {
        const payload = text.substring(5);
        if (ccv3Data === null) ccv3Data = parsePayload(payload);
      }
    } else if (type === 'iTXt') {
      let nullIdx = 0;
      while (nullIdx < data.length && data[nullIdx] !== 0) {
        nullIdx++;
      }
      const keyword = new TextDecoder('utf-8').decode(data.slice(0, nullIdx));
      
      if (keyword === 'chara' || keyword === 'ccv3') {
        const compressionFlag = data[nullIdx + 1];
        let currentIdx = nullIdx + 3;
        let nullsFound = 0;
        while (currentIdx < data.length && nullsFound < 2) {
          if (data[currentIdx] === 0) nullsFound++;
          currentIdx++;
        }
        
        const textData = data.slice(currentIdx);
        
        if (compressionFlag === 0) {
          const payload = new TextDecoder('utf-8').decode(textData);
          if (keyword === 'ccv3' && ccv3Data === null) {
            ccv3Data = parsePayload(payload);
          } else if (keyword === 'chara' && charaData === null) {
            charaData = parsePayload(payload);
          }
        } else if (compressionFlag === 1) {
          try {
            const ds = new DecompressionStream('deflate');
            const writer = ds.writable.getWriter();
            writer.write(textData);
            writer.close();
            
            const reader = ds.readable.getReader();
            const chunks: Uint8Array[] = [];
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              if (value) chunks.push(value);
            }
            
            const totalLength = chunks.reduce((acc, val) => acc + val.length, 0);
            const decompressed = new Uint8Array(totalLength);
            let offset = 0;
            for (const chunk of chunks) {
              decompressed.set(chunk, offset);
              offset += chunk.length;
            }
            
            const payload = new TextDecoder('utf-8').decode(decompressed);
            if (keyword === 'ccv3' && ccv3Data === null) {
              ccv3Data = parsePayload(payload);
            } else if (keyword === 'chara' && charaData === null) {
              charaData = parsePayload(payload);
            }
          } catch (e) {
            console.error("Failed to decompress iTXt chunk", e);
          }
        }
      }
    }

    offset += 8 + length + 4; // length + type + data + crc
  }

  // CCV3 优先：避免文件里同时存在 V2/V3 时被 V2 覆盖，导致 V3 卡片降级、AI 标签丢失。
  return ccv3Data ?? charaData;
}

function parsePayload(payload: string): any | null {
  try {
    // Try parsing as base64 first
    const binString = atob(payload);
    const bytes = Uint8Array.from(binString, (m) => m.codePointAt(0)!);
    const jsonString = new TextDecoder('utf-8').decode(bytes);
    return JSON.parse(jsonString);
  } catch (e) {
    try {
      // Fallback for older/different encoding
      const jsonString = decodeURIComponent(escape(atob(payload)));
      return JSON.parse(jsonString);
    } catch (e2) {
      try {
        // Fallback: maybe it's not base64 encoded at all
        return JSON.parse(payload);
      } catch (e3) {
        console.error("Failed to parse chara payload", e3);
        return null;
      }
    }
  }
}

// CRC32 implementation for PNG chunks
const crcTable: number[] = [];
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    if (c & 1) {
      c = 0xedb88320 ^ (c >>> 1);
    } else {
      c = c >>> 1;
    }
  }
  crcTable[n] = c;
}

function crc32(data: Uint8Array): number {
  let crc = 0xffffffff ^ 0;
  for (let i = 0; i < data.length; i++) {
    crc = (crc >>> 8) ^ crcTable[(crc ^ data[i]) & 0xff];
  }
  return (crc ^ 0xffffffff) >>> 0;
}

export function injectTavernData(originalBuffer: ArrayBuffer, data: any): ArrayBuffer {
  const uint8 = new Uint8Array(originalBuffer);
  
  // Check PNG signature
  if (
    uint8.length < 8 ||
    uint8[0] !== 0x89 ||
    uint8[1] !== 0x50 ||
    uint8[2] !== 0x4e ||
    uint8[3] !== 0x47 ||
    uint8[4] !== 0x0d ||
    uint8[5] !== 0x0a ||
    uint8[6] !== 0x1a ||
    uint8[7] !== 0x0a
  ) {
    throw new Error("Not a valid PNG file");
  }

  const buildChunk = (chunkData: any, prefix: 'chara' | 'ccv3'): Uint8Array => {
    const jsonString = JSON.stringify(chunkData);
    const base64 = btoa(unescape(encodeURIComponent(jsonString)));
    const textData = new TextEncoder().encode(`${prefix}\0${base64}`);

    const chunkLength = textData.length;
    const chunkType = new TextEncoder().encode('tEXt');

    const crcInput = new Uint8Array(4 + chunkLength);
    crcInput.set(chunkType, 0);
    crcInput.set(textData, 4);

    const crc = crc32(crcInput);

    const chunk = new Uint8Array(4 + 4 + chunkLength + 4);
    const view = new DataView(chunk.buffer);
    view.setUint32(0, chunkLength);
    chunk.set(chunkType, 4);
    chunk.set(textData, 8);
    view.setUint32(8 + chunkLength, crc);
    return chunk;
  };

  const isV3 = data?.spec === 'chara_card_v3' || data?.data?.spec === 'chara_card_v3';
  const injectedChunks: Uint8Array[] = [];
  injectedChunks.push(buildChunk(data, isV3 ? 'ccv3' : 'chara'));

  if (isV3) {
    // 酒馆向后兼容：V3 卡片也必须保留一份 V2 chara 数据块，否则导入会直接拒绝读取。
    const compatData = JSON.parse(JSON.stringify(data));
    compatData.spec = 'chara_card_v2';
    compatData.spec_version = '2.0';
    injectedChunks.push(buildChunk(compatData, 'chara'));
  }

  // Reconstruct PNG
  const chunks: Uint8Array[] = [];
  chunks.push(uint8.slice(0, 8)); // Signature

  let offset = 8;
  let charaInjected = false;

  while (offset < originalBuffer.byteLength) {
    const length = new DataView(originalBuffer).getUint32(offset);
    const type = String.fromCharCode(
      uint8[offset + 4],
      uint8[offset + 5],
      uint8[offset + 6],
      uint8[offset + 7]
    );

    const chunkEnd = offset + 8 + length + 4;
    
    if (type === 'tEXt' || type === 'iTXt' || type === 'zTXt') {
      const dataOffset = offset + 8;
      const dataSlice = uint8.slice(dataOffset, dataOffset + length);
      
      let nullIdx = 0;
      while (nullIdx < dataSlice.length && dataSlice[nullIdx] !== 0) {
        nullIdx++;
      }
      const keyword = new TextDecoder('utf-8').decode(dataSlice.slice(0, nullIdx));
      
      if (keyword === 'chara' || keyword === 'ccv3') {
        // Skip existing chara/ccv3 chunk, we will inject ours
        offset = chunkEnd;
        continue;
      }
    }

    if (type === 'IEND' && !charaInjected) {
      injectedChunks.forEach((chunk) => chunks.push(chunk));
      charaInjected = true;
    }

    chunks.push(uint8.slice(offset, chunkEnd));
    offset = chunkEnd;
  }

  // Calculate total length
  const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
  const result = new Uint8Array(totalLength);
  let currentOffset = 0;
  for (const chunk of chunks) {
    result.set(chunk, currentOffset);
    currentOffset += chunk.length;
  }

  return result.buffer;
}
