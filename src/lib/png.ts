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
        return parsePayload(payload);
      } else if (text.startsWith('ccv3\0')) {
        const payload = text.substring(5);
        return parsePayload(payload);
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
          return parsePayload(payload);
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
            return parsePayload(payload);
          } catch (e) {
            console.error("Failed to decompress iTXt chunk", e);
          }
        }
      }
    }

    offset += 8 + length + 4; // length + type + data + crc
  }

  return null;
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

  const jsonString = JSON.stringify(data);
  const base64 = btoa(unescape(encodeURIComponent(jsonString)));
  const textData = new TextEncoder().encode(`chara\0${base64}`);

  const chunkLength = textData.length;
  const chunkType = new TextEncoder().encode('tEXt');
  
  const chunkData = new Uint8Array(4 + chunkLength);
  chunkData.set(chunkType, 0);
  chunkData.set(textData, 4);
  
  const crc = crc32(chunkData);
  
  const newChunk = new Uint8Array(4 + 4 + chunkLength + 4);
  const view = new DataView(newChunk.buffer);
  view.setUint32(0, chunkLength);
  newChunk.set(chunkType, 4);
  newChunk.set(textData, 8);
  view.setUint32(8 + chunkLength, crc);

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
      chunks.push(newChunk);
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

/**
 * 导出前标准化世界书条目的 enabled/disable 字段。
 * SillyTavern 同时依赖 disable（旧格式）和 enabled（新格式），
 * 两个字段都必须存在且保持一致，否则导入时启用状态会丢失。
 * 
 * 此函数对 character.data 做深拷贝后处理，不修改原始对象。
 */
export function prepareExportData(data: any): any {
  const exportData = JSON.parse(JSON.stringify(data)); // deep copy，不污染原始数据

  // 兼容 V2（data直接是卡数据）和 V3（data.data 才是卡数据）两种结构
  const targetData = exportData.data ? exportData.data : exportData;

  if (targetData.character_book) {
    targetData.character_book = normalizeWorldbook(targetData.character_book);
  }
  // extensions 里也可能存了一份（嵌入式世界书双写位置）
  if (targetData.extensions?.character_book) {
    targetData.extensions.character_book = normalizeWorldbook(targetData.extensions.character_book);
  }

  return exportData;
}

/**
 * 对单个 worldbook 对象的 entries 做字段标准化。
 */
function normalizeWorldbook(book: any): any {
  if (!book) return book;

  // 统一处理 entries 为数组或对象两种格式
  let entriesArray: any[];
  const isArray = Array.isArray(book.entries);
  const isV3 = !!(book.data && book.data.entries);

  if (isV3) {
    entriesArray = Array.isArray(book.data.entries)
      ? book.data.entries
      : Object.values(book.data.entries);
  } else if (isArray) {
    entriesArray = book.entries;
  } else if (book.entries && typeof book.entries === 'object') {
    entriesArray = Object.values(book.entries);
  } else {
    return book; // 没有 entries，不处理
  }

  const normalized = entriesArray.map((entry: any) => {
    // 以 enabled 优先，其次看 disable 的反值，都没有就默认启用
    const isEnabled =
      entry.enabled !== undefined
        ? Boolean(entry.enabled)
        : entry.disable !== undefined
        ? !entry.disable
        : true;

    return {
      ...entry,
      enabled: isEnabled,   // SillyTavern 新格式
      disable: !isEnabled,  // SillyTavern 旧格式（必须同时写）
    };
  });

  // 按原格式写回
  if (isV3) {
    const wasObjV3 = !Array.isArray(book.data.entries);
    let entriesToSave: any;
    if (wasObjV3) {
      entriesToSave = {};
      normalized.forEach((e: any, i: number) => {
        const uid = e.uid !== undefined ? String(e.uid) : String(i);
        entriesToSave[uid] = { ...e, uid: e.uid !== undefined ? e.uid : i };
      });
    } else {
      entriesToSave = normalized;
    }
    return { ...book, data: { ...book.data, entries: entriesToSave } };
  } else if (isArray) {
    return { ...book, entries: normalized };
  } else {
    // object 格式，保持 key 不变
    const entriesObj: Record<string, any> = {};
    normalized.forEach((e: any, i: number) => {
      const uid = e.uid !== undefined ? String(e.uid) : String(i);
      entriesObj[uid] = { ...e, uid: e.uid !== undefined ? e.uid : i };
    });
    return { ...book, entries: entriesObj };
  }
}
