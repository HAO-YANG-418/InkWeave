import { MINER_PRESET } from './miner';
import { WUXIA_PRESET } from './wuxia';
import { LIGHT_NOVEL_PRESET } from './light-novel';
import { WASTELAND_PRESET } from './wasteland';
import { INFINITE_FLOW_PRESET } from './infinite-flow';
import { GAME_ISEKAI_PRESET } from './game-isekai';
import type { WritingPreset } from '../types';

export { MINER_PRESET };
export { WUXIA_PRESET };
export { LIGHT_NOVEL_PRESET };
export { WASTELAND_PRESET };
export { INFINITE_FLOW_PRESET };
export { GAME_ISEKAI_PRESET };

export const BUILTIN_PRESETS: WritingPreset[] = [
  MINER_PRESET,
  WUXIA_PRESET,
  LIGHT_NOVEL_PRESET,
  WASTELAND_PRESET,
  INFINITE_FLOW_PRESET,
  GAME_ISEKAI_PRESET,
];

export function getPresetById(id: string): WritingPreset | undefined {
  return BUILTIN_PRESETS.find(p => p.id === id);
}