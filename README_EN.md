# InkWeave — Writing Intelligence Engine for Web Novels

> "When a reader's finger scrolls to your text, you have 3 seconds to hook them. Not 3 chapters. 3 seconds."

**InkWeave** (墨织, "ink weave") is a **writing intelligence engine** purpose-built for Chinese web novels (网文). No LLM dependency. Pure rules. Millisecond response. Weave stories with ink.

[![npm version](https://img.shields.io/npm/v/inkweave)](https://www.npmjs.com/package/inkweave)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

---

## Why InkWeave?

| | InkWeave | LLM-based solutions |
|---|---|---|
| **Speed** | 3000 chars < 10ms | 3-10 seconds |
| **Cost** | Zero, works offline | Pay per token |
| **Consistency** | Same text, same score, always | Model version drift |
| **Explainable** | Every deduction has a clear reason and fix | Black box |
| **Customizable** | 22 config nodes + custom vocab | Prompt engineering |

> **LLMs write. InkWeave judges.** Use both: iterate until the score clears the bar.

---

## Core Capabilities

- **7-Dimension Radar Scoring**: Body Reaction / Sensory / Action / Emotion / Info Advance / Twist Density / Chapter Hook
- **35 Quality Rules**: 3-second opening, fake hooks, AI slop, cliché reactions, filler words, sentence waveform, comma chains, and more
- **Anchor Quality Tiers**: Cliché (×0.2), Normal (×1.0), Quality physiological (×1.8)
- **9 Specialized Checks (v3.4)**: Character voice, action variety, sensory density, sentence waveform, data concreteness, exclamation quota, forbidden characters, "not-X-but-Y" patterns, comma chains
- **Cross-Chapter Analysis**: Opening/ending pattern detection, overdue foreshadowing alerts, scene transition hints
- **22 Config Nodes**: Platform (Qidian/Tomato/Qimao/Jinjiang/Feilu), Genre (11 types), Style (pacing/POV/rhetoric/tone)
- **18 Built-in Presets**: 6 genre presets + 12 platform presets, ready out of the box

---

## Quick Start

### CLI

```bash
npm install -g inkweave

# Check a chapter
inkweave check chapter.txt

# Read from stdin
cat chapter.txt | inkweave -

# JSON output
inkweave --json chapter.txt > report.json
```

### Library Usage

```typescript
import { createEngineWithKB, MockProvider } from 'inkweave';

const { engine } = createEngineWithKB(new MockProvider());

// Single chapter check
const result = engine.check(chapterText);

// Cross-chapter analysis
const context = engine.getBookContext();
context.addChapter(chapter1);
context.addChapter(chapter2);
const warnings = context.getCrossChapterWarnings();
// → ["Last 3 chapters all used single-word sensory openings. Try dialogue/action instead."]
// → ["Foreshadowing 'sword bone seal' planted in chapter 3, 5 chapters unresolved."]
```

### With LLM

```typescript
import { createEngineWithKB, OpenAICompatibleProvider } from 'inkweave';

const provider = new OpenAICompatibleProvider({
  apiKey: 'your-api-key',
  baseURL: 'https://api.deepseek.com',
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

---

## Scoring Guide

| Score | Grade | Description |
|-------|-------|-------------|
| ≥90 | 🏆 Excellent | Top-tier web novel level, extremely high retention |
| ≥85 | ✅ Good | Publishable quality, good reader retention |
| ≥75 | ⚠ Passing | Noticeable issues, revision needed |
| ≥60 | ⚠ Poor | Multiple problems, consider rewriting key sections |
| <60 | ✗ Fail | Below standard, readers will scroll away |

---

## Benchmark

| Text Type | Chars | Score | Violations |
|-----------|-------|-------|------------|
| Hook-driven style | 388 | **84.7** | 3 |
| Classic cliché opening | 372 | **84.4** | 3 |
| AI scenery slop | 391 | **57** | 9 |

---

## v3.4 New: 9 Specialized Checks

| Check | What It Detects | Example Violation |
|-------|----------------|-------------------|
| **Character Voice** | Distinctiveness of character dialogue | All characters sound identical |
| **Action Variety** | Monotonous action descriptions | Repeated "nodded" / "shook head" |
| **Sensory Density** | Over-reliance on visual description | Entire passage is visual-only |
| **Sentence Waveform** | Rhythmic alternation of sentence lengths | 10+ consecutive sentences of same length |
| **Data Concreteness** | Vague vs. specific quantities | "Tens of thousands" / "endless power" |
| **Exclamation Quota** | Overuse of exclamation marks | 3+ exclamation marks in one paragraph |
| **Forbidden Characters** | Common web novel crutch words | Sentence-ending "呢""吧""吗" abuse |
| **Not-X-But-Y Pattern** | Overuse of negation-reveal structure | Consecutive "不是……是……" patterns |
| **Comma Chain** | Excessively long comma-connected sentences | Single sentence with 8+ commas |

---

## Cross-Chapter Analysis

InkWeave doesn't just check individual chapters — it tracks patterns across your entire book:

- **Opening Pattern Detection**: 3 consecutive chapters with "single-word sensory" openings? It'll flag you on chapter 4 to switch it up.
- **Ending Pattern Detection**: Overusing "not X. It was Y." endings? It'll suggest suspense questions or action closings instead.
- **Overdue Foreshadowing**: Important foreshadowing unresolved for 5+ chapters? Automatic alert.
- **Scene Continuity**: Auto-extracts the previous chapter's closing scene and prompts natural transition.

---

## Architecture

```
inkweave/
├── src/
│   ├── index.ts              # Public API
│   ├── types.ts              # Type definitions + defaults
│   ├── gwe-engine.ts         # Main engine class
│   ├── checker.ts            # 35-rule checker
│   ├── radar.ts              # 7-dimension radar scoring
│   ├── anchor-detector.ts    # Body reaction anchor detection
│   ├── filler-words.ts       # Filler word detection
│   ├── config-merger.ts      # Config merger
│   ├── node-registry.ts      # 22-node registry
│   ├── validator.ts          # Conflict/dependency validator
│   ├── prompt-builder.ts     # LLM prompt builder
│   ├── llm-provider.ts       # LLM abstraction layer
│   ├── kb-loader.ts          # Knowledge base loader
│   ├── book-context.ts       # Book context + cross-chapter analysis
│   ├── book-checker.ts       # Batch book checker
│   ├── cli.ts                # CLI tool
│   ├── checks/               # v3.4 specialized checks (9 modules)
│   └── kb/                   # Knowledge base data
│       ├── nodes/            # 22 nodes × option KB files
│       ├── presets/          # 18 built-in presets
│       ├── base-vocab.json
│       ├── base-fillers.json
│       └── base-prompt.ts
└── dist/                     # Build output
```

---

## Roadmap

InkWeave is evolving from a **quality checker** into a **writing intelligence agent**:

| Milestone | Focus | Status |
|-----------|-------|--------|
| v3.4 | Specialized checks + cross-chapter analysis | ✅ Released |
| v3.5 | Checker registry (toggle control, priority scheduling) | ✅ Released |
| v4.0 | Smart suggestion engine (auto-generate fixes from results) | 🚧 In progress |
| v5.0 | Writing style learning (learn preferences from your chapters) | 🔬 Research |
| v6.0 | Narrative strategy engine (chapter type recognition, conflict tracking) | 🔬 Research |

> Interested in the roadmap? **Star & Watch** this repo to get notified.

---

## Contributing

Issues and PRs welcome. If you have good detection rules or preset ideas, we'd love to see them.

## License

MIT