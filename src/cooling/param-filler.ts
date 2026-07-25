// ============================================================
// 参数填充器 (Param Filler) — v2.1
// 职责：从模板 parameters 对象中随机选值，填充叙事模板的所有占位符
// 来源：narrative-engine-service → 核心逻辑100%通用，smartDefaults可注入
// ============================================================

/**
 * 从模板的 parameters 定义中抽取一组具体参数值
 * 支持 enum / int / float / range 四种类型
 */
export function fillParams(
  parameters: Record<string, any> | undefined,
  extraParams?: Record<string, any>
): Record<string, string> {
  const result: Record<string, string> = {};
  if (!parameters) return { ...(extraParams || {}) };

  for (const [key, def] of Object.entries(parameters)) {
    if (!def || typeof def !== 'object') continue;
    const type = def.type;

    if (type === 'enum' && Array.isArray(def.pool)) {
      result[key] = def.pool[Math.floor(Math.random() * def.pool.length)];
    } else if (type === 'int') {
      const min = typeof def.min === 'number' ? def.min : 1;
      const max = typeof def.max === 'number' ? def.max : 10;
      result[key] = String(Math.floor(Math.random() * (max - min + 1)) + min);
    } else if (type === 'float') {
      const min = typeof def.min === 'number' ? def.min : 0.5;
      const max = typeof def.max === 'number' ? def.max : 2.0;
      const val = min + Math.random() * (max - min);
      result[key] = val.toFixed(1);
    } else if (type === 'range') {
      const unit = def.unit || '米';
      result[key] = `十${unit}`;
      result[`${key}_desc`] = `十${unit}内`;
    } else {
      result[key] = String(def.default || '');
    }
  }

  if (extraParams) {
    for (const [k, v] of Object.entries(extraParams)) {
      result[k] = v;
    }
  }

  return result;
}

/**
 * 将填充好的参数应用到叙事模板中，替换所有 {xxx} 占位符
 */
export function renderTemplate(
  narrativeTemplate: string,
  params: Record<string, string>,
  defaults?: Record<string, string>
): string {
  let text = narrativeTemplate || '';

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) {
      const regex = new RegExp(`\\{${key}\\}`, 'g');
      text = text.replace(regex, value);
    }
  }

  if (defaults) {
    for (const [key, value] of Object.entries(defaults)) {
      const regex = new RegExp(`\\{${key}\\}`, 'g');
      text = text.replace(regex, value);
    }
  }

  text = cleanupPlaceholders(text, params);
  return text;
}

/**
 * 智能清理残留占位符
 * 支持注入自定义 smartDefaults，未匹配的占位符降级为通用处理
 */
export function cleanupPlaceholders(
  text: string,
  params: Record<string, string>,
  customDefaults?: Record<string, () => string>
): string {
  // 通用默认值（非矿工专属）
  const genericDefaults: Record<string, () => string> = {
    'protagonist': () => params.protagonist || '他',
    'character': () => params.protagonist || '他',
    'recipient': () => params.protagonist || '他',
    'target': () => '目标',
    'name': () => '对手',
    'location': () => params.location || '此处',
    'title': () => pickRandom(['首领', '头目', '负责人']),
    'time': () => pickRandom(['三年', '五年', '很多年']),
    'team_size': () => '一',
    'organization': () => pickRandom(['某个宗门', '一个势力', '一伙人']),
    'role': () => '路人',
    'atmosphere': () => pickRandom(['压抑', '紧张', '诡异', '肃穆']),
    'scene_type': () => '场景',
    'topic': () => '眼前的事',
    'opponent': () => '敌人',
    'action': () => pickRandom(['发动攻击', '做出反应', '有动作']),
    'distance': () => pickRandom(['三条街', '半里路', '整整一个时辰']),
    'dialogue': () => pickRandom(['拿着它，活下去', '这是我最后的托付', '替我守住这个秘密']),
    'body_part': () => pickRandom(['掌心', '拳面', '指尖', '手臂']),
    'character_name': () => pickRandom(['叶尘', '林远', '铁山', '苏云', '顾明']),
    'personality': () => pickRandom(['沉默寡言', '豪爽直率', '心思缜密', '外冷内热']),
    'appearance': () => pickRandom(['满脸风霜但眼神锐利', '身形魁梧肌肉结实', '面容清瘦目光深邃']),
    'speech_style': () => pickRandom(['说话简短有力', '声音洪亮', '语速缓慢但字字清晰']),
    'body_detail': () => pickRandom(['微微发抖', '布满了旧伤', '青筋暴起']),
    'subtext': () => pickRandom(['话里有话', '暗藏深意', '别有意图']),
    'message_content': () => pickRandom(['小心埋伏', '速来汇合', '我发现了什么']),
    'duration_effect': () => pickRandom(['无法行动', '意识模糊', '头痛欲裂']),
    'true_goal': () => pickRandom(['要抓活的', '要拿回他身上的东西', '不是为了杀他']),
    'method_1': () => pickRandom(['在暗处下毒', '设下陷阱等他踩', '从背后偷袭']),
    'method_2': () => pickRandom(['第二重陷阱', '真正的杀招', '埋伏的帮手']),
    'reward': () => '回报',
    'reason': () => pickRandom(['差点摔一跤', '灯光晃了一下', '走得太急']),
  };

  // 合并自定义默认值（覆盖通用默认值）
  const smartDefaults = { ...genericDefaults, ...(customDefaults || {}) };

  let prev = '';
  let attempts = 0;
  while (prev !== text && attempts < 5) {
    prev = text;
    const placeholders = text.match(/\{([^{}]+)\}/g);
    if (!placeholders) break;

    for (const ph of placeholders) {
      const key = ph.slice(1, -1);
      if (smartDefaults[key]) {
        text = text.replace(ph, smartDefaults[key]());
      } else {
        // 未知占位符降级处理
        if (key.includes('描述') || key.includes('desc')) {
          text = text.replace(ph, '...');
        } else if (key.includes('对话') || key.includes('dialogue') || key.includes('line')) {
          text = text.replace(ph, '...');
        } else {
          text = text.replace(ph, '');
        }
      }
    }
    attempts++;
  }

  // 清理多余标点
  text = text.replace(/。。+/g, '。');
  text = text.replace(/，，+/g, '，');
  text = text.replace(/''/g, "'");
  text = text.replace(/\s+/g, ' ').trim();

  return text;
}

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}