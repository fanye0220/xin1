const fs = require('fs');

let content = fs.readFileSync('src/lib/db.ts', 'utf8');

const oldBulkDelete = `export async function deleteCharactersBulk(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const db = await initDB();
  
  const toHardDelete: CharacterCard[] = [];
  const toSoftDelete: CharacterCard[] = [];
  
  for (const id of ids) {
    const char = await db.get('characters', id);
    if (!char) continue;
    if (char.deletedAt) {
       toHardDelete.push(char);
    } else {
       char.deletedAt = Date.now();
       toSoftDelete.push(char);
    }
  }`;

const newBulkDelete = `export async function deleteCharactersBulk(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const db = await initDB();
  
  const toHardDelete: CharacterCard[] = [];
  const toSoftDelete: CharacterCard[] = [];
  
  // Use a single read transaction to fetch all characters quickly
  const readTx = db.transaction('characters', 'readonly');
  const fetchPromises = ids.map(id => readTx.store.get(id));
  const chars = await Promise.all(fetchPromises);
  
  for (let i = 0; i < chars.length; i++) {
    const char = chars[i];
    if (!char) continue;
    if (char.deletedAt) {
       toHardDelete.push(char);
    } else {
       char.deletedAt = Date.now();
       toSoftDelete.push(char);
    }
  }`;

content = content.replace(oldBulkDelete, newBulkDelete);
fs.writeFileSync('src/lib/db.ts', content);
console.log('Optimized bulk fetch!');
