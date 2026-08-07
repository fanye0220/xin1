const fs = require('fs');
let content = fs.readFileSync('src/components/CharacterList.tsx', 'utf8');

if (!content.includes('const [isExporting, setIsExporting] = useState(false);')) {
  content = content.replace("  const [showScrollTop, setShowScrollTop] = useState(false);", "  const [showScrollTop, setShowScrollTop] = useState(false);\n  const [isExporting, setIsExporting] = useState(false);\n  const [exportMessage, setExportMessage] = useState('');\n  const [exportProgress, setExportProgress] = useState(0);");
}

content = content.replace(/setExporting\(/g, 'setIsExporting(');

fs.writeFileSync('src/components/CharacterList.tsx', content);
