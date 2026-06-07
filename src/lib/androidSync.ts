// Web stub - these functions are no-ops on the web platform
// On Android (Capacitor), the real androidSync.ts handles native file sync

import type { CharacterCard } from './db';

export interface ChatLog {
  id: string;
  [key: string]: any;
}

export async function resolveFolderPath(folderId?: string | null): Promise<string> {
  return '未分类';
}

export async function tryCleanupOldAndroidFiles(_char: CharacterCard): Promise<void> {
  // no-op on web
}

export async function syncCharacterToAndroid(_char: CharacterCard, _blobs: any): Promise<string[]> {
  return [];
}

export async function syncChatToAndroid(_chat: any): Promise<void> {
  // no-op on web
}

export async function deleteCharacterFromAndroid(_char: CharacterCard): Promise<void> {
  // no-op on web
}

export async function deleteChatFromAndroid(_chat: any): Promise<void> {
  // no-op on web
}
