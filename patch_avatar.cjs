const fs = require('fs');

let content = fs.readFileSync('src/lib/avatar.ts', 'utf-8');

// Remove all the specific category SVG overrides
content = content.replace(/  if \(cat\.includes\('快'\)[\s\S]*?(?=  try \{)/, "");

fs.writeFileSync('src/lib/avatar.ts', content);
