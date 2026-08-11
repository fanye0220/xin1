const fs = require('fs');
let content = fs.readFileSync('src/components/CharacterMemosSection.tsx', 'utf8');

// The closing AnimatePresence before memos.length
content = content.replace(
    /      <\/AnimatePresence>\s+\{memos\.length === 0 && !isAddingMode \? \(/,
    "      </AnimatePresence>,\n      document.body\n      )}\n      {memos.length === 0 && !isAddingMode ? ("
);

fs.writeFileSync('src/components/CharacterMemosSection.tsx', content);
console.log('Fixed syntax error');
