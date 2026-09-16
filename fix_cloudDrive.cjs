const fs = require('fs');
let code = fs.readFileSync('src/lib/cloudDrive.ts', 'utf8');

// Fix extraAvatars in buildCloudZip
code = code.replace(
  "  const safeName = getSafeFilename(char.name || 'Character');",
  "  const safeName = getSafeFilename(char.name || 'Character');\n  const extraAvatars = (char.avatarHistory || []).filter((b: any) => !char.avatarBlob || !(b.size === char.avatarBlob.size && b.type === char.avatarBlob.type));\n"
);

// Fix hasExtraAvatars and extraAvatars in the other block (line 624-626)
// Wait, I need to see what's on line 624.
fs.writeFileSync('src/lib/cloudDrive.ts', code);
