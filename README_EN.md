# InkWeave — Writing Intelligence Engine for Web Novels

> "Weave stories with ink."

**InkWeave** (墨织, "ink weave") is a **writing intelligence engine** purpose-built for Chinese web novels (网文). It doesn't just write — it understands web novel rhythm, payoffs, and reader psychology. Every paragraph it generates is automatically quality-checked, so your output comes with built-in retention power.

[![npm version](https://img.shields.io/npm/v/inkweave)](https://www.npmjs.com/package/inkweave)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

---

## What It Does

InkWeave is a **rules-engine + LLM dual-drive** writing system:

```
Your outline/idea → InkWeave Engine → High-quality chapter
                         ↑
                  Rules engine auto-QA
                  (7-dim radar + 35 rules + cross-chapter tracking)
```

**Core capabilities:**

- **Smart Writing**: Connect to any OpenAI-compatible API (DeepSeek, GPT, Claude, etc.). Generate chapters from outlines, previous context, and style presets.
- **Real-time QA**: Auto-check during generation — enough body anchors? Right rhythm? Sentence variety? AI slop creeping in?
- **Cross-Chapter Memory**: Track the entire book's context. Detect opening/ending pattern repetition. Flag overdue foreshadowing. Ensure natural scene transitions.
- **Style Customization**: 22 config nodes × 18 built-in presets. Cover major platforms (Qidian/Tomato/Qimao/Jinjiang/Feilu) and 11 genres (Xianxia/Urban/Sci-fi/Mystery, etc.).

---

## vs. Pure AI Writing

| | InkWeave | Pure AI Writing |
|---|---|---|
| **Approach** | Engine-driven + rules QA, multi-round iteration | One-shot generation, quality varies |
| **Web Novel Knowledge** | Built-in 35 web novel rules, understands "payoff" | You prompt it to learn |
| **Quality Assurance** | Auto-score after each generation, retry if below bar | Black box, no idea if it's good |
| **Consistency** | Cross-chapter tracking, no contradictory settings | Often forgets earlier chapters |
| **Cost** | Rules layer is free, only LLM calls at cost | Pay per token |

> **InkWeave doesn't replace AI — it gives AI a web-novel-savvy "brain."**

---

## Quick Start

### CLI

```bash
npm install -g inkweave

# Check a chapter
inkweave check chapter.txt

# Batch check
inkweave check chapter*.txt --json > report.json
```

### LLM-Powered Writing

```typescript
import { createEngineWithKB, OpenAICompatibleProvider } from 'inkweave';

const provider = new OpenAICompatibleProvider({
  apiKey: 'your-api-key',
  baseURL: 'https://api.deepseek.com',
  model: 'deepseek-chat',
});

const { engine } = createEngineWithKB(provider);

// Select a preset (Tomato platform + Urban genre)
engine.selectPreset('preset_urban_tomato');

// Stream-generate a chapter
const stream = await engine.writeChapter({
  outline: 'Protagonist gets a system, crisis on first use',
  previousChapter: '...',
  onDelta: (text) => process.stdout.write(text),
});
```

### Cross-Chapter Writing Management

```typescript
const ctx = engine.getBookContext();

// Add chapters — engine auto-tracks
ctx.addChapter(chapter1);
ctx.addChapter(chapter2);
ctx.addChapter(chapter3);

// Before writing chapter 4, engine detects:
const warnings = ctx.getCrossChapterWarnings();
// → ["Last 3 chapters all used single-word sensory openings. Try dialogue/action."]
// → ["Foreshadowing 'sword bone seal' planted in ch3, 5 chapters unresolved."]

// Generate chapter 4 — warnings auto-injected into prompt
const chapter4 = await engine.writeChapter({
  outline: 'Protagonist discovers the sword bone seal secret',
  previousChapter: chapter3,
  onDelta: (text) => process.stdout.write(text),
});
```

---

## Built-in Web Novel Knowledge

### 7-Dimension Writing Radar

| Dimension | What It Watches | How It Affects Generation |
|-----------|----------------|--------------------------|
| **Body Reaction** | Does the reader "feel the pain"? | Low anchor density → auto-add body descriptions |
| **Sensory** | Are all five senses engaged? | Visual overload → guide in touch/sound/smell |
| **Action** | Is the story moving? | Too static → guide in action and conflict |
| **Emotion** | Heart racing? | Flat emotion → auto-add contrast/urgency |
| **Info Advance** | New information coming in? | Low density → guide in new setting/suspense |
| **Twist Density** | Any surprises? | Too linear → guide in reversals |
| **Chapter Hook** | Will they click "next chapter"? | Flat ending → auto-generate cliffhanger |

### Body Anchor Quality Tiers

Not all body reactions are payoffs. The engine treats them differently:

| Tier | Weight | Examples | Effect |
|------|--------|----------|--------|
| Cliché | ×0.2 | "pupils constricted", "gasped" | Readers are immune |
| Normal | ×1.0 | "heart racing", "palms sweating" | Baseline effect |
| Quality | ×1.8 | "stomach clenched", "neck went cold" | Readers feel it |

The engine actively avoids cliché anchors and prioritizes quality physiological responses during generation.

### 9 Specialized Checks

| Check | What It Solves |
|-------|---------------|
| Character Voice | All characters sound the same → auto-differentiate speech patterns |
| Action Variety | Repeated "nodded"/"shook head" → guide action diversity |
| Sensory Density | Visual-only descriptions → auto-add other senses |
| Sentence Waveform | 10+ same-length sentences → guide rhythm variation |
| Data Concreteness | "Tens of thousands"/"endless power" → guide specific numbers |
| Exclamation Quota | 3+ exclamation marks per paragraph → limit emotional cheapening |
| Forbidden Characters | "呢"/"吧"/"吗" sentence-ending abuse → auto-correct |
| Not-X-But-Y Pattern | Overuse of negation-reveal structure → guide alternative syntax |
| Comma Chain | 8+ commas in one sentence → guide sentence breaks |

---

## Scoring Guide

| Score | Grade | Description |
|-------|-------|-------------|
| ≥90 | 🏆 Excellent | Top-tier web novel, extremely high retention |
| ≥85 | ✅ Good | Publishable quality, good reader retention |
| ≥75 | ⚠ Passing | Noticeable issues, revision needed |
| ≥60 | ⚠ Poor | Multiple problems, rewrite key sections |
| <60 | ✗ Fail | Below standard, readers will scroll away |

---

## Benchmark

| Text Type | Chars | Score | Notes |
|-----------|-------|-------|-------|
| Engine-generated style | 388 | **84.7** | "Pain." 1-char opening, max info density |
| Classic cliché opening | 372 | **84.4** | System-isekai opening, standard |
| AI slop | 391 | **57** | Idiom stacking, empty scenery, metaphor overload |

---

## Architecture

```
inkweave/
├── src/
│   ├── index.ts              # Public API
│   ├── types.ts              # Type definitions + defaults
│   ├── gwe-engine.ts         # Main engine (writing + checking)
│   ├── checker.ts            # 35-rule checker
│   ├── radar.ts              # 7-dimension radar scoring
│   ├── anchor-detector.ts    # Body anchor detection (3-tier quality)
│   ├── filler-words.ts       # Filler word detection
│   ├── config-merger.ts      # Config merger
│   ├── node-registry.ts      # 22-node registry
│   ├── validator.ts          # Conflict/dependency validator
│   ├── prompt-builder.ts     # LLM prompt builder (injects web novel knowledge)
│   ├── llm-provider.ts       # LLM abstraction (OpenAI-compatible / Mock)
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

InkWeave is evolving from a **writing engine** into a **writing intelligence agent**:

| Milestone | Focus | Status |
|-----------|-------|--------|
| v3.4 | Writing engine + specialized checks + cross-chapter analysis | ✅ Released |
| v3.5 | Checker registry (toggle control, priority scheduling) | ✅ Released |
| v4.0 | Smart suggestion engine (auto-generate fixes from results) | 🚧 In progress |
| v5.0 | Writing style learning (learn preferences from your chapters) | 🔬 Research |
| v6.0 | Narrative strategy engine (chapter type recognition, conflict tracking) | 🔬 Research |

> Interested in the roadmap? **Star & Watch** this repo to get notified.

---

## Contributing

Issues and PRs welcome. If you have good writing rules, genre presets, or LLM optimization tips, we'd love to see them.

## License

MIT