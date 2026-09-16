const fs = require('fs');

let content = fs.readFileSync('src/components/CloudSyncTab.tsx', 'utf-8');

// Replace the folderPath parsing logic
const target = `        if (mergedMeta?.folderPath) {
           const allFolders = await getFolders();
           let parts = (mergedMeta.folderPath as string).split('/').filter(Boolean);
           
           // 1. "角色卡" 顶层分类对应 App 根目录（主页），不建同名文件夹
           if (parts.length > 0 && parts[0] === '角色卡') {
               parts = parts.slice(1);
           }
           // 2. "工具区" 顶层分类对应 App 工具分类，不建同名文件夹
           if (parts.length > 0 && parts[0] === '工具区') {
               parts = parts.slice(1);
               if (parts.length > 0 && ['预设', '世界书', '美化', '快速回复', '脚本', '其他'].includes(parts[0])) {
                   parts = parts.slice(1);
               }
           }`;

const replacement = `        if (mergedMeta?.folderPath) {
           const allFolders = await getFolders();
           let parts = (mergedMeta.folderPath as string).split('/').filter(Boolean);
           
           const isBundle = mergedMeta.hasBundle === 'true' || mergedMeta.hasBundle === true;
           // If it's a bundle, the Google Drive folder path includes the character's own directory at the end.
           // We remove it so we don't create a local folder named after the character.
           if (isBundle && parts.length > 0) {
               parts.pop();
           }
           
           // 1. "角色卡" 顶层分类对应 App 根目录（主页），不建同名文件夹
           if (parts.length > 0 && parts[0] === '角色卡') {
               parts = parts.slice(1);
           }
           // 2. "工具区" 顶层分类对应 App 工具分类，不建同名文件夹
           if (parts.length > 0 && parts[0] === '工具区') {
               parts = parts.slice(1);
           }`;

content = content.replace(target, replacement);

fs.writeFileSync('src/components/CloudSyncTab.tsx', content);
