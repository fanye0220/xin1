import { openDB, DBSchema, IDBPDatabase } from 'idb';

export interface Folder {
  id: string;
  name: string;
  createdAt: number;
  parentId?: string | null;
}

export interface CharacterCard {
  id: string;
  name: string;
  avatarBlob?: Blob;
  avatarUrlFallback?: string;
  avatarHistory?: Blob[];
  data: any;
  originalFile?: File;
  createdAt: number;
  updatedAt?: number;
  deletedAt?: number;
  folderId?: string;
  hasBlobsSeparated?: boolean;
}

export interface ChatLog {
  id: string;
  characterId: string;
  name: string;
  messages: any[];
  createdAt: number;
}

interface TavernDB extends DBSchema {
  characters: {
    key: string;
    value: CharacterCard;
    indexes: { 'by-date': number; 'by-folder': string };
  };
  folders: {
    key: string;
    value: Folder;
    indexes: { 'by-date': number };
  };
  blobs: {
    key: string;
    value: { avatarBlob?: Blob; originalFile?: File; avatarHistory?: Blob[] };
  };
  chats: {
    key: string;
    value: ChatLog;
    indexes: { 'by-character': string; 'by-date': number };
  };
}

let dbPromise: Promise<IDBPDatabase<TavernDB>>;

export function initDB() {
  if (!dbPromise) {
    dbPromise = openDB<TavernDB>('tavern-manager-v2', 4, {
      upgrade(db, oldVersion, newVersion, transaction) {
        if (oldVersion < 1) {
          const store = db.createObjectStore('characters', { keyPath: 'id' });
          store.createIndex('by-date', 'createdAt');
        }
        if (oldVersion < 2) {
          const charStore = transaction.objectStore('characters');
          charStore.createIndex('by-folder', 'folderId');
          
          const folderStore = db.createObjectStore('folders', { keyPath: 'id' });
          folderStore.createIndex('by-date', 'createdAt');
        }
        if (oldVersion < 3) {
          db.createObjectStore('blobs');
        }
        if (oldVersion < 4) {
          const chatStore = db.createObjectStore('chats', { keyPath: 'id' });
          chatStore.createIndex('by-character', 'characterId');
          chatStore.createIndex('by-date', 'createdAt');
        }
      },
    });
  }
  return dbPromise;
}

export async function migrateDatabase(onProgress?: (current: number, total: number) => void) {
  const db = await initDB();
  
  const tx = db.transaction('characters', 'readonly');
  const allChars = await tx.objectStore('characters').getAll();
  const unmigrated = allChars.filter(c => !c.hasBlobsSeparated);
  
  if (unmigrated.length === 0) return;

  const CHUNK_SIZE = 50;
  for (let i = 0; i < unmigrated.length; i += CHUNK_SIZE) {
    const chunk = unmigrated.slice(i, i + CHUNK_SIZE);
    const writeTx = db.transaction(['characters', 'blobs'], 'readwrite');
    const charStore = writeTx.objectStore('characters');
    const blobStore = writeTx.objectStore('blobs');
    
    for (const char of chunk) {
      if (char.avatarBlob || char.originalFile || char.avatarHistory) {
        await blobStore.put({
          avatarBlob: char.avatarBlob,
          originalFile: char.originalFile,
          avatarHistory: char.avatarHistory
        }, char.id);
      }
      
      delete char.avatarBlob;
      delete char.originalFile;
      delete char.avatarHistory;
      char.hasBlobsSeparated = true;
      
      await charStore.put(char);
    }
    await writeTx.done;
    
    if (onProgress) {
      onProgress(Math.min(i + CHUNK_SIZE, unmigrated.length), unmigrated.length);
    }
  }
}

export async function getFolders(): Promise<Folder[]> {
  const db = await initDB();
  return db.getAllFromIndex('folders', 'by-date');
}

export async function saveFolder(folder: Folder): Promise<void> {
  const db = await initDB();
  await db.put('folders', folder);
}

export async function deleteFolder(id: string): Promise<void> {
  const db = await initDB();
  const tx = db.transaction(['folders', 'characters'], 'readwrite');
  
  const folderStore = tx.objectStore('folders');
  const charStore = tx.objectStore('characters');
  
  // Find all descendant folders
  const allFolders = await folderStore.getAll();
  const folderIdsToDelete = new Set<string>([id]);
  
  let added = true;
  while (added) {
    added = false;
    for (const f of allFolders) {
      if (f.parentId && folderIdsToDelete.has(f.parentId) && !folderIdsToDelete.has(f.id)) {
        folderIdsToDelete.add(f.id);
        added = true;
      }
    }
  }

  // Delete all identified folders and move their characters to trash
  for (const folderId of folderIdsToDelete) {
    await folderStore.delete(folderId);
    
    const index = charStore.index('by-folder');
    let cursor = await index.openCursor(folderId);
    while (cursor) {
      const char = cursor.value;
      char.deletedAt = Date.now();
      await cursor.update(char);
      cursor = await cursor.continue();
    }
  }
  
  await tx.done;
}

export type SortOption = 'newest_import' | 'oldest_import' | 'recently_modified' | 'a_z' | 'z_a';

export async function getCharacters(
  page: number, 
  pageSize: number, 
  folderId?: string | null, 
  searchQuery: string = '', 
  tags: string[] = [],
  sortBy: SortOption = 'newest_import',
  includeBlobs: boolean = true
): Promise<{ characters: CharacterCard[], total: number }> {
  const db = await initDB();
  const tx = db.transaction('characters', 'readonly');
  const store = tx.store;
  
  let allCharacters: CharacterCard[] = [];

  if (folderId && folderId !== 'all') {
    const index = store.index('by-folder');
    allCharacters = await index.getAll(folderId);
  } else {
    allCharacters = await store.getAll();
  }
  
  // Filter out soft-deleted characters
  allCharacters = allCharacters.filter(c => !c.deletedAt);
  
  // Apply sorting
  allCharacters.sort((a, b) => {
    switch (sortBy) {
      case 'newest_import':
        return b.createdAt - a.createdAt;
      case 'oldest_import':
        return a.createdAt - b.createdAt;
      case 'recently_modified':
        return (b.updatedAt || b.createdAt) - (a.updatedAt || a.createdAt);
      case 'a_z':
        return a.name.localeCompare(b.name, 'zh-CN');
      case 'z_a':
        return b.name.localeCompare(a.name, 'zh-CN');
      default:
        return b.createdAt - a.createdAt;
    }
  });

  if (searchQuery) {
    const query = searchQuery.toLowerCase();
    allCharacters = allCharacters.filter(c => {
      const charTags = c.data?.data?.tags || c.data?.tags;
      return c.name.toLowerCase().includes(query) || 
        (charTags && charTags.some((t: string) => t.toLowerCase().includes(query)));
    });
  }

  if (tags.length > 0) {
    allCharacters = allCharacters.filter(c => {
      const charTags = c.data?.data?.tags || c.data?.tags;
      return charTags && tags.every(t => charTags.includes(t));
    });
  }

  if (folderId === null) {
    // Only filter to root characters if we are NOT searching or filtering by tags
    if (!searchQuery && tags.length === 0) {
      allCharacters = allCharacters.filter(c => !c.folderId);
    }
  } else if (folderId && folderId !== 'all') {
    allCharacters = allCharacters.filter(c => c.folderId === folderId);
  }
  
  const total = allCharacters.length;
  const characters = allCharacters.slice((page - 1) * pageSize, page * pageSize);
  
  // Load blobs only for the paginated characters
  if (includeBlobs) {
    for (const char of characters) {
      if (char.hasBlobsSeparated) {
        const blobs = await db.get('blobs', char.id);
        if (blobs) {
          char.avatarBlob = blobs.avatarBlob;
          char.originalFile = blobs.originalFile;
          char.avatarHistory = blobs.avatarHistory;
        }
      }
    }
  }
  
  return { characters, total };
}

export async function getAllTags(): Promise<string[]> {
  const db = await initDB();
  const characters = await db.getAll('characters');
  const tags = new Set<string>();
  characters.forEach(c => {
    if (c.deletedAt) return;
    const charTags = c.data?.data?.tags || c.data?.tags;
    if (charTags && Array.isArray(charTags)) {
      charTags.forEach((t: string) => tags.add(t));
    }
  });
  return Array.from(tags).sort();
}

export async function renameTag(oldTag: string, newTag: string): Promise<void> {
  const db = await initDB();
  const tx = db.transaction('characters', 'readwrite');
  const store = tx.store;
  const characters = await store.getAll();
  
  for (const char of characters) {
    const charTags = char.data?.data?.tags || char.data?.tags;
    if (charTags && Array.isArray(charTags) && charTags.includes(oldTag)) {
      const newTags = charTags.map((t: string) => t === oldTag ? newTag : t);
      if (char.data?.data) {
        char.data.data.tags = Array.from(new Set(newTags));
      } else {
        char.data.tags = Array.from(new Set(newTags));
      }
      await store.put(char);
    }
  }
  await tx.done;
}

export async function deleteTag(tagToDelete: string): Promise<void> {
  const db = await initDB();
  const tx = db.transaction('characters', 'readwrite');
  const store = tx.store;
  const characters = await store.getAll();
  
  for (const char of characters) {
    const charTags = char.data?.data?.tags || char.data?.tags;
    if (charTags && Array.isArray(charTags) && charTags.includes(tagToDelete)) {
      const newTags = charTags.filter((t: string) => t !== tagToDelete);
      if (char.data?.data) {
        char.data.data.tags = newTags;
      } else {
        char.data.tags = newTags;
      }
      await store.put(char);
    }
  }
  await tx.done;
}

export async function getCharacter(id: string): Promise<CharacterCard | undefined> {
  const db = await initDB();
  const char = await db.get('characters', id);
  if (char && char.hasBlobsSeparated) {
    const blobs = await db.get('blobs', id);
    if (blobs) {
      char.avatarBlob = blobs.avatarBlob;
      char.originalFile = blobs.originalFile;
      char.avatarHistory = blobs.avatarHistory;
    }
  }
  return char;
}

export async function saveCharacter(character: CharacterCard): Promise<void> {
  return saveCharacters([character]);
}

export async function saveCharacters(characters: CharacterCard[]): Promise<void> {
  if (characters.length === 0) return;
  const db = await initDB();
  const tx = db.transaction(['characters', 'blobs'], 'readwrite');
  const charStore = tx.objectStore('characters');
  const blobStore = tx.objectStore('blobs');
  
  for (const character of characters) {
    const existing = await charStore.get(character.id);
    if (existing) {
      character.updatedAt = Date.now();
    }
    
    let finalBlobs = {
      avatarBlob: character.avatarBlob,
      originalFile: character.originalFile,
      avatarHistory: character.avatarHistory
    };

    if (existing?.hasBlobsSeparated) {
      const existingBlobs = await blobStore.get(character.id);
      if (existingBlobs) {
        finalBlobs.avatarBlob = character.avatarBlob !== undefined ? character.avatarBlob : existingBlobs.avatarBlob;
        finalBlobs.originalFile = character.originalFile !== undefined ? character.originalFile : existingBlobs.originalFile;
        finalBlobs.avatarHistory = character.avatarHistory !== undefined ? character.avatarHistory : existingBlobs.avatarHistory;
      }
    }
    
    await blobStore.put(finalBlobs, character.id);
    
    const charToSave = { ...character, hasBlobsSeparated: true };
    delete charToSave.avatarBlob;
    delete charToSave.originalFile;
    delete charToSave.avatarHistory;
    
    await charStore.put(charToSave);
  }
  
  await tx.done;
}

export async function deleteCharacter(id: string): Promise<void> {
  const db = await initDB();
  const char = await db.get('characters', id);
  if (char) {
    if (char.deletedAt) {
      // Hard delete if already in trash
      const tx = db.transaction(['characters', 'blobs'], 'readwrite');
      await tx.objectStore('characters').delete(id);
      await tx.objectStore('blobs').delete(id);
      await tx.done;
    } else {
      // Soft delete
      char.deletedAt = Date.now();
      await db.put('characters', char);
    }
  }
}

export async function restoreCharacter(id: string): Promise<void> {
  const db = await initDB();
  const char = await db.get('characters', id);
  if (char && char.deletedAt) {
    delete char.deletedAt;
    await db.put('characters', char);
  }
}

export async function getTrashedCharacters(includeBlobs: boolean = false): Promise<CharacterCard[]> {
  const db = await initDB();
  const allCharacters = await db.getAll('characters');
  const trashed = allCharacters.filter(c => c.deletedAt).sort((a, b) => (b.deletedAt || 0) - (a.deletedAt || 0));
  
  if (includeBlobs) {
    for (const char of trashed) {
      if (char.hasBlobsSeparated) {
        const blobs = await db.get('blobs', char.id);
        if (blobs) {
          char.avatarBlob = blobs.avatarBlob;
          char.originalFile = blobs.originalFile;
          char.avatarHistory = blobs.avatarHistory;
        }
      }
    }
  }
  return trashed;
}

export async function emptyTrash(): Promise<void> {
  const db = await initDB();
  const tx = db.transaction(['characters', 'blobs'], 'readwrite');
  const store = tx.objectStore('characters');
  const blobStore = tx.objectStore('blobs');
  const allCharacters = await store.getAll();
  
  for (const char of allCharacters) {
    if (char.deletedAt) {
      await store.delete(char.id);
      await blobStore.delete(char.id);
    }
  }
  await tx.done;
}

export async function cleanupOldTrash(): Promise<void> {
  const db = await initDB();
  const tx = db.transaction(['characters', 'blobs'], 'readwrite');
  const store = tx.objectStore('characters');
  const blobStore = tx.objectStore('blobs');
  const allCharacters = await store.getAll();
  
  const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
  const now = Date.now();
  
  for (const char of allCharacters) {
    if (char.deletedAt && (now - char.deletedAt > SEVEN_DAYS_MS)) {
      await store.delete(char.id);
      await blobStore.delete(char.id);
    }
  }
  await tx.done;
}

export interface DuplicateCharacter {
  char: CharacterCard;
  reason: string;
}

export interface DuplicateGroup {
  id: string;
  characters: DuplicateCharacter[];
}

export async function findDuplicates(): Promise<DuplicateGroup[]> {
  const db = await initDB();
  const allCharacters = await db.getAll('characters');
  const activeCharacters = allCharacters.filter(c => !c.deletedAt);
  
  // Precompute cleaned strings for faster O(N^2) matching
  const precomputed = activeCharacters.map(char => {
    const data = char.data?.data || char.data || {};
    const firstMes = data.first_mes || '';
    const desc = data.description || '';
    const name = (char.name || data.name || '').trim().toLowerCase();
    
    return {
      char,
      id: char.id,
      name,
      firstMes,
      desc,
      descClean: desc.replace(/\s+/g, ''),
      firstClean: firstMes.replace(/\s+/g, '')
    };
  });
  
  const groups: CharacterCard[][] = [];
  const processedIds = new Set<string>();
  
  for (let i = 0; i < precomputed.length; i++) {
    const itemA = precomputed[i];
    if (processedIds.has(itemA.id)) continue;
    
    const duplicates: CharacterCard[] = [itemA.char];
    
    for (let j = i + 1; j < precomputed.length; j++) {
      const itemB = precomputed[j];
      if (processedIds.has(itemB.id)) continue;
      
      let isDup = false;
      
      if (itemA.name && itemB.name && itemA.name === itemB.name) {
        // Same name: Check if major fields are identical (ignoring whitespace)
        if (itemA.descClean && itemB.descClean && itemA.descClean === itemB.descClean) {
          isDup = true;
        } else if (itemA.firstClean && itemB.firstClean && itemA.firstClean === itemB.firstClean) {
          isDup = true;
        } else if (!itemA.descClean && !itemB.descClean && !itemA.firstClean && !itemB.firstClean) {
          // Empty cards with same name
          isDup = true;
        }
      } else {
        // Different name: Only duplicate if BOTH description and first message are substantial and completely match
        if (itemA.descClean && itemB.descClean && itemA.firstClean && itemB.firstClean && 
            itemA.descClean === itemB.descClean && itemA.firstClean === itemB.firstClean && 
            itemA.descClean.length > 50) {
          isDup = true;
        }
      }
      
      if (isDup) {
        duplicates.push(itemB.char);
        processedIds.add(itemB.id);
      }
    }
    
    if (duplicates.length > 1) {
      processedIds.add(itemA.id);
      groups.push(duplicates);
    }
  }
  
  const finalGroups: DuplicateGroup[] = [];
  
  for (const groupChars of groups) {
    // Load blobs
    for (const char of groupChars) {
      if (char.hasBlobsSeparated) {
        const blobs = await db.get('blobs', char.id);
        if (blobs) {
          char.avatarBlob = blobs.avatarBlob;
          char.originalFile = blobs.originalFile;
          char.avatarHistory = blobs.avatarHistory;
        }
      }
    }
    
    // Sort by createdAt ascending
    const sorted = [...groupChars].sort((a, b) => a.createdAt - b.createdAt);
    const analyzedChars: DuplicateCharacter[] = [];
    
    for (let i = 0; i < sorted.length; i++) {
      const current = sorted[i];
      const cData = current.data?.data || current.data || {};
      
      if (i === 0) {
        analyzedChars.push({ char: current, reason: '最早导入的版本' });
        continue;
      }
      
      const oldest = sorted[0];
      const oData = oldest.data?.data || oldest.data || {};
      
      const cDesc = cData.description || '';
      const oDesc = oData.description || '';
      const cFirst = cData.first_mes || '';
      const oFirst = oData.first_mes || '';
      const cMesExample = cData.mes_example || '';
      const oMesExample = oData.mes_example || '';
      
      const cBook = cData.character_book?.entries?.length || cData.extensions?.character_book?.entries?.length || 0;
      const oBook = oData.character_book?.entries?.length || oData.extensions?.character_book?.entries?.length || 0;
      
      const cAlt = cData.alternate_greetings?.length || cData.extensions?.alternate_greetings?.length || 0;
      const oAlt = oData.alternate_greetings?.length || oData.extensions?.alternate_greetings?.length || 0;
      
      const reasons: string[] = [];
      
      if (cDesc === oDesc && cFirst === oFirst && cBook === oBook && cAlt === oAlt && cMesExample === oMesExample) {
        let isIdenticalToPrev = false;
        for (let j = 0; j < i; j++) {
          const pData = sorted[j].data?.data || sorted[j].data || {};
          if (cDesc === (pData.description || '') && cFirst === (pData.first_mes || '')) {
            isIdenticalToPrev = true;
            break;
          }
        }
        if (isIdenticalToPrev) {
          reasons.push('内容重复');
        } else {
          reasons.push('基本相同');
        }
      } else {
        if (cFirst !== oFirst) {
          if (cFirst.length > oFirst.length + 20) reasons.push('开场白长');
          else if (cFirst.length < oFirst.length - 20) reasons.push('开场白短');
          else reasons.push('改开场白');
        }
        if (cDesc !== oDesc) {
          if (cDesc.length > oDesc.length + 50) reasons.push('设定较长');
          else if (cDesc.length < oDesc.length - 50) reasons.push('设定较短');
          else reasons.push('改设定');
        }
        if (cBook > oBook) reasons.push(`世界书+${cBook - oBook}`);
        else if (cBook < oBook && cBook > 0) reasons.push(`世界书-${oBook - cBook}`);
        
        if (cAlt > oAlt) reasons.push(`备用开场+${cAlt - oAlt}`);
        
        if (cMesExample !== oMesExample) {
           if (cMesExample.length > oMesExample.length + 50) reasons.push('示例较长');
        }
      }
      
      if (reasons.length === 0) {
        reasons.push('微调细节');
      }
      
      analyzedChars.push({ char: current, reason: reasons.join('，') });
    }
    
    finalGroups.push({
      id: crypto.randomUUID(),
      characters: analyzedChars
    });
  }
  
  return finalGroups;
}

export async function getChatsForCharacter(characterId: string): Promise<ChatLog[]> {
  const db = await initDB();
  return db.getAllFromIndex('chats', 'by-character', characterId);
}

export async function getAllChats(): Promise<ChatLog[]> {
  const db = await initDB();
  return db.getAll('chats');
}

export async function saveChat(chat: ChatLog): Promise<void> {
  const db = await initDB();
  await db.put('chats', chat);
}

export async function deleteChat(id: string): Promise<void> {
  const db = await initDB();
  await db.delete('chats', id);
}
