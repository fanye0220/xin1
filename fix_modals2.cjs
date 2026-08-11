const fs = require('fs');
let content = fs.readFileSync('src/components/CharacterMemosSection.tsx', 'utf8');

content = content.replace(
    "      </AnimatePresence>\n      {memos.length === 0 && !isAddingMode ? (",
    "      </AnimatePresence>,\n      document.body\n      )}\n      {memos.length === 0 && !isAddingMode ? ("
);

fs.writeFileSync('src/components/CharacterMemosSection.tsx', content);
console.log('Fixed syntax error');
