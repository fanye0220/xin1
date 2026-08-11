const fs = require('fs');
let content = fs.readFileSync('src/components/CloudSyncTab.tsx', 'utf8');

const injection = `
                        {char.appProperties?.cardType && char.appProperties.cardType !== 'character' && (
                          <div className="absolute top-2 left-2 px-2 py-0.5 bg-black/60 backdrop-blur-md rounded-md text-[10px] font-medium text-white/90 border border-white/10 uppercase">
                            {char.appProperties.cardType === 'worldbook' ? '世界书' :
                             char.appProperties.cardType === 'qr' ? '快速回复' :
                             char.appProperties.cardType === 'preset' ? '预设' :
                             char.appProperties.cardType === 'theme' ? '主题' :
                             char.appProperties.cardType === 'script' ? '脚本' : char.appProperties.cardType}
                          </div>
                        )}
                        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-60 group-hover:opacity-80 transition pointer-events-none" />
`;

content = content.replace(
  '<div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-60 group-hover:opacity-80 transition pointer-events-none" />',
  injection
);

fs.writeFileSync('src/components/CloudSyncTab.tsx', content);
console.log('Added badge logic');
