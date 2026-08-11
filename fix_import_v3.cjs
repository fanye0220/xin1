const fs = require('fs');

function normalizeV3Card(data) {
  if (data && data.spec === 'chara_card_v3' && data.data) {
    const v3Data = data.data;
    // Copy all fields from v3Data to root if they don't exist
    for (const key in v3Data) {
      if (data[key] === undefined) {
        data[key] = v3Data[key];
      }
    }
  }
  return data;
}

const mockData = {
  spec: 'chara_card_v3',
  data: {
    description: 'v3 desc',
    first_mes: 'v3 first mes'
  }
};
console.log(normalizeV3Card(mockData));
