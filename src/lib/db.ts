import { openDB, DBSchema, IDBPDatabase } from 'idb';

export interface Folder {
  id: string;
  name: string;
  createdAt: number;
  parentId?: string | null;
  sortOrder?: number;
  avatarBlob?: Blob;
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
  sortOrder?: number;
}

export interface ChatLog {
  id: string;
  characterId: string;
  name: string;
  messages: any[];
  createdAt: number;
  note?: string;
}

export interface ChatMetadata {
  id: string;
  characterId: string;
  name: string;
  createdAt: number;
  note?: string;
  messageCount: number;
  firstAiName?: string;
  lastMessagePreview?: string;
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
  chat_metadata: {
    key: string;
    value: ChatMetadata;
    indexes: { 'by-character': string; 'by-date': number };
  };
  memos: {
    key: string;
    value: CharacterMemo;
    indexes: { 'by-character': string; 'by-date': number };
  };
}

export interface CharacterMemo {
  id: string;
  characterId: string;
  type: 'text' | 'image' | 'file';
  content: string; // Markdown or File name
  blob?: Blob;     // For images/files
  createdAt: number;
  isPinned?: boolean;
  order?: number;
}

let dbPromise: Promise<IDBPDatabase<TavernDB>>;

export function initDB() {
  if (!dbPromise) {
    dbPromise = openDB<TavernDB>('tavern-manager-v2', 6, {
      async upgrade(db, oldVersion, newVersion, transaction) {
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
        if (oldVersion < 5) {
          const memoStore = db.createObjectStore('memos', { keyPath: 'id' });
          memoStore.createIndex('by-character', 'characterId');
          memoStore.createIndex('by-date', 'createdAt');
        }
        if (oldVersion < 6) {
          const metaStore = db.createObjectStore('chat_metadata', { keyPath: 'id' });
          metaStore.createIndex('by-character', 'characterId');
          metaStore.createIndex('by-date', 'createdAt');
          
          // Prepopulate chat_metadata from existing chats
          const chatStore = transaction.objectStore('chats');
          let cursor = await chatStore.openCursor();
          while (cursor) {
            const val = cursor.value;
            const aiMsg = val.messages?.find((m: any) => !m.is_user && m.name);
            const lastMsg = val.messages?.length ? val.messages[val.messages.length - 1] : null;
            let preview = lastMsg?.mes || '';
            if (preview.length > 200) preview = preview.substring(0, 200) + '...';
            
            metaStore.put({
              id: val.id,
              characterId: val.characterId,
              name: val.name,
              createdAt: val.createdAt,
              note: val.note,
              messageCount: val.messages?.length || 0,
              firstAiName: aiMsg?.name,
              lastMessagePreview: preview,
            });
            cursor = await cursor.continue();
          }
        }
      },
    });
  }
  return dbPromise;
}

export async function migrateDatabase(onProgress?: (current: number, total: number) => void) {
  const db = await initDB();
  
  // First, just count how many need migration without loading full objects into RAM, or we just rely on counting via cursor
  let totalToMigrate = 0;
  let txCheck = db.transaction('characters', 'readonly');
  let cursorCheck = await txCheck.objectStore('characters').openCursor();
  const unmigratedIds: string[] = [];
  
  while (cursorCheck) {
    if (!cursorCheck.value.hasBlobsSeparated) {
      unmigratedIds.push(cursorCheck.key as string);
    }
    cursorCheck = await cursorCheck.continue();
  }
  
  totalToMigrate = unmigratedIds.length;
  if (totalToMigrate === 0) return;

  const CHUNK_SIZE = 10;
  for (let i = 0; i < totalToMigrate; i += CHUNK_SIZE) {
    const chunkIds = unmigratedIds.slice(i, i + CHUNK_SIZE);
    const writeTx = db.transaction(['characters', 'blobs'], 'readwrite');
    const charStore = writeTx.objectStore('characters');
    const blobStore = writeTx.objectStore('blobs');
    
    for (const id of chunkIds) {
      const char = await charStore.get(id);
      if (!char) continue;
      
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
      onProgress(Math.min(i + CHUNK_SIZE, totalToMigrate), totalToMigrate);
    }
  }
}

export async function getFolders(): Promise<Folder[]> {
  const db = await initDB();
  const folders = await db.getAllFromIndex('folders', 'by-date');
  return folders.sort((a, b) => {
    if (a.sortOrder !== undefined && b.sortOrder !== undefined) {
      return a.sortOrder - b.sortOrder;
    }
    if (a.sortOrder !== undefined) return -1;
    if (b.sortOrder !== undefined) return 1;
    return b.createdAt - a.createdAt;
  });
}

export async function getOrCreateNestedFolder(pathParts: string[]): Promise<string | undefined> {
  if (pathParts.length === 0) return undefined;
  let currentParentId: string | undefined = undefined;
  
  const folders = await getFolders();
  
  for (const part of pathParts) {
    const existing = folders.find(f => f.name === part && f.parentId === currentParentId);
    if (existing) {
      currentParentId = existing.id;
    } else {
      const newFolder: Folder = {
        id: crypto.randomUUID(),
        name: part,
        createdAt: Date.now(),
        parentId: currentParentId
      };
      await saveFolder(newFolder);
      folders.push(newFolder);
      currentParentId = newFolder.id;
    }
  }
  return currentParentId;
}

export async function getFolderPreviews(folderIds: string[]): Promise<Record<string, string[]>> {
  if (folderIds.length === 0) return {};
  const db = await initDB();
  const tx = db.transaction('characters', 'readonly');
  const index = tx.store.index('by-folder');
  
  const previews: Record<string, string[]> = {};
  
  await Promise.all(folderIds.map(async folderId => {
    let chars = await index.getAll(folderId);
    chars = chars.filter(c => !c.deletedAt);
    chars.sort((a, b) => b.createdAt - a.createdAt);
    const topChars = chars.slice(0, 4);
    
    // load blobs manually for these 4 characters if they are separated
    const topBlobs = await Promise.all(topChars.map(async char => {
      if (char.hasBlobsSeparated) {
         const blobs = await db.get('blobs', char.id);
         if (blobs?.avatarBlob) return URL.createObjectURL(blobs.avatarBlob);
      }
      return char.avatarBlob ? URL.createObjectURL(char.avatarBlob) : char.avatarUrlFallback || '';
    }));
    
    previews[folderId] = topBlobs.filter(Boolean) as string[];
  }));
  
  return previews;
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

export type SortOption = 'newest_import' | 'oldest_import' | 'recently_modified' | 'a_z' | 'z_a' | 'custom';

export interface CharMeta {
  id: string;
  createdAt: number;
  updatedAt?: number;
  name: string;
  sortOrder?: number;
  deletedAt?: number;
  folderId?: string;
  tags: string[];
}

let cachedMeta: CharMeta[] | null = null;
let isBuildingCache = false;

export async function getCachedMeta(): Promise<CharMeta[]> {
  if (cachedMeta) return cachedMeta;
  
  if (isBuildingCache) {
    while (isBuildingCache) await new Promise(r => setTimeout(r, 50));
    if (cachedMeta) return cachedMeta;
  }
  isBuildingCache = true;
  
  const db = await initDB();
  const tx = db.transaction('characters', 'readonly');
  const store = tx.store;
  let cursor = await store.openCursor();
  
  const newMeta: CharMeta[] = [];
  while (cursor) {
    const val = cursor.value;
    let charTags = val.data?.data?.tags || val.data?.tags;
    if (!Array.isArray(charTags)) charTags = [];
    newMeta.push({
      id: val.id,
      createdAt: val.createdAt,
      updatedAt: val.updatedAt,
      name: val.name || '',
      sortOrder: val.sortOrder,
      deletedAt: val.deletedAt,
      folderId: val.folderId,
      tags: charTags
    });
    cursor = await cursor.continue();
  }
  
  cachedMeta = newMeta;
  isBuildingCache = false;
  return cachedMeta;
}

export function invalidateCache() {
  cachedMeta = null;
  tagsCache = null;
}

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
  
  let allMeta = await getCachedMeta();
  allMeta = allMeta.filter(c => !c.deletedAt);

  if (searchQuery) {
    const query = searchQuery.toLowerCase();
    allMeta = allMeta.filter(c => c.name.toLowerCase().includes(query) || c.tags.some(t => t.toLowerCase().includes(query)));
  }

  if (tags.length > 0) {
    allMeta = allMeta.filter(c => tags.every(t => c.tags.includes(t)));
  }

  if (folderId === null) {
    if (!searchQuery && tags.length === 0) {
      allMeta = allMeta.filter(c => !c.folderId);
    }
  } else if (folderId && folderId !== 'all') {
    allMeta = allMeta.filter(c => c.folderId === folderId);
  }

  // Apply sorting
  allMeta.sort((a, b) => {
    switch (sortBy) {
      case 'custom':
        if (a.sortOrder !== undefined && b.sortOrder !== undefined) {
          return a.sortOrder - b.sortOrder;
        }
        if (a.sortOrder !== undefined) return -1;
        if (b.sortOrder !== undefined) return 1;
        return b.createdAt - a.createdAt;
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

  const total = allMeta.length;
  const paginatedMeta = allMeta.slice((page - 1) * pageSize, page * pageSize);
  
  // Now fetch full objects ONLY for the paginated slice
  const fetchTx = db.transaction('characters', 'readonly');
  const fetchStore = fetchTx.store;
  const characters: CharacterCard[] = [];
  
  for (const meta of paginatedMeta) {
    const fullChar = await fetchStore.get(meta.id);
    if (fullChar) {
      characters.push(fullChar);
    }
  }
  
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

let tagsCache: string[] | null = null;

export async function getAllTags(): Promise<string[]> {
  if (tagsCache) return tagsCache;
  const meta = await getCachedMeta();
  
  const tags = new Set<string>();
  
  meta.forEach(c => {
    if (!c.deletedAt) {
      c.tags.forEach(t => tags.add(t));
    }
  });
  
  tagsCache = Array.from(tags).sort();
  return tagsCache;
}

export async function renameTag(oldTag: string, newTag: string): Promise<void> {
  invalidateCache();
  const db = await initDB();
  const tx = db.transaction('characters', 'readwrite');
  const store = tx.store;
  let cursor = await store.openCursor();
  
  while (cursor) {
    const char = cursor.value;
    const charTags = char.data?.data?.tags || char.data?.tags;
    if (charTags && Array.isArray(charTags) && charTags.includes(oldTag)) {
      const newTags = charTags.map((t: string) => t === oldTag ? newTag : t);
      if (char.data?.data) {
        char.data.data.tags = Array.from(new Set(newTags));
      } else {
        char.data.tags = Array.from(new Set(newTags));
      }
      char.updatedAt = Date.now();
      await cursor.update(char);
    }
    cursor = await cursor.continue();
  }
  await tx.done;
}

export async function deleteTag(tagToDelete: string): Promise<void> {
  invalidateCache();
  const db = await initDB();
  const tx = db.transaction('characters', 'readwrite');
  const store = tx.store;
  let cursor = await store.openCursor();
  
  while (cursor) {
    const char = cursor.value;
    const charTags = char.data?.data?.tags || char.data?.tags;
    if (charTags && Array.isArray(charTags) && charTags.includes(tagToDelete)) {
      const newTags = charTags.filter((t: string) => t !== tagToDelete);
      if (char.data?.data) {
        char.data.data.tags = newTags;
      } else {
        char.data.tags = newTags;
      }
      char.updatedAt = Date.now();
      await cursor.update(char);
    }
    cursor = await cursor.continue();
  }
  await tx.done;
}

export async function getCharacterBlob(id: string) {
  const db = await initDB();
  return await db.get('blobs', id);
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
  invalidateCache();
  return saveCharacters([character]);
}

export async function saveCharacters(characters: CharacterCard[]): Promise<void> {
  invalidateCache();
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
  invalidateCache();
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
  invalidateCache();
  const db = await initDB();
  const char = await db.get('characters', id);
  if (char && char.deletedAt) {
    delete char.deletedAt;
    await db.put('characters', char);
  }
}

export async function getTrashedCharacters(includeBlobs: boolean = false): Promise<CharacterCard[]> {
  const db = await initDB();
  const trashed: CharacterCard[] = [];
  const tx = db.transaction('characters', 'readonly');
  const store = tx.store;
  let cursor = await store.openCursor();
  
  while (cursor) {
    const char = cursor.value;
    if (char.deletedAt) {
      trashed.push(char);
    }
    cursor = await cursor.continue();
  }
  
  trashed.sort((a, b) => (b.deletedAt || 0) - (a.deletedAt || 0));
  
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
  invalidateCache();
  const db = await initDB();
  const tx = db.transaction(['characters', 'blobs'], 'readwrite');
  const store = tx.objectStore('characters');
  const blobStore = tx.objectStore('blobs');
  let cursor = await store.openCursor();
  
  while (cursor) {
    const char = cursor.value;
    if (char.deletedAt) {
      await cursor.delete();
      await blobStore.delete(char.id);
    }
    cursor = await cursor.continue();
  }
  await tx.done;
}

export async function cleanupOldTrash(): Promise<void> {
  invalidateCache();
  const db = await initDB();
  const tx = db.transaction(['characters', 'blobs'], 'readwrite');
  const store = tx.objectStore('characters');
  const blobStore = tx.objectStore('blobs');
  let cursor = await store.openCursor();
  
  const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
  const now = Date.now();
  
  while (cursor) {
    const char = cursor.value;
    if (char.deletedAt && (now - char.deletedAt > SEVEN_DAYS_MS)) {
      await cursor.delete();
      await blobStore.delete(char.id);
    }
    cursor = await cursor.continue();
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
  const precomputed: any[] = [];
  
  const tx = db.transaction('characters', 'readonly');
  const store = tx.store;
  let cursor = await store.openCursor();
  
  while (cursor) {
    const char = cursor.value;
    if (!char.deletedAt) {
      const data = char.data?.data || char.data || {};
      const firstMes = data.first_mes || '';
      const desc = data.description || '';
      const name = (char.name || data.name || '').trim().toLowerCase();
      
      precomputed.push({
        id: char.id,
        name,
        firstMes,
        desc,
        descClean: desc.replace(/\s+/g, ''),
        firstClean: firstMes.replace(/\s+/g, '')
      });
    }
    cursor = await cursor.continue();
  }
  
  const groups: string[][] = [];
  const processedIds = new Set<string>();
  
  for (let i = 0; i < precomputed.length; i++) {
    const itemA = precomputed[i];
    if (processedIds.has(itemA.id)) continue;
    
    const duplicates: string[] = [itemA.id];
    
    for (let j = i + 1; j < precomputed.length; j++) {
      const itemB = precomputed[j];
      if (processedIds.has(itemB.id)) continue;
      
      let isDup = false;
      
      if (itemA.name && itemB.name && itemA.name === itemB.name) {
        if (itemA.descClean && itemB.descClean && itemA.descClean === itemB.descClean) {
          isDup = true;
        } else if (itemA.firstClean && itemB.firstClean && itemA.firstClean === itemB.firstClean) {
          isDup = true;
        } else if (!itemA.descClean && !itemB.descClean && !itemA.firstClean && !itemB.firstClean) {
          isDup = true;
        }
      } else {
        if (itemA.descClean && itemB.descClean && itemA.firstClean && itemB.firstClean && 
            itemA.descClean === itemB.descClean && itemA.firstClean === itemB.firstClean && 
            itemA.descClean.length > 50) {
          isDup = true;
        }
      }
      
      if (isDup) {
        duplicates.push(itemB.id);
        processedIds.add(itemB.id);
      }
    }
    
    if (duplicates.length > 1) {
      processedIds.add(itemA.id);
      groups.push(duplicates);
    }
  }
  
  const finalGroups: DuplicateGroup[] = [];
  const fetchTx = db.transaction('characters', 'readonly');
  const fetchStore = fetchTx.store;
  
  for (const groupIds of groups) {
    const groupChars: CharacterCard[] = [];
    for (const id of groupIds) {
      const char = await fetchStore.get(id);
      if (char) groupChars.push(char);
    }
    
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

export async function getChatById(id: string): Promise<ChatLog | undefined> {
  const db = await initDB();
  return db.get('chats', id);
}

export async function getAllChatsMetadata(): Promise<ChatMetadata[]> {
  const db = await initDB();
  return db.getAll('chat_metadata');
}

function computeChatMetadata(chat: ChatLog): ChatMetadata {
  const aiMsg = chat.messages?.find((m: any) => !m.is_user && m.name);
  const lastMsg = chat.messages?.length ? chat.messages[chat.messages.length - 1] : null;
  let preview = lastMsg?.mes || '';
  if (preview.length > 200) preview = preview.substring(0, 200) + '...';
  
  return {
    id: chat.id,
    characterId: chat.characterId,
    name: chat.name,
    createdAt: chat.createdAt,
    note: chat.note,
    messageCount: chat.messages?.length || 0,
    firstAiName: aiMsg?.name,
    lastMessagePreview: preview,
  };
}

export async function saveChat(chat: ChatLog): Promise<void> {
  const db = await initDB();
  const tx = db.transaction(['chats', 'chat_metadata'], 'readwrite');
  await tx.objectStore('chats').put(chat);
  await tx.objectStore('chat_metadata').put(computeChatMetadata(chat));
  await tx.done;
}

export async function saveChatsBulk(chats: ChatLog[]): Promise<void> {
  const db = await initDB();
  const tx = db.transaction(['chats', 'chat_metadata'], 'readwrite');
  const chatStore = tx.objectStore('chats');
  const metaStore = tx.objectStore('chat_metadata');
  
  chats.forEach(chat => {
    chatStore.put(chat);
    metaStore.put(computeChatMetadata(chat));
  });
  await tx.done;
}

export async function deleteChat(id: string): Promise<void> {
  const db = await initDB();
  const tx = db.transaction(['chats', 'chat_metadata'], 'readwrite');
  await tx.objectStore('chats').delete(id);
  await tx.objectStore('chat_metadata').delete(id);
  await tx.done;
}

export async function getMemosForCharacter(characterId: string): Promise<CharacterMemo[]> {
  const db = await initDB();
  const memos = await db.getAllFromIndex('memos', 'by-character', characterId);
  return memos.sort((a, b) => {
    if (a.isPinned && !b.isPinned) return -1;
    if (!a.isPinned && b.isPinned) return 1;
    if (a.order !== undefined && b.order !== undefined) return a.order - b.order;
    return b.createdAt - a.createdAt;
  }); // Pinned first, then ordered, then newest first
}

export async function saveMemo(memo: CharacterMemo): Promise<void> {
  const db = await initDB();
  await db.put('memos', memo);
}

export async function deleteMemo(id: string): Promise<void> {
  const db = await initDB();
  await db.delete('memos', id);
}

