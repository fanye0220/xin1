const fs = require('fs');
let content = fs.readFileSync('src/components/CharacterList.tsx', 'utf8');

const oldLogic = `      const charsArray = Array.from(charIdsToExport);
      let success = 0;
      
      for (let i = 0; i < charsArray.length; i++) {`;

const newLogic = `      const charsArray = Array.from(charIdsToExport);
      if (charsArray.length === 0) {
        alert("所选文件夹中没有可上传的角色。");
        return;
      }
      let success = 0;
      
      for (let i = 0; i < charsArray.length; i++) {`;

if (content.includes(oldLogic)) {
  content = content.replace(oldLogic, newLogic);
  fs.writeFileSync('src/components/CharacterList.tsx', content);
  console.log("Replaced successfully");
} else {
  console.log("Could not find the target string.");
}
