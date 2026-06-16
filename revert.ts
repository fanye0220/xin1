import fs from 'fs';
const content = fs.readFileSync('src/components/ChatCleanerModal.tsx', 'utf8');
const newContent = content.replace(/\[\.light-theme_\&\]:[a-zA-Z0-9_\-\/\#\[\]\.]*\s?/g, '');
fs.writeFileSync('src/components/ChatCleanerModal.tsx', newContent);
console.log('Done');
