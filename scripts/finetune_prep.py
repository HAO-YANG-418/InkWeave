#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
finetune_prep.py — 微调语料「扒→洗→切」预处理骨架（方案方交付，不碰权重）

用途：把用户已授权/已购的网文 txt 语料，清洗、按场景切片、构造
      OpenAI chat/completions 格式训练样本，导出 train.jsonl / val.jsonl。

边界：
  - 仅消费本地已就绪文本（corpus/<书名>/raw.txt），不内嵌任何网络爬取逻辑。
  - 不调用任何 LLM、不训练、不花钱。权重训练由代码方在拿到语料+底座后执行。
  - 质量过滤此处给「可独立运行的启发式 stub」+ 明确标注「接引擎 radar/checks」的钩子。

用法（骨架，待语料到位后填路径）：
  python finetune_prep.py --corpus-dir ./corpus --out-dir ./finetune_data --val-ratio 0.1
"""

import argparse
import hashlib
import json
import os
import re
import sys

# ---------------------------------------------------------------------------
# 0. 配置（genre 配比 / 长度区间，对应方案文档第二节）
# ---------------------------------------------------------------------------
SYSTEM_PROMPT = (
    "你是网文作者。第一标准是好懂：读者零理解负担。"
    "简约≠难懂，克制≠不说清，留白≠藏逻辑，低逗句比≠剁碎句。"
    "写清因果与关键事实，用具体动作/感官/对话推进，不注水。"
)

# 书名 -> genre 标签（用于配比统计与质量过滤参数）
# 与 docs/方案与验收/本质解决路线_2026-09-02.md §2.3 最终定稿 8 本保持一致。
# 文件夹名须与此处 key 完全一致（脚本用 os.path.basename 取书名查表）。
BOOK_GENRE = {
    "我在精神病院学斩神": "urban_myth",   # 斩神·用户指定
    "斗罗大陆": "xuanhuan_early",          # 用户指定
    "完美世界": "xuanhuan_ancient",        # 用户指定
    "大奉打更人": "mystery_court",         # 调研选定
    "斗破苍穹": "xuanhuan",                # 调研选定
    "全职高手": "esports",                 # 调研选定
    "灵境行者": "urban_super",             # 调研选定
    "第一序列": "wasteland",               # 调研选定
}

# 高密度书（原剔除的诡秘之主类）训练样本占比上限（防过密）。
# 最终定稿 8 本均非高密度类型，此 cap 当前为空转安全闸，留待后续扩充语料。
DENSE_BOOK_CAP_RATIO = 0.15

# 切片长度区间（字）
SCENE_MIN_CHARS = 300
SCENE_MAX_CHARS = 1500

# 章节标题正则（起点常见：「第N章 xxx」）
CHAPTER_RE = re.compile(r"^第[一二三四五六七八九十百千0-9]+章[ \t]*.{0,40}$", re.M)


# ---------------------------------------------------------------------------
# 1. 扒（加载本地已就绪文本，不爬网）
# ---------------------------------------------------------------------------
def load_raw(book_dir: str):
    """读取 corpus/<书名>/raw.txt。返回 (书名, 全文)。"""
    raw_path = os.path.join(book_dir, "raw.txt")
    if not os.path.isfile(raw_path):
        print(f"[warn] 跳过 {book_dir}：未找到 raw.txt", file=sys.stderr)
        return None
    with open(raw_path, "r", encoding="utf-8") as f:
        return os.path.basename(book_dir), f.read()


# ---------------------------------------------------------------------------
# 2. 洗（清洗）
# ---------------------------------------------------------------------------
NON_NARRATIVE_RE = [
    re.compile(r"^\s*本书由.*(提供|制作|整理).*$", re.M),
    re.compile(r"^\s*目录\s*$", re.M),
    re.compile(r"^\s*上[架架]?感[言言]\s*$", re.M),
    re.compile(r"^\s*作[者品]?说\s*$", re.M),
    re.compile(r"^\s*求[月月]?票.*$", re.M),
    re.compile(r"^\s*PS[：:].*$", re.M),
]

def clean_text(text: str) -> str:
    """去非叙事块、去乱码、归一空行、合并被换行切断的句子（保守）。"""
    for rx in NON_NARRATIVE_RE:
        text = rx.sub("", text)
    # 去控制字符
    text = re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f]", "", text)
    # 英文标点→中文全角（逗号句号省略号）
    text = text.replace(",", "，").replace(".", "。")
    # 归一多个空行
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


# ---------------------------------------------------------------------------
# 3. 切（按章节→场景切片）
# ---------------------------------------------------------------------------
def split_chapters(text: str):
    """按章节标题切分，返回 [(chapter_title, body), ...]。"""
    parts = CHAPTER_RE.split(text)
    # CHAPTER_RE.split 会把匹配项作为分隔，需配对还原
    chapters = []
    lines = text.split("\n")
    cur_title, cur_body = "(no-chapter)", []
    for ln in lines:
        if CHAPTER_RE.match(ln.strip()):
            if cur_body:
                chapters.append((cur_title, "\n".join(cur_body).strip()))
            cur_title, cur_body = ln.strip(), []
        else:
            cur_body.append(ln)
    if cur_body:
        chapters.append((cur_title, "\n".join(cur_body).strip()))
    return [c for c in chapters if c[1]]


def split_scenes(body: str):
    """按空行切场景；过长再按镜头(~500字)切，过短合并相邻。"""
    blocks = [b.strip() for b in re.split(r"\n{2,}", body) if b.strip()]
    scenes, buf = [], ""
    for b in blocks:
        if len(buf) + len(b) < SCENE_MIN_CHARS:
            buf = (buf + "\n" + b).strip()
        else:
            if buf:
                scenes.append(buf)
            buf = b
    if buf:
        scenes.append(buf)
    # 过长再切
    final = []
    for s in scenes:
        if len(s) > SCENE_MAX_CHARS:
            for i in range(0, len(s), SCENE_MAX_CHARS):
                final.append(s[i:i + SCENE_MAX_CHARS])
        else:
            final.append(s)
    return final


# ---------------------------------------------------------------------------
# 4. 质量过滤（启发式 stub + 接引擎钩子）
# ---------------------------------------------------------------------------
def heuristic_quality_ok(scene: str) -> bool:
    """
    可独立运行的轻量启发式（不依赖引擎）。
    真·质量过滤应接 源码/radar.ts + 源码/checks/ 跑分，见 quality_filter_engine_hook()。
    """
    # 剔通过短（纯流水碎句）
    if len(scene) < SCENE_MIN_CHARS:
        return False
    # 剔无身份碎句率过高：连续 ≤8 字、以句号结尾的短句占比 > 60%
    sents = [s for s in re.split(r"[。！？]", scene) if s.strip()]
    if not sents:
        return False
    tiny = sum(1 for s in sents if len(s.strip()) <= 8)
    if tiny / len(sents) > 0.6:
        return False
    # 剔纯信息密度低的概括空转（无具体名词动词，这里用「的」堆砌近似）
    if scene.count("的") / max(1, len(scene)) > 0.06:
        return False
    return True


def quality_filter_engine_hook(scene: str):
    """
    TODO(代码方)：调用引擎 radar/checks 对候选段跑分，返回 bool。
    建议指标：infoDensity >= 阈值、碎句率 <= 阈值、无「需回读才懂」标记。
    当前骨架不实现（避免 import .ts / 调 LLM）。
    """
    raise NotImplementedError("接 源码/radar.ts + 源码/checks/ 后实现")


# ---------------------------------------------------------------------------
# 5. 构造 pairs + 导出
# ---------------------------------------------------------------------------
def build_pairs(chapters, book_name):
    """续写型(A)：场景 i 作 assistant，场景 i-1 作 user 上下文。"""
    pairs = []
    flat_scenes = []  # [(chapter_title, scene)]
    for title, body in chapters:
        for sc in split_scenes(body):
            flat_scenes.append((title, sc))

    for idx in range(1, len(flat_scenes)):
        prev_title, prev = flat_scenes[idx - 1]
        cur_title, cur = flat_scenes[idx]
        if not (heuristic_quality_ok(prev) and heuristic_quality_ok(cur)):
            continue
        user = (
            f"【章节】{cur_title}\n【前文】{prev}\n"
            f"【约束】{BOOK_GENRE.get(book_name, 'webnovel')} 向，直白流畅，好懂优先。"
        )
        pairs.append({
            "messages": [
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": user},
                {"role": "assistant", "content": cur},
            ]
        })
    return pairs


def dedupe(pairs):
    seen, out = set(), []
    for p in pairs:
        h = hashlib.md5(p["messages"][2]["content"].encode("utf-8")).hexdigest()
        if h not in seen:
            seen.add(h)
            out.append(p)
    return out


def apply_dense_cap(pairs_by_book):
    """高密度书（原诡秘之主类）限全局占比（防过密样本主导总集）。

    正确语义：高密度书在最终样本集里占比不超过 DENSE_BOOK_CAP_RATIO，
    而不是在本书内部截断。按全局总量算 cap，本书超出部分截断。
    """
    total = sum(len(ps) for ps in pairs_by_book.values())
    cap = int(total * DENSE_BOOK_CAP_RATIO)
    capped, others = [], []
    for book, ps in pairs_by_book.items():
        if BOOK_GENRE.get(book) == "mystery":  # 高密度书
            capped.extend(ps[:cap])
        else:
            others.extend(ps)
    return capped + others


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--corpus-dir", default="./corpus")
    ap.add_argument("--out-dir", default="./finetune_data")
    ap.add_argument("--val-ratio", type=float, default=0.1)
    args = ap.parse_args()

    os.makedirs(args.out_dir, exist_ok=True)
    pairs_by_book = {}
    for entry in sorted(os.listdir(args.corpus_dir)):
        book_dir = os.path.join(args.corpus_dir, entry)
        if not os.path.isdir(book_dir):
            continue
        loaded = load_raw(book_dir)
        if not loaded:
            continue
        book_name, text = loaded
        text = clean_text(text)
        chapters = split_chapters(text)
        pairs = build_pairs(chapters, book_name)
        pairs_by_book[book_name] = pairs
        print(f"[info] {book_name}: {len(chapters)} 章 / {len(pairs)} 候选样本")

    all_pairs = dedupe(apply_dense_cap(pairs_by_book))
    # 9:1 切分
    n_val = int(len(all_pairs) * args.val_ratio)
    val, train = all_pairs[:n_val], all_pairs[n_val:]
    with open(os.path.join(args.out_dir, "train.jsonl"), "w", encoding="utf-8") as f:
        for p in train:
            f.write(json.dumps(p, ensure_ascii=False) + "\n")
    with open(os.path.join(args.out_dir, "val.jsonl"), "w", encoding="utf-8") as f:
        for p in val:
            f.write(json.dumps(p, ensure_ascii=False) + "\n")
    print(f"[done] 总样本 {len(all_pairs)} → train {len(train)} / val {len(val)}")


if __name__ == "__main__":
    main()
