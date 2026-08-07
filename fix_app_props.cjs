const fs = require('fs');
let content = fs.readFileSync('src/App.tsx', 'utf8');

content = content.replace('refreshTrigger={refreshKey}\n            folderId={selectedFolderId}', 'folderId={selectedFolderId}');
fs.writeFileSync('src/App.tsx', content);
