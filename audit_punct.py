# -*- coding: utf-8 -*-
import re, os

FILES = [
    "实战出文/压力测试/玄幻_第01章_金纹觉醒.md",
    "实战出文/压力测试/都市爽文_第01章_神级选择.md",
    "实战出文/压力测试/历史_第01章_穿成大雍县令.md",
    "实战出文/第5章_实战测试.md",
    "实战出文/都市_许照_第01章_v4_卖相重写.md",
    "实战出文/都市_许照_第02章_订书钉.md",
    "实战出文/都市_许照_第03章_一个针眼.md",
    "实战出文/都市_许照_第04章_两年前的针.md",
]

HALF_QUOTE = re.compile(r'["\']')
EMDASH = re.compile(r'\u2014\u2014')
HALF_PUNCT = re.compile(r'[,\.;:!?]')
ELLIPSIS_DOTS = re.compile(r'\.{3,}|\u3002{2,}')
Q_MARKERS = re.compile(r'(吗|呢|何[必不]|怎[么样]|为什么|为何|难道|可否|是否|是不是|对不对|行不行|好不好|哪[里儿]|谁|什[么公麽])')
CJK_PUNCT = '\uff0c\u3002\uff01\uff1f\u3001\uff1b\uff1a\u201c\u201d\u2018\u2019\u2026\u2014'
SPACE_PUNCT = re.compile(r'\s[' + CJK_PUNCT + ']|[' + CJK_PUNCT + r']\s')

def audit(path):
    txt = open(path, encoding='utf-8').read()
    lines = txt.split('\n')
    findings = []
    n_half_q = len(HALF_QUOTE.findall(txt))
    n_emdash = len(EMDASH.findall(txt))
    n_half_p = len(HALF_PUNCT.findall(txt))
    n_ell = len(ELLIPSIS_DOTS.findall(txt))
    fdq = txt.count('\u201c') + txt.count('\u201d')
    fsq = txt.count('\u2018') + txt.count('\u2019')
    for i, line in enumerate(lines, 1):
        s = line.strip()
        if not s or s.startswith('#'):
            continue
        for m in HALF_QUOTE.finditer(line):
            findings.append((i, '半角直引号', line[max(0,m.start()-12):m.start()+12]))
        for m in EMDASH.finditer(line):
            findings.append((i, '破折号', line[max(0,m.start()-12):m.start()+12]))
        for m in HALF_PUNCT.finditer(line):
            findings.append((i, '半角标点', line[max(0,m.start()-10):m.start()+10]))
        for m in ELLIPSIS_DOTS.finditer(line):
            findings.append((i, '点号当省略号', line[max(0,m.start()-8):m.start()+8]))
        for seg in re.split(r'[\u3002\uff01\uff1f]', line):
            seg = seg.strip()
            if not seg:
                continue
            if Q_MARKERS.search(seg) and seg.endswith(('\u3002', '\uff0c', '.')):
                findings.append((i, '疑似该用？', seg[:50]))
    return dict(file=path, n_half_q=n_half_q, n_emdash=n_emdash, n_half_p=n_half_p,
                n_ell=n_ell, fdq_pair='OK' if fdq%2==0 else '奇数(%d)'%fdq,
                fsq_pair='OK' if fsq%2==0 else '奇数(%d)'%fsq,
                findings=findings)

for f in FILES:
    if not os.path.exists(f):
        print('缺失:', f); continue
    r = audit(f)
    print('='*70)
    print('【%s】' % os.path.basename(f))
    print('  半角直引号=%d  破折号=%d  半角标点=%d  点号省略号=%d' % (r['n_half_q'], r['n_emdash'], r['n_half_p'], r['n_ell']))
    print('  全角双引号配对=%s  全角单引号配对=%s' % (r['fdq_pair'], r['fsq_pair']))
    if r['findings']:
        print('  逐处明细(%d):' % len(r['findings']))
        for ln, kind, ctx in r['findings'][:50]:
            print('    L%d [%s] …%s…' % (ln, kind, ctx))
    else:
        print('  逐处明细: 无')
