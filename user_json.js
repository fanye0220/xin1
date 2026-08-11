const json = {
  "name": "不老魔女的养小孩日常",
  "spec": "chara_card_v3",
  "data": {
    "character_book": {
      "entries": [ { "id": 0 } ]
    }
  }
};
const isWorldbook = json.entries !== undefined || (json.data && json.data.entries !== undefined);
console.log(isWorldbook);
