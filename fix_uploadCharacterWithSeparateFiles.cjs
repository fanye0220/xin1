const fs = require('fs');
let code = fs.readFileSync('src/lib/cloudDrive.ts', 'utf8');

code = code.replace(
  "  if (hasExtraAvatars) {\n    for (let i = 0; i < extraAvatars.length; i++) {",
  "  const extraAvatars = (char.avatarHistory || []).filter((b: any) => !char.avatarBlob || !(b.size === char.avatarBlob.size && b.type === char.avatarBlob.type));\n  const hasExtraAvatars = extraAvatars.length > 0;\n\n  if (hasExtraAvatars) {\n    for (let i = 0; i < extraAvatars.length; i++) {"
);

fs.writeFileSync('src/lib/cloudDrive.ts', code);
