const fs = require('fs');
const css = fs.readFileSync('src/index.css', 'utf8');
if (css.includes('content-visibility')) {
    console.log('CSS has content-visibility');
} else {
    console.log('CSS missing content-visibility');
}

const list = fs.readFileSync('src/components/CharacterList.tsx', 'utf8');
if (list.includes('card-item-list')) {
    console.log('Component has card-item classes');
} else {
    console.log('Component missing card-item classes');
}
