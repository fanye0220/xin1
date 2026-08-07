const fs = require('fs');
let appContent = fs.readFileSync('src/App.tsx', 'utf8');

if (!appContent.includes("window.addEventListener('tavern-db-updated'")) {
  const useEffectBlock = `
  useEffect(() => {
    const handleDbUpdate = () => {
      setRefreshKey(prev => prev + 1);
    };
    window.addEventListener('tavern-db-updated', handleDbUpdate);
    return () => {
      window.removeEventListener('tavern-db-updated', handleDbUpdate);
    };
  }, []);
`;
  appContent = appContent.replace('  const [refreshKey, setRefreshKey] = useState(0);', '  const [refreshKey, setRefreshKey] = useState(0);\n' + useEffectBlock);
  fs.writeFileSync('src/App.tsx', appContent);
}

let dbContent = fs.readFileSync('src/lib/db.ts', 'utf8');
if (!dbContent.includes("window.dispatchEvent(new CustomEvent('tavern-db-updated'));")) {
  dbContent = dbContent.replace('export function invalidateCache() {', 'export function invalidateCache() {\n  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("tavern-db-updated"));');
  fs.writeFileSync('src/lib/db.ts', dbContent);
}
