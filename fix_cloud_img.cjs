const fs = require('fs');
let content = fs.readFileSync('src/components/CloudSyncTab.tsx', 'utf8');

const oldImg = '<img src={char.thumbnailLink} alt={charName} className="w-full h-full object-cover group-hover:scale-105 transition duration-500" referrerPolicy="no-referrer" />';
const newImg = `
                          <>
                            <img 
                              src={char.thumbnailLink} 
                              alt={charName} 
                              className="w-full h-full object-cover group-hover:scale-105 transition duration-500" 
                              referrerPolicy="no-referrer" 
                              onError={(e) => {
                                e.currentTarget.style.display = 'none';
                                const fallback = e.currentTarget.nextElementSibling;
                                if (fallback) fallback.classList.remove('hidden');
                              }}
                            />
                            <div className="w-full h-full items-center justify-center hidden bg-black/40">
                              <Cloud className="w-8 h-8 text-white/20" />
                            </div>
                          </>
`;

content = content.replace(oldImg, newImg);
fs.writeFileSync('src/components/CloudSyncTab.tsx', content);
