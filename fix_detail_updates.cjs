const fs = require('fs');
let content = fs.readFileSync('src/components/CharacterDetail.tsx', 'utf8');

// handleNameSave
content = content.replace(
  'if (!editNameValue.trim() || !character) return;',
  'if (!editNameValue.trim() || !character) return;\n    if (editNameValue.trim() === character.name) {\n      setIsEditingName(false);\n      return;\n    }'
);

// handleUpdateTags
content = content.replace(
  'const newTags = tagsStr.split(\',\').map(t => t.trim()).filter(t => t);',
  'const newTags = tagsStr.split(\',\').map(t => t.trim()).filter(t => t);\n    if (JSON.stringify(character.tags) === JSON.stringify(newTags) && JSON.stringify((character.data.data || character.data).tags) === JSON.stringify(newTags)) {\n      return;\n    }'
);

// handleUpdateSource
content = content.replace(
  'const handleUpdateSource = async (sourceStr: string) => {\n    setIsEditingSource(false);\n    if (!character) return;',
  'const handleUpdateSource = async (sourceStr: string) => {\n    setIsEditingSource(false);\n    if (!character) return;\n    const currentSource = character.data?.data?.creator_notes || character.data?.creator_notes || \'\';\n    if (sourceStr === currentSource) return;'
);

// handleUpdateCreator
content = content.replace(
  'const handleUpdateCreator = async (creatorStr: string) => {\n    setIsEditingCreator(false);\n    if (!character) return;',
  'const handleUpdateCreator = async (creatorStr: string) => {\n    setIsEditingCreator(false);\n    if (!character) return;\n    const currentCreator = character.data?.data?.creator || character.data?.creator || \'\';\n    if (creatorStr === currentCreator) return;'
);

// handleUpdateVersion
content = content.replace(
  'const handleUpdateVersion = async (versionStr: string) => {\n    setIsEditingVersion(false);\n    if (!character) return;',
  'const handleUpdateVersion = async (versionStr: string) => {\n    setIsEditingVersion(false);\n    if (!character) return;\n    const currentVersion = character.data?.data?.character_version || character.data?.character_version || \'\';\n    if (versionStr === currentVersion) return;'
);

fs.writeFileSync('src/components/CharacterDetail.tsx', content);
console.log('Fixed detail updates');
