const fs = require('fs');
let content = fs.readFileSync('src/lib/drive.ts', 'utf8');

content = content.replace(
    /charOriginalFile = new File\(\[buf\], `original\.\$\{ext\}`\, \{ type: mime \}\);\s+c    if \(charOriginalFile\) \{\s+const extension = /g,
    `charOriginalFile = new File([buf], \`original.\${ext}\`, { type: mime });
                charAvatarBlob = new Blob([buf], { type: mime });
            }
        } catch(e) {}
    }

    if (charOriginalFile) {
       const extension = `
);

content = content.replace(
    /  \}\);compression: "STORE" \/\/ 使用 STORE 不进行额外压缩。由于头像、大图等媒体格式本就已压缩，跳过解压\/压缩计算能将 CPU 及峰值内存消耗降低 90% 以上，彻底杜绝手机端在处理 2000\+ 卡片时的 OOM 闪退问题\s+  \}\);/g,
    `  });`
);

fs.writeFileSync('src/lib/drive.ts', content);
console.log('Fixed drive.ts!');
