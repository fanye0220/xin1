const fs = require('fs');
let content = fs.readFileSync('src/components/ImportModal.tsx', 'utf8');

content = content.replace(
    /absPath\.match\(\/\\\.(\(png\|jpe\?g\|webp\|gif\|json\))\$\/i\)/g,
    'absPath.match(/\\.(png|jpe?g|webp|gif|json|jsonl)$/i)'
);

content = content.replace(
    /relativePath\.match\(\/\\\.(\(png\|jpe\?g\|webp\|gif\|json\))\$\/i\)/g,
    'relativePath.match(/\\.(png|jpe?g|webp|gif|json|jsonl)$/i)'
);

content = content.replace(
    /f\.name\.endsWith\('\.json'\)/g,
    "f.name.match(/\\.(json|jsonl)$/i)"
);

content = content.replace(
    /else if \(absPath\.endsWith\('\.json'\)\) type = 'application\/json';/,
    "else if (absPath.endsWith('.json')) type = 'application/json';\n                  else if (absPath.endsWith('.jsonl')) type = 'application/jsonl';"
);

content = content.replace(
    /else if \(relativePath\.endsWith\('\.json'\)\) type = 'application\/json';/,
    "else if (relativePath.endsWith('.json')) type = 'application/json';\n              else if (relativePath.endsWith('.jsonl')) type = 'application/jsonl';"
);

fs.writeFileSync('src/components/ImportModal.tsx', content);
console.log('Fixed ImportModal ZIP JSONL support!');
