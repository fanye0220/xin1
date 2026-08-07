const fs = require('fs');
let content = fs.readFileSync('src/components/CharacterList.tsx', 'utf8');

if (!content.includes("import { uploadCharacterToCloud }")) {
  content = content.replace("import { injectTavernData } from '../lib/png';", "import { injectTavernData } from '../lib/png';\nimport { uploadCharacterToCloud } from '../lib/cloudDrive';");
}

fs.writeFileSync('src/components/CharacterList.tsx', content);
