import { GoogleGenAI } from "@google/genai";

export interface CustomEndpoint {
  id: string;
  name: string;
  url: string;
  key: string;
  model: string;
}

export interface AISettings {
  type: 'custom';
  customEndpoints: CustomEndpoint[];
  activeCustomId: string;
}

export function getAISettings(): AISettings {
  const saved = localStorage.getItem('ai_settings');
  if (saved) {
    try { 
      const parsed = JSON.parse(saved); 
      // Migration from old format
      if (parsed.customUrl !== undefined) {
        const migrated: AISettings = {
          type: 'custom',
          customEndpoints: [{
            id: 'default',
            name: '默认接口',
            url: parsed.customUrl || 'https://api.openai.com/v1',
            key: parsed.customKey || '',
            model: parsed.customModel || 'gpt-3.5-turbo'
          }],
          activeCustomId: 'default'
        };
        saveAISettings(migrated);
        return migrated;
      }
      if (parsed.type === 'gemini') {
          parsed.type = 'custom';
          saveAISettings(parsed);
      }
      return parsed;
    } catch (e) {}
  }
  return {
    type: 'custom',
    customEndpoints: [{
      id: 'default',
      name: '默认接口',
      url: 'https://api.openai.com/v1',
      key: '',
      model: 'gpt-3.5-turbo'
    }],
    activeCustomId: 'default'
  };
}

export function saveAISettings(settings: AISettings) {
  localStorage.setItem('ai_settings', JSON.stringify(settings));
}

export async function fetchCustomModels(url: string, key: string): Promise<string[]> {
  let baseUrl = url;
  if (baseUrl.endsWith('/chat/completions')) {
    baseUrl = baseUrl.replace(/\/chat\/completions$/, '');
  }
  baseUrl = baseUrl.replace(/\/$/, '');
  
  const res = await fetch(`${baseUrl}/models`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${key}`
    }
  });
  
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
  
  const data = await res.json();
  if (data && Array.isArray(data.data)) {
    return data.data.map((m: any) => m.id);
  }
  return [];
}

export async function testConnection(settings: AISettings): Promise<{success: boolean, message?: string}> {
  try {
    const endpoint = settings.customEndpoints.find(e => e.id === settings.activeCustomId) || settings.customEndpoints[0];
    if (!endpoint || !endpoint.url || !endpoint.key) return { success: false, message: '请填写 API 地址和 Key' };
    let url = endpoint.url;
    if (!url.endsWith('/chat/completions')) {
      url = url.replace(/\/$/, '') + '/chat/completions';
    }
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${endpoint.key}`
      },
      body: JSON.stringify({
        model: endpoint.model || 'gpt-3.5-turbo',
        messages: [{ role: 'user', content: 'say hi' }],
        max_tokens: 10
      })
    });
    if (!res.ok) {
      const err = await res.text();
      return { success: false, message: `HTTP ${res.status}: ${err.substring(0, 100)}` };
    }
    return { success: true, message: '连接成功！' };
  } catch (e: any) {
    return { success: false, message: e.message || String(e) };
  }
}

export async function callAI(prompt: string, expectJson: boolean = false): Promise<string> {
  const settings = getAISettings();
  
  const endpoint = settings.customEndpoints.find(e => e.id === settings.activeCustomId) || settings.customEndpoints[0];
  if (!endpoint || !endpoint.url || !endpoint.key) throw new Error("API_KEY_MISSING");
  let url = endpoint.url;
  if (!url.endsWith('/chat/completions')) {
    url = url.replace(/\/$/, '') + '/chat/completions';
  }
  
  const finalPrompt = expectJson ? prompt + "\n\nIMPORTANT: You must respond ONLY with valid JSON. Do not include markdown formatting like ```json." : prompt;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${endpoint.key}`
    },
    body: JSON.stringify({
      model: endpoint.model || 'gpt-3.5-turbo',
      messages: [{ role: 'user', content: finalPrompt }]
    })
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`API Error ${res.status}: ${errText.substring(0, 200)}`);
  }
  const data = await res.json();
  let content = data.choices?.[0]?.message?.content || '';
  
  if (expectJson) {
     content = content.replace(/^```json\s*/, '').replace(/\s*```$/, '');
  }
  return content;
}

export async function generateTagsForCharacters(characters: any[]): Promise<string[][]> {
  const charInfos = characters.map((char, index) => {
    let worldbookContent = '无';
    if (char.character_book && char.character_book.entries) {
      worldbookContent = char.character_book.entries
        .map((e: any) => `[${e.keys ? (Array.isArray(e.keys) ? e.keys.join(', ') : e.keys) : '条目'}]: ${e.content}`)
        .join('\n')
        .substring(0, 1000);
    } else if (char.extensions?.character_book?.entries) {
      worldbookContent = char.extensions.character_book.entries
        .map((e: any) => `[${e.keys ? (Array.isArray(e.keys) ? e.keys.join(', ') : e.keys) : '条目'}]: ${e.content}`)
        .join('\n')
        .substring(0, 1000);
    }
    
    return `
【角色 ${index + 1}】
角色名称: ${char.name || '未知'}
描述: ${(char.description || '无').substring(0, 1000)}
性格: ${(char.personality || '无').substring(0, 500)}
场景: ${(char.scenario || '无').substring(0, 500)}
首条消息: ${(char.first_mes || '无').substring(0, 1000)}
世界书(部分): ${worldbookContent}
`;
  }).join('\n\n');

  const prompt = `你是一个专业的角色扮演(语C/跑团)标签整理助手。请阅读以下 ${characters.length} 个角色设定，并为每个角色提取 3 到 8 个精准的分类标签。

【标签要求】
请参考小说或二次元常见的分类方式，提取以下几个维度的标签（不需要包含维度名称，直接输出标签即可）：
1. 世界观/背景：例如 现代、古代、西幻、赛博朋克、末日、星际、校园、职场 等。
2. 角色性格：例如 温柔、病娇、腹黑、冷酷、傲娇、阳光、疯批 等。
3. 角色身份/特征：例如 VTB、高干、社畜、学生、总裁、魔王、吸血鬼、人外 等。
4. 互动类型：例如 单人、多人、群像 等。

${charInfos}

请严格返回一个 JSON 数组，数组的长度必须与角色数量（${characters.length}）一致。数组中的每个元素也是一个数组，包含对应角色提取出的标签字符串。
例如，如果有 2 个角色，返回格式必须是：
[
  ["现代", "校园", "病娇"],
  ["西幻", "魔王", "傲娇"]
]
不要返回任何其他说明文字。`;

  try {
    const text = await callAI(prompt, true);
    let tagsList = JSON.parse(text);
    
    // Robust array extraction
    if (!Array.isArray(tagsList)) {
      if (typeof tagsList === 'object' && tagsList !== null) {
        const possibleArray = Object.values(tagsList).find(val => Array.isArray(val));
        if (possibleArray) {
          tagsList = possibleArray;
        }
      }
    }
    
    if (Array.isArray(tagsList)) {
      return tagsList.map(tags => {
        if (Array.isArray(tags)) {
          // Split by comma in case the AI returns a single string with commas
          return tags.flatMap(t => String(t).split(/[,，、]/)).map(t => t.trim()).filter(t => t);
        }
        return [];
      });
    }
    return characters.map(() => []);
  } catch (error) {
    console.error("Error generating tags:", error);
    throw error;
  }
}
