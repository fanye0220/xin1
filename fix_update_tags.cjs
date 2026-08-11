const fs = require('fs');
let content = fs.readFileSync('src/components/CharacterDetail.tsx', 'utf8');

content = content.replace(
  '    if (JSON.stringify(character.tags) === JSON.stringify(newTags) && JSON.stringify((character.data.data || character.data).tags) === JSON.stringify(newTags)) {\n      return;\n    }',
  '    const currentTags = (character.data.data ? character.data.data.tags : character.data.tags) || [];\n    if (JSON.stringify(currentTags) === JSON.stringify(newTags)) {\n      return;\n    }'
);

fs.writeFileSync('src/components/CharacterDetail.tsx', content);
console.log('Fixed handleUpdateTags');
