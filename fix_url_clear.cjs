const fs = require('fs');
let code = fs.readFileSync('src/components/CharacterList.tsx', 'utf8');

const target = `  useEffect(() => {
    if (!isInView) return;
    
    let objectUrl: string | null = null;`;

const replacement = `  useEffect(() => {
    if (!isInView) {
      setUrl(initialUrl);
      return;
    }
    
    let objectUrl: string | null = null;`;

code = code.replace(target, replacement);
fs.writeFileSync('src/components/CharacterList.tsx', code);
console.log('Fixed memory leak');
