const fs = require('fs');
let content = fs.readFileSync('src/components/CharacterList.tsx', 'utf8');
if (!content.includes("import { uploadCharacterToCloud }")) {
  content = content.replace("import { getSafeFilename", "import { uploadCharacterToCloud } from '../lib/cloudDrive';\nimport { getSafeFilename");
}
fs.writeFileSync('src/components/CharacterList.tsx', content);
