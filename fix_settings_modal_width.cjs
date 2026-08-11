const fs = require('fs');
let content = fs.readFileSync('src/components/SettingsModal.tsx', 'utf8');

content = content.replace("w-full ${activeTab === 'cloud' ? 'max-w-4xl' : 'max-w-md'}", "w-full ${activeTab === 'cloud' ? 'max-w-6xl' : 'max-w-md'}");
fs.writeFileSync('src/components/SettingsModal.tsx', content);
