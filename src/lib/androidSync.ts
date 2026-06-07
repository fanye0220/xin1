// Web stub - no-ops on web platform
import type { CharacterCard } from './db';

export async function resolveFolderPath(_folderId?: string | null): Promise<string> {
  return '未归类';
}
export async function tryCleanupOldAndroidFiles(_char: CharacterCard): Promise<void> {}
export async function syncCharacterToAndroid(_char: CharacterCard, _blobs: any): Promise<string[]> { return []; }
export async function syncChatToAndroid(_chat: any): Promise<void> {}
export async function deleteCharacterFromAndroid(_char: CharacterCard): Promise<void> {}
export async function deleteChatFromAndroid(_chat: any): Promise<void> {}
