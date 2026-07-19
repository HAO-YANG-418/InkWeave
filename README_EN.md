# GWE - Generic Web-novel Engine

> "When a reader's finger scrolls to your text, you have 3 seconds to hook them. Not 3 chapters. 3 seconds."

GWE is a **quality analysis and scoring engine** purpose-built for Chinese web novels (网文). It uses 7-dimensional radar scoring, 26 quality rules, and body-reaction anchor detection to help you write prose that readers won't scroll past.

- **Zero dependencies**: Pure TypeScript. No NLP libraries, no model dependencies. Runs in browser and Node.js.
- **7-dimension scoring**: Body Reaction / Sensory Signal / Action / Emotion / Info Advance / Twist Frequency / Chapter Hook
- **26 quality rules**: Covers 3-second opening, fake hooks, AI slop, cliché reactions, filler words, and more
- **Anchor quality tiers**: Cliché reaction (×0.2), normal reaction (×1.0), quality physiological reaction (×1.8)
- **22 configuration nodes**: Platform (Qidian/Tomato/Qimao/Jinjiang), genre (xianxia/urban/scifi/mystery), style (pacing/POV/rhetoric/tone)
- **12 built-in presets**: From Qidian xianxia to Tomato urban, ready to use out of the box

## Quick Start

### CLI

```bash
npm install -g gwe-engine

# Check a chapter file
gwe check chapter.txt

# Read from stdin
cat chapter.txt | gwe -

# JSON output for programmatic use
gwe --json chapter.txt > report.json
```

### Library Usage (Node.js / Browser)

```typescript
import { createEngineWithKB, MockProvider } from 'gwe-engine';

const { engine } = createEngineWithKB(new MockProvider());
const result = engine.check(chapterText);

console.log(`Score: ${result.score}`);
console.log(`Passed: ${result.passed}`);
console.log(`Radar scores:`, result.radarScores);
console.log(`Violations:`, result.violations);
```

### With LLM (AI Writing)

```typescript
import { createEngineWithKB, OpenAICompatibleProvider } from 'gwe-engine';

const provider = new OpenAICompatibleProvider({
  apiKey: 'your-api-key',
  baseURL: 'https://api.deepseek.com/v1',
  model: 'deepseek-chat',
});

const { engine } = createEngineWithKB(provider);
engine.selectPreset('preset_urban_tomato');

const stream = await engine.writeChapter({
  outline: 'Protagonist gets a system, encounters crisis on first use',
  previousChapter: '...',
  onDelta: (text) => process.stdout.write(text),
});
```

## Scoring Guide

| Score | Grade | Description |
|-------|-------|-------------|
| ≥90 | 🏆 Excellent | Top-tier popular web novel level, extremely high retention |
| ≥85 | ✅ Good | Publishable quality, good reader retention |
| ≥75 | ⚠ Passing | Noticeable issues, revision needed |
| ≥60 | ⚠ Poor | Multiple problems, consider rewriting key sections |
| <60 | ✗ Fail | Below standard, readers will scroll away |

## Benchmark

| Text Type | Chars | Score | Body | Sensory | Action | Emotion | Info | Twist | Hook | Violations |
|-----------|-------|-------|------|---------|--------|---------|------|-------|------|------------|
| Hook-driven style ("Miner" style) | 388 | **84.7** | 73 | 100 | 100 | 100 | 100 | 100 | 78 | 3 |
| Classic cliché opening (system apotheosis) | 372 | **84.4** | 92 | 100 | 100 | 83 | 100 | 99 | 68 | 3 |
| AI scenery slop | 391 | **57** | 73 | 90 | 97 | 77 | 61 | 53 | 68 | 9 |

## Why Not LLMs?

GWE doesn't depend on any large language model. Its detection logic is entirely rules-based, which means:

1. **Blazing fast**: Checking a 3000-char chapter takes <10ms. LLMs take 3-10 seconds.
2. **Zero cost**: No API keys, no GPU needed, works offline.
3. **Consistent**: Same text always gets the same score, no model drift.
4. **Explainable**: Every score and violation comes with a clear reason and fix suggestion.
5. **Customizable**: 22 config nodes + custom vocabularies for any style.

LLMs are great at generation. GWE is great at judgment. Best used together: LLM writes the draft, GWE does quality control, iterate until the score passes the threshold.

## Architecture

```
gwe-engine/
├── src/
│   ├── index.ts           # Public API
│   ├── types.ts           # Type definitions + default thresholds/weights
│   ├── gwe-engine.ts      # Main engine class (GWEEngine)
│   ├── checker.ts         # Text checker (26 rules)
│   ├── radar.ts           # 7-dimension radar scoring
│   ├── anchor-detector.ts # Body reaction anchor detection (3-tier quality)
│   ├── filler-words.ts    # Filler word detection
│   ├── config-merger.ts   # Config merger
│   ├── node-registry.ts   # 22-node registry
│   ├── validator.ts       # Conflict/dependency validator
│   ├── prompt-builder.ts  # LLM prompt builder (9 task templates)
│   ├── llm-provider.ts    # LLM abstraction (OpenAI-compatible / Mock)
│   ├── kb-loader.ts       # Knowledge base loader (static imports)
│   ├── cli.ts             # CLI tool
│   └── kb/                # Knowledge base data
│       ├── nodes/         # 22 nodes × option KB files (85 .kb.json files)
│       ├── presets/       # 12 built-in presets
│       ├── base-vocab.json
│       ├── base-fillers.json
│       └── base-prompt.ts
└── dist/                  # Build output
```

## License

MIT
