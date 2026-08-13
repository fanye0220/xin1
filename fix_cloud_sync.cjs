const fs = require('fs');

// 1. In CloudSyncTab.tsx, dispatch event after download
let cloudSyncContent = fs.readFileSync('src/components/CloudSyncTab.tsx', 'utf8');
cloudSyncContent = cloudSyncContent.replace(
    /await saveCharacter\(charToSave\);\n        alert\(`「\$\{charToSave\.name\}」已成功下载至本地！`\);/g,
    `await saveCharacter(charToSave);\n        window.dispatchEvent(new CustomEvent('charactersUpdated'));\n        alert(\`「\${charToSave.name}」已成功下载至本地！\`);`
);

// 2. Also dispatch event after restoring backup
cloudSyncContent = cloudSyncContent.replace(
    /onProgress\("恢复完成！"\);\n            setTimeout\(\(\) => \{\n              setIsActive\(false\);\n              setTaskName\(''\);\n              setProgress\(0\);\n            \}, 1000\);/g,
    `onProgress("恢复完成！");\n            window.dispatchEvent(new CustomEvent('charactersUpdated'));\n            setTimeout(() => {\n              setIsActive(false);\n              setTaskName('');\n              setProgress(0);\n            }, 1000);`
);

fs.writeFileSync('src/components/CloudSyncTab.tsx', cloudSyncContent);

// 3. In CharacterList.tsx, listen for charactersUpdated
let charListContent = fs.readFileSync('src/components/CharacterList.tsx', 'utf8');
if (!charListContent.includes("charactersUpdated")) {
    charListContent = charListContent.replace(
        /useEffect\(\(\) => \{\n    loadCharacters\(\);\n    loadFolders\(\);\n  \}, \[searchQuery, selectedFolderId, loadCharacters, loadFolders\]\);/g,
        `useEffect(() => {\n    loadCharacters();\n    loadFolders();\n  }, [searchQuery, selectedFolderId, loadCharacters, loadFolders]);\n\n  useEffect(() => {\n    const handleUpdate = () => {\n      loadCharacters();\n      loadFolders();\n    };\n    window.addEventListener('charactersUpdated', handleUpdate);\n    return () => window.removeEventListener('charactersUpdated', handleUpdate);\n  }, [loadCharacters, loadFolders]);`
    );
    fs.writeFileSync('src/components/CharacterList.tsx', charListContent);
}

console.log('Fixed cloud sync events!');
