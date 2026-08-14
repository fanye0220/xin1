const fs = require('fs');

let content = fs.readFileSync('src/lib/db.ts', 'utf8');

const functionsToFix = [
  'deleteCharactersBulk',
  'deleteCharacter',
  'restoreCharacter',
  'emptyTrash',
  'cleanupOldTrash',
  'renameTag',
  'deleteTag'
];

for (const fn of functionsToFix) {
  // Remove invalidateCache() right after function declaration
  const regex = new RegExp(`(export async function ${fn}\\([^)]*\\): Promise<void> \\{\\n)\\s*invalidateCache\\(\\);\\n`, 'g');
  content = content.replace(regex, '$1');
}

fs.writeFileSync('src/lib/db.ts', content);
console.log('Removed top invalidateCache');
