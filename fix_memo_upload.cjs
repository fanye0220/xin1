const fs = require('fs');
let content = fs.readFileSync('src/components/CharacterMemosSection.tsx', 'utf8');

const replacement = `
        if (!isImage && (file.type === 'text/plain' || file.name.toLowerCase().endsWith('.txt') || file.name.toLowerCase().endsWith('.md'))) {
           content = await file.text();
           finalBlob = undefined;
           await saveMemo({
              id: crypto.randomUUID(),
              characterId,
              type: 'text',
              content: content,
              createdAt: Date.now()
            });
            continue;
        } else if (file.name.toLowerCase().endsWith('.json')) {
           try {
               const text = await file.text();
               const json = JSON.parse(text);
               if (json.entries || (json.data && json.data.entries)) {
                   await saveMemo({
                      id: crypto.randomUUID(),
                      characterId,
                      type: 'worldbook',
                      content: json.name || file.name,
                      blob: new Blob([text], { type: 'application/json' }),
                      createdAt: Date.now()
                    });
                    continue;
               }
           } catch (e) {
               console.error("Failed to parse json as worldbook", e);
           }
        }

        await saveMemo({`;

content = content.replace(
  `        if (!isImage && (file.type === 'text/plain' || file.name.toLowerCase().endsWith('.txt') || file.name.toLowerCase().endsWith('.md'))) {
           content = await file.text();
           finalBlob = undefined;
           await saveMemo({
              id: crypto.randomUUID(),
              characterId,
              type: 'text',
              content: content,
              createdAt: Date.now()
            });
            continue;
        }
        await saveMemo({`,
  replacement
);

fs.writeFileSync('src/components/CharacterMemosSection.tsx', content);
console.log('Fixed memo upload');
