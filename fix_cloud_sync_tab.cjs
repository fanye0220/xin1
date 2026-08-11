const fs = require('fs');
let content = fs.readFileSync('src/components/CloudSyncTab.tsx', 'utf8');

content = content.replace(
  'const handleDownloadCloudChar = async (fileId: string, charName: string, fileName: string) => {',
  'const handleDownloadCloudChar = async (fileId: string, charName: string, fileName: string, appProperties?: any) => {'
);

content = content.replace(
  'if (!existing && studioMeta?.folderPath) {',
  'const mergedMeta = { ...studioMeta, ...appProperties };\n        if (!existing && mergedMeta?.folderPath) {'
);

content = content.replace(
  'const parts = studioMeta.folderPath.split(\'/\');',
  'const parts = mergedMeta.folderPath.split(\'/\');'
);

content = content.replace(
  'if (studioMeta?.createdAt) {',
  'if (mergedMeta?.createdAt) {'
);

content = content.replace(
  'createTime = studioMeta.createdAt;',
  'createTime = parseInt(mergedMeta.createdAt as string) || mergedMeta.createdAt;'
);

content = content.replace(
  'onClick={() => handleDownloadCloudChar(char.id, charName, char.name)}',
  'onClick={() => handleDownloadCloudChar(char.id, charName, char.name, char.appProperties)}'
);
content = content.replace(
  'onClick={() => handleDownloadCloudChar(char.id, charName, char.name)}',
  'onClick={() => handleDownloadCloudChar(char.id, charName, char.name, char.appProperties)}'
);
// replace all instances
while (content.includes('onClick={() => handleDownloadCloudChar(char.id, charName, char.name)}')) {
  content = content.replace(
    'onClick={() => handleDownloadCloudChar(char.id, charName, char.name)}',
    'onClick={() => handleDownloadCloudChar(char.id, charName, char.name, char.appProperties)}'
  );
}

// Remove the hardcoded '.zip' replacement from char name parsing. Wait, previously we stripped .zip
// because they were all .zip. Now they might be .png or .json.
// Let's replace char.name?.replace('.zip', '') with char.name?.replace(/\.(zip|png|json|webp|jpg)$/i, '')
content = content.replace(
  "const charName = char.appProperties?.charName || char.name?.replace('.zip', '') || '';",
  "const charName = char.appProperties?.charName || char.name?.replace(/\\\\.(zip|png|json|webp|jpg)$/i, '') || '';"
);
content = content.replace(
  "const charName = char.appProperties?.charName || char.name?.replace('.zip', '');",
  "const charName = char.appProperties?.charName || char.name?.replace(/\\\\.(zip|png|json|webp|jpg)$/i, '');"
);
// Replace multiple times if needed
while(content.includes("replace('.zip', '')")) {
  content = content.replace("replace('.zip', '')", "replace(/\\.(zip|png|json|webp|jpg)$/i, '')");
}

fs.writeFileSync('src/components/CloudSyncTab.tsx', content);
