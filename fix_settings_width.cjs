const fs = require('fs');
let content = fs.readFileSync('src/components/SettingsModal.tsx', 'utf8');

const oldLine = 'className="bg-slate-900 border border-white/10 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl flex flex-col max-h-[90vh]"';
const newLine = "className={`bg-slate-900 border border-white/10 rounded-2xl w-full ${activeTab === 'cloud' ? 'max-w-4xl' : 'max-w-md'} transition-all duration-300 overflow-hidden shadow-2xl flex flex-col max-h-[90vh]`}";

if (content.includes(oldLine)) {
  content = content.replace(oldLine, newLine);
  fs.writeFileSync('src/components/SettingsModal.tsx', content);
  console.log("Replaced successfully");
} else {
  console.log("Could not find the target string.");
}
