const fs = require('fs');
let content = fs.readFileSync('src/components/CharacterDetail.tsx', 'utf8');

const updateFieldFunc = `  const updateField = async (field: string, value: any) => {
    if (!character) return;
    
    // Check if changed
    let currentVal = character.data?.data ? character.data.data[field] : character.data[field];
    if (JSON.stringify(currentVal) === JSON.stringify(value)) {
      return;
    }

    const updatedChar = { ...character };
    let targetData = updatedChar.data.data ? updatedChar.data.data : updatedChar.data;
    targetData[field] = value;`;

content = content.replace(
  '  const updateField = async (field: string, value: any) => {\n    if (!character) return;\n    const updatedChar = { ...character };\n    let targetData = updatedChar.data.data ? updatedChar.data.data : updatedChar.data;\n    targetData[field] = value;',
  updateFieldFunc
);

fs.writeFileSync('src/components/CharacterDetail.tsx', content);
console.log('Fixed update field');
