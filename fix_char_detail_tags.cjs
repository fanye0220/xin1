const fs = require('fs');
let content = fs.readFileSync('src/components/CharacterDetail.tsx', 'utf8');

content = content.replace(
    /setTempTags\(\(data\.tags \|\| \[\]\)\.join\(', '\)\);/g,
    "setTempTags(((data.tags || (data.data && data.data.tags)) || []).join(', '));"
);

content = content.replace(
    /\{data\.tags && data\.tags\.length > 0 \? \(/g,
    "{(data.tags || (data.data && data.data.tags)) && (data.tags || (data.data && data.data.tags)).length > 0 ? ("
);

content = content.replace(
    /data\.tags\.map\(\(tag: string, i: number\) => \(/g,
    "(data.tags || (data.data && data.data.tags)).map((tag: string, i: number) => ("
);

fs.writeFileSync('src/components/CharacterDetail.tsx', content);
console.log('Fixed tags in CharacterDetail.tsx!');
