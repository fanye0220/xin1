const fs = require('fs');
let content = fs.readFileSync('src/components/CharacterMemosSection.tsx', 'utf8');

// Replace the icon import
content = content.replace(
  "import { Pin, Trash2, Edit, X, Plus, FileUp, FileText, Image as ImageIcon, Download, File, StickyNote, Maximize2 } from 'lucide-react';",
  "import { Pin, Trash2, Edit, X, Plus, FileUp, FileText, Image as ImageIcon, Download, File, StickyNote, Maximize2, Book } from 'lucide-react';"
);

content = content.replace(
  `onClick={() => setReadingMemo({ ...memo, content: (memo as any)._wbContent || memo.content })}`,
  `onClick={async () => {
    if (memo.blob) {
      const text = await memo.blob.text();
      setReadingMemo({ ...memo, _wbContent: text } as any);
    }
  }}`
);

content = content.replace(
  `book={JSON.parse(readingMemo.content || '{}')}`,
  `book={JSON.parse((readingMemo as any)._wbContent || '{}')}`
);

content = content.replace(
  `const newMemo = { ...readingMemo, content: JSON.stringify(newBook), blob: new Blob([JSON.stringify(newBook)], { type: 'application/json' }) };`,
  `const newMemo = { ...readingMemo, content: newBook.name || '世界书', blob: new Blob([JSON.stringify(newBook)], { type: 'application/json' }) };
   (newMemo as any)._wbContent = JSON.stringify(newBook);`
);

content = content.replace(
  `{JSON.parse(memo.content || '{}').name || '世界书'}`,
  `{memo.content || '世界书'}`
);

fs.writeFileSync('src/components/CharacterMemosSection.tsx', content);
console.log('Fixed worldbook load');
