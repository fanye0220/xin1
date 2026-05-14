const fs = require('fs');
let content = fs.readFileSync('src/components/CharacterChatsSection.tsx', 'utf8');

content = content.replace(
  'className="prose prose-invert prose-sm max-w-none \n                                 prose-headings:text-white/90',
  'className={`prose prose-sm max-w-none \n                                 prose-headings:text-white/90'
);

content = content.replace(
  '[&>*:first-child]:mt-0 [&>*:last-child]:mb-0 break-words w-full"\n                               >',
  '[&>*:first-child]:mt-0 [&>*:last-child]:mb-0 break-words w-full \\n                                 ${msg.is_user ? \'prose-p:text-white text-white\' : \'prose-invert\'}`}\n                               >'
);
fs.writeFileSync('src/components/CharacterChatsSection.tsx', content);
