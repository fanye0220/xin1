const fs = require('fs');

const json = {
  "name": "不老魔女的养小孩日常",
  "spec": "chara_card_v3",
  "data": {
    "name": "不老魔女的养小孩日常"
  }
};
const data = json;
const isTheme = data.blur_strength !== undefined || data.main_text_color !== undefined || data.chat_display !== undefined;
const isAIPreset = data.temperature !== undefined || data.prompts !== undefined || data.top_p !== undefined;
const isWorldbook = data.entries !== undefined || (data.data && data.data.entries !== undefined);
const isQR = Array.isArray(data) ? data.length > 0 && data[0].label !== undefined : data.quick_replies !== undefined || data.qrList !== undefined;
const isScript = data.run !== undefined || data.type === 'tool' || (data.type === 'script' && data.content !== undefined && data.name !== undefined);
const isCharacter = !isTheme && !isAIPreset && !isWorldbook && !isQR && !isScript && !!(data.name || data.data?.name);

console.log('isTheme:', isTheme);
console.log('isAIPreset:', isAIPreset);
console.log('isWorldbook:', isWorldbook);
console.log('isQR:', isQR);
console.log('isScript:', isScript);
console.log('isCharacter:', isCharacter);
