const fs = require('fs');
let content = fs.readFileSync('src/components/CharacterMemosSection.tsx', 'utf8');

if (!content.includes("import { createPortal } from 'react-dom';")) {
    content = content.replace(
        "import React, { useState, useEffect, useRef } from 'react';",
        "import React, { useState, useEffect, useRef } from 'react';\nimport { createPortal } from 'react-dom';"
    );
}

// 1. isAddingMode AnimatePresence
content = content.replace(
    /      <AnimatePresence>(\s+)\{isAddingMode && \(/,
    "      {typeof document !== 'undefined' && createPortal(\n      <AnimatePresence>$1{isAddingMode && ("
);
// It ends with:
//       </AnimatePresence>
//       {memos.length === 0 ? (
content = content.replace(
    /      <\/AnimatePresence>(\s+)\{memos\.length === 0 \? \(/,
    "      </AnimatePresence>,\n      document.body\n      )}$1{memos.length === 0 ? ("
);

// 2. readingMemo AnimatePresence
content = content.replace(
    /      <AnimatePresence>(\s+)\{readingMemo && \(/,
    "      {typeof document !== 'undefined' && createPortal(\n      <AnimatePresence>$1{readingMemo && ("
);
// It ends with:
//       </AnimatePresence>
//     </div>
content = content.replace(
    /      <\/AnimatePresence>(\s+)<\/div>(\s+)\);/,
    "      </AnimatePresence>,\n      document.body\n      )}$1</div>$2);"
);

// 3. MemoImage isExpanded AnimatePresence
content = content.replace(
    /            <AnimatePresence>(\s+)\{isExpanded && \(/,
    "            {typeof document !== 'undefined' && createPortal(\n            <AnimatePresence>$1{isExpanded && ("
);
// It ends with:
//             </AnimatePresence>
//         </>
content = content.replace(
    /            <\/AnimatePresence>(\s+)<\/>/,
    "            </AnimatePresence>,\n            document.body\n            )}$1</>"
);

fs.writeFileSync('src/components/CharacterMemosSection.tsx', content);
console.log('Fixed modals with createPortal');
