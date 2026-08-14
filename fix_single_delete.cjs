const fs = require('fs');
let content = fs.readFileSync('src/lib/db.ts', 'utf8');

// Hard delete in deleteCharacter
const hardTarget = `      await tx.done;
      if (isAndroid()) {
        import('./androidSync').then(async ({ deleteCharacterFromAndroid }) => {`;

const hardReplacement = `      await tx.done;
      invalidateCache();
      if (isAndroid()) {
        import('./androidSync').then(async ({ deleteCharacterFromAndroid }) => {`;

content = content.replace(hardTarget, hardReplacement);

// Soft delete in deleteCharacter
const softTarget = `      // Soft delete
      char.deletedAt = Date.now();
      await db.put('characters', char);
      
      if (isAndroid()) {
        import('./androidSync').then(async ({ fastMoveCharacterOnAndroid, syncCharacterToAndroid }) => {`;

const softReplacement = `      // Soft delete
      char.deletedAt = Date.now();
      await db.put('characters', char);
      invalidateCache();
      
      if (isAndroid()) {
        import('./androidSync').then(async ({ fastMoveCharacterOnAndroid, syncCharacterToAndroid }) => {`;

content = content.replace(softTarget, softReplacement);

fs.writeFileSync('src/lib/db.ts', content);
