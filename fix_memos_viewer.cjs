const fs = require('fs');
let content = fs.readFileSync('src/components/CharacterMemosSection.tsx', 'utf8');

content = content.replace(
    /\} else if \(readingMemo\.type === 'worldbook'\) \{/g,
    "} else if (readingMemo._wbContent || readingMemo.type === 'worldbook') {"
);

content = content.replace(
    /\) : readingMemo\.type === 'worldbook' \? \(/g,
    ") : (readingMemo as any)._wbContent || readingMemo.type === 'worldbook' ? ("
);

fs.writeFileSync('src/components/CharacterMemosSection.tsx', content);
console.log('Fixed worldbook viewer condition!');
