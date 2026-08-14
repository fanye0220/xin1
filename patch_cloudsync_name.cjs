const fs = require('fs');
let code = fs.readFileSync('src/components/CloudSyncTab.tsx', 'utf8');

// Replace the existing check which was:
// const existing = existingChars.find(c => c.name?.trim() === jsonData.name?.trim());
code = code.replace(
    /const existing = existingChars\.find\(c => c\.name\?\.trim\(\) === jsonData\.name\?\.trim\(\)\);/g,
    `const extractedName = jsonData.name || jsonData.data?.name || charName;
        const existing = existingChars.find(c => c.name?.trim() === extractedName?.trim());`
);

// Replace charToSave.name initialization:
// name: jsonData.name || charName,
code = code.replace(
    /name: jsonData\.name \|\| charName,/g,
    'name: extractedName,'
);

fs.writeFileSync('src/components/CloudSyncTab.tsx', code);
console.log('Patched CloudSyncTab to correctly extract V2 names');
