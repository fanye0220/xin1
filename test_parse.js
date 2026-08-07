function parsePayload(payload) {
  try {
    const binString = atob(payload);
    const bytes = Uint8Array.from(binString, (m) => m.codePointAt(0));
    const jsonString = new TextDecoder('utf-8').decode(bytes);
    return JSON.parse(jsonString);
  } catch (e) {
    console.log("Error 1", e);
    try {
      const jsonString = decodeURIComponent(escape(atob(payload)));
      return JSON.parse(jsonString);
    } catch (e2) {
       console.log("Error 2", e2);
      try {
        return JSON.parse(payload);
      } catch (e3) {
        return null;
      }
    }
  }
}

const data = { name: "test", desc: "test desc 哈哈哈" };
const jsonString = JSON.stringify(data);
// What injectTavernData does:
const base64 = btoa(unescape(encodeURIComponent(jsonString)));

const parsed = parsePayload(base64);
console.log(parsed);
