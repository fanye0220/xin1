const fs = require('fs');
let code = fs.readFileSync('src/lib/db.ts', 'utf8');

// Remove invalidateCache() from the top of saveCharacters
code = code.replace(
    /export async function saveCharacters\(characters: CharacterCard\[\], cleanupAndroidPaths\?: string\[\]\): Promise<void> \{\n  invalidateCache\(\);\n/g,
    'export async function saveCharacters(characters: CharacterCard[], cleanupAndroidPaths?: string[]): Promise<void> {\n'
);

// Add invalidateCache() after await tx2.done;
code = code.replace(
    /await tx2\.done;/g,
    'await tx2.done;\n  invalidateCache();'
);

// We also want to remove it from the top of other functions and add it after their transactions,
// but for now, just making sure `saveCharacter` and `saveCharacters` trigger it AFTER the promise completes is enough to fix the UI not updating.
// Wait, `saveCharacter` also has invalidateCache() at the top. Let's remove it.
code = code.replace(
    /export async function saveCharacter\(character: CharacterCard\): Promise<void> \{\n  invalidateCache\(\);\n  return saveCharacters\(\[character\]\);\n\}/g,
    'export async function saveCharacter(character: CharacterCard): Promise<void> {\n  return saveCharacters([character]);\n}'
);

fs.writeFileSync('src/lib/db.ts', code);
console.log('Patched db.ts to invalidate cache AFTER write');
