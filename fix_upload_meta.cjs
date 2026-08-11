const fs = require('fs');
let content = fs.readFileSync('src/lib/cloudDrive.ts', 'utf8');

const injection = `
  const rawData = char.data;
  let charType = 'character';
  if (rawData) {
      if (!!(rawData.prompts || rawData.temperature !== undefined || rawData.top_p !== undefined)) charType = 'preset';
      else if (rawData.entries !== undefined || (rawData.data && rawData.data.entries !== undefined)) charType = 'worldbook';
      else if (rawData.blur_strength !== undefined || rawData.main_text_color !== undefined || rawData.chat_display !== undefined) charType = 'theme';
      else if (Array.isArray(rawData) && rawData.length > 0 && rawData[0].message !== undefined) charType = 'qr';
      else if (rawData.name && rawData.code !== undefined && rawData.trigger !== undefined) charType = 'script';
  }
`;

content = content.replace(
  '  const folderId = await getCloudFolderId(token);',
  injection + '\n  const folderId = await getCloudFolderId(token);'
);

content = content.replace(
  '      charName: char.name || "",\n      folderPath: folderPath,',
  '      charName: char.name || "",\n      cardType: charType,\n      folderPath: folderPath,'
);

fs.writeFileSync('src/lib/cloudDrive.ts', content);
console.log('Updated meta');
