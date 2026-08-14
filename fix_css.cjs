const fs = require('fs');
let css = fs.readFileSync('src/index.css', 'utf8');
css += `\n/* Optimize card items rendering for long lists */\n.card-item {\n  content-visibility: auto;\n  contain-intrinsic-size: auto 150px;\n}\n.card-item-list {\n  content-visibility: auto;\n  contain-intrinsic-size: auto 90px;\n}\n.card-item-masonry {\n  content-visibility: auto;\n  contain-intrinsic-size: auto 250px;\n}\n`;
fs.writeFileSync('src/index.css', css);
console.log('Added content-visibility CSS');
