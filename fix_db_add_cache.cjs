const fs = require('fs');

let content = fs.readFileSync('src/lib/db.ts', 'utf8');

// Replace await tx.done; inside deleteCharactersBulk and other functions to include invalidateCache();
// We can just look for the specific lines.

// 1. deleteCharactersBulk Soft Delete
content = content.replace(
    /     await tx\.done;\n          \n     if \(isAndroid\(\)\) \{/g,
    '     await tx.done;\n     invalidateCache();\n     \n     if (isAndroid()) {'
);

// 2. deleteCharactersBulk Hard Delete
content = content.replace(
    /     await tx\.done;\n\n     if \(isAndroid\(\)\) \{\n       import\('\.\/androidSync'\)/g,
    '     await tx.done;\n     invalidateCache();\n\n     if (isAndroid()) {\n       import(\'./androidSync\')'
);

// 3. deleteCharacter
content = content.replace(
    /      await tx\.done;\n      if \(isAndroid\(\)\) \{\n        import\('\.\/androidSync'\)/g,
    '      await tx.done;\n      invalidateCache();\n      if (isAndroid()) {\n        import(\'./androidSync\')'
);

content = content.replace(
    /      await tx\.done;\n      \n      if \(isAndroid\(\)\) \{\n        import\('\.\/androidSync'\)/g,
    '      await tx.done;\n      invalidateCache();\n      \n      if (isAndroid()) {\n        import(\'./androidSync\')'
);

// 4. restoreCharacter
content = content.replace(
    /  await tx\.done;\n  if \(isAndroid\(\)\) \{\n    import\('\.\/androidSync'\)/g,
    '  await tx.done;\n  invalidateCache();\n  if (isAndroid()) {\n    import(\'./androidSync\')'
);

// 5. emptyTrash
content = content.replace(
    /  await tx2\.done;\n\n  \/\/ Sync to Android/g,
    '  await tx2.done;\n  invalidateCache();\n\n  // Sync to Android'
);

// 6. cleanupOldTrash
content = content.replace(
    /  await tx2\.done;\n\n  \/\/ Sync to Android/g,
    '  await tx2.done;\n  invalidateCache();\n\n  // Sync to Android'
);

// 7. renameTag
content = content.replace(
    /  await tx\.done;\n  invalidateCache\(\);\n\}/g,
    '  await tx.done;\n  invalidateCache();\n}'
);

// 8. deleteTag
content = content.replace(
    /  await tx\.done;\n\}/g,
    '  await tx.done;\n  invalidateCache();\n}'
);

fs.writeFileSync('src/lib/db.ts', content);
console.log('Added invalidateCache to functions');
