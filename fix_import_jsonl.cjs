const fs = require('fs');
let content = fs.readFileSync('src/components/ImportModal.tsx', 'utf8');

// 1. Add accept for .jsonl
content = content.replace(
    /accept="\.png,\.jpg,\.jpeg,\.webp,\.gif,\.json,\.zip,image\/\*,application\/json,application\/zip,application\/x-zip-compressed"/g,
    `accept=".png,.jpg,.jpeg,.webp,.gif,.json,.jsonl,.zip,image/*,application/json,application/jsonl,application/zip,application/x-zip-compressed"`
);

// 2. Parse chunk logic
content = content.replace(
    /\} else if \(file\.type === 'application\/json' \|\| file\.name\.endsWith\('\.json'\)\) \{/,
    `} else if (file.name.toLowerCase().endsWith('.jsonl')) {
          const text = await file.text();
          const lines = text.trim().split('\\n');
          data = [];
          for (let k = 0; k < lines.length; k++) {
            try {
              const parsed = JSON.parse(lines[k]);
              if (parsed) data.push(parsed);
            } catch (e) {}
          }
          if (data.length > 0) {
            isMain = true;
            data = { isChatHistory: true, messages: data };
          } else {
            errorMsg = "无效的聊天记录文件。";
          }
        } else if (file.type === 'application/json' || file.name.endsWith('.json')) {`
);

// 3. Assemble and save logic
content = content.replace(
    /const charsToSave: CharacterCard\[\] = \[\];\n    let successCount = 0;/,
    `const charsToSave: CharacterCard[] = [];
    const chatsToSave: any[] = [];
    let successCount = 0;`
);

content = content.replace(
    /const isCharacter = !isTheme && !isAIPreset && !isWorldbook && !isQR && !isScript && !!\(data\.name \|\| data\.data\?\.name\);/,
    `const isCharacter = !isTheme && !isAIPreset && !isWorldbook && !isQR && !isScript && !data.isChatHistory && !!(data.name || data.data?.name);`
);

content = content.replace(
    /\} else if \(isCharacter\) \{[\s\S]*?charName = data\.name \|\| data\.data\?\.name \|\| 'Unknown Character';\n        \}/,
    `} else if (isCharacter) {
          charName = data.name || data.data?.name || 'Unknown Character';
        } else if (data.isChatHistory) {
          // It's a chat history
        }`
);

content = content.replace(
    /const newChar: CharacterCard & \{ autoImportFilename\?: string \} = \{/,
    `if (data.isChatHistory) {
          let charId = "";
          const aiMessage = data.messages.find((m: any) => !m.is_user && m.name);
          if (aiMessage && aiMessage.name) {
             const existingChar = existingMeta.find(c => c.name.toLowerCase() === aiMessage.name.toLowerCase());
             if (existingChar) charId = existingChar.id;
          }
          chatsToSave.push({
            id: crypto.randomUUID(),
            characterId: charId,
            name: file.name,
            messages: data.messages,
            createdAt: Date.now()
          });
          successCount++;
          continue;
        }
        const newChar: CharacterCard & { autoImportFilename?: string } = {`
);

content = content.replace(
    /if \(charsToSave\.length > 0\) \{\n      await saveCharacters\(charsToSave, extractedRoots\);\n    \}/,
    `if (charsToSave.length > 0) {
      await saveCharacters(charsToSave, extractedRoots);
    }
    if (chatsToSave.length > 0) {
      const { saveChatsBulk } = await import('../lib/db');
      await saveChatsBulk(chatsToSave);
    }`
);

fs.writeFileSync('src/components/ImportModal.tsx', content);
console.log('Fixed ImportModal.tsx jsonl support!');
