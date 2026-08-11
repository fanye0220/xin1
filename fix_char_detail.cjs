const fs = require('fs');
let content = fs.readFileSync('src/components/CharacterDetail.tsx', 'utf8');

// Update getNormalizedExportData just in case, but actually wait, `updateField` handles updating fields.
// Let's modify updateField.
content = content.replace(
    /const updateField = \(field: string, value: string\) => \{[\s\S]*?setCharacter\(updatedChar\);\n    saveCharacter\(updatedChar\);\n  \};/,
    `const updateField = (field: string, value: string) => {
    if (!character) return;
    const newData = { ...character.data };
    newData[field] = value;
    if (newData.spec === 'chara_card_v3' && newData.data) {
      newData.data[field] = value;
    }
    const updatedChar = { ...character, data: newData };
    setCharacter(updatedChar);
    saveCharacter(updatedChar);
  };`
);

// Update Sections
const fields = ['description', 'personality', 'scenario', 'mes_example', 'creator_notes', 'system_prompt', 'post_history_instructions', 'first_mes'];
for (const field of fields) {
    content = content.replace(
        new RegExp(`content=\\{data\\.${field}\\}`, 'g'),
        `content={data.${field} || (data.data && data.data.${field})}`
    );
}

fs.writeFileSync('src/components/CharacterDetail.tsx', content);
console.log('Fixed CharacterDetail.tsx!');
