import fs from 'fs';
let content = fs.readFileSync('src/components/CharacterChatsSection.tsx', 'utf8');

content = content.replace(
  'className="prose prose-invert prose-sm max-w-none',
  'className={`prose prose-sm max-w-none'
);

content = content.replace(
  '[&>*:first-child]:mt-0 [&>*:last-child]:mb-0 break-words w-full"',
  '[&>*:first-child]:mt-0 [&>*:last-child]:mb-0 break-words w-full \\n                                 ${msg.is_user ? \'prose-p:text-white text-white\' : \'prose-invert\'}`}'
);
fs.writeFileSync('src/components/CharacterChatsSection.tsx', content);
