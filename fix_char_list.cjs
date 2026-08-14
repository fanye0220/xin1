const fs = require('fs');
let code = fs.readFileSync('src/components/CharacterList.tsx', 'utf8');

// Replace className string with the dynamic class mapping.
const target = "        className={`relative flex items-center gap-4 p-3 rounded-2xl cursor-pointer transition-all select-none ${isSelected ? 'bg-purple-500/20 border-purple-500/50' : 'bg-white/5 hover:bg-white/10 border-transparent'} border`}";
const repl = "        className={`card-item-list relative flex items-center gap-4 p-3 rounded-2xl cursor-pointer transition-all select-none ${isSelected ? 'bg-purple-500/20 border-purple-500/50' : 'bg-white/5 hover:bg-white/10 border-transparent'} border`}";
code = code.replace(target, repl);

const targetGrid = "      <div \n        ref={cardRef}\n        className={`group relative flex flex-col bg-white/5 border ${isSelected ? 'border-purple-500' : 'border-white/10'} hover:border-white/20 hover:bg-white/10 rounded-2xl overflow-hidden cursor-pointer transition-all duration-300`}";
const replGrid = "      <div \n        ref={cardRef}\n        className={`card-item group relative flex flex-col bg-white/5 border ${isSelected ? 'border-purple-500' : 'border-white/10'} hover:border-white/20 hover:bg-white/10 rounded-2xl overflow-hidden cursor-pointer transition-all duration-300`}";
code = code.replace(targetGrid, replGrid);

const targetMasonry = "      <div \n        ref={cardRef}\n        className={`group relative bg-white/5 border ${isSelected ? 'border-purple-500/50 shadow-[0_0_15px_rgba(168,85,247,0.3)]' : 'border-white/10'} hover:border-white/20 hover:bg-white/10 rounded-2xl overflow-hidden cursor-pointer transition-all duration-300`}";
const replMasonry = "      <div \n        ref={cardRef}\n        className={`card-item-masonry group relative bg-white/5 border ${isSelected ? 'border-purple-500/50 shadow-[0_0_15px_rgba(168,85,247,0.3)]' : 'border-white/10'} hover:border-white/20 hover:bg-white/10 rounded-2xl overflow-hidden cursor-pointer transition-all duration-300`}";
code = code.replace(targetMasonry, replMasonry);

fs.writeFileSync('src/components/CharacterList.tsx', code);
console.log('Added card-item classes');
