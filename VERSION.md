# InkWeave 版本演进记录

| 版本 | 日期 | 变更内容 |
|------|------|----------|
| v1.0 | 2026-Q1 | 初始版本：单体 SKILL.md（23.7KB），含伏笔追踪、审稿检查、技法推荐、全卷检查、重写对比 |
| v3.3 | 2026-Q2 | 模块化拆分：写作工坊/大纲创作院/设定工坊；生成技法激活层（5条技法）；18项检测工具 |
| v3.4 | 2026-Q3 | 打磨升级：铁则注入具体示例；新增规则加载门禁（7项）；语义质量检查（4项） |
| v4.0 | 2026-08 | 认知分离架构：三阶段分离（写前分析→生成→写后检查）；LLM专注写作，检查交给工具 |
| v4.1 | 2026-08-14 | 实战验证修复：3个检测器缺陷修复（不是X是Y白名单/感官密度8x阈值/中文数字锚点）；5个跨章盲区补全（角色登场/情节收束/信息节奏/设定一致性/段落结构）；3个流程风险加固（镜头链门禁/冷却检测强制加载/重写2轮强制报错）；破折号检测升级为error；check-all.ts报告集成盲区结果；P1弱规则补全（铁则七/八、技法四/五 ✔✘示例）；生成指令铁则十二（破折号零容忍）；双轨统一（checkers.ts为唯一共享检测逻辑源）；project_memory清理 |
| v4.2 | 2026-08-14 | P2架构加固：大纲创作院新增5项门禁（冷却检测/伏笔密度/章类型多样性/冲突维度/钩子节奏）；设定工坊新增3项门禁（冷却检测/原创性隔离/可感知性检查）；写前分析新增第4.5步规划自检（场景碎片化+对话过载前移预警） |
| v4.3 | 2026-08-14 | P3长期优化：检测工具CLI编译（tsc→dist/，冷启动<0.5s无需tsx）；旧章26个破折号全部修复（全5章0 error A级）；大纲/设定工坊门禁实战验证通过；tsconfig.json精简（仅编译检测工具）+ 新增@types/node依赖；package.json新增build/dev:双轨脚本 |
| v4.4 | 2026-08-14 | 引擎分发：CLI打包（inkweave.mjs + bin入口 + npm link全局安装）；prebuild钩子（compile-kb自动接入build流水线）；npm run build一键编译（知识库→TS→JS全流程） |
| v4.5 | 2026-08-14 | 自动修复模式：检测工具新增--fix参数，自动替换确定性违规（破折号→逗号）；autoFix函数+修复后重检测闭环；FixResult/FixChange接口定义；大纲创作院5项门禁实战验证通过（verify-gates.ts脚本确认54个冷却模式/7种章类型/6种冲突类型/7种钩子比例与门禁规则一致）；第6章全链路实战验证（写前分析→冷却检测→镜头链→生成→检测→重写，83→98分）；6章全A级，平均96.3，0 error，0破折号，17,494字 |
| v4.5.2 | 2026-08-15 | 引擎预防升级v2（Self-Refine机制）：调研8个开源写作Skill/LibriScribe/Novelist's Atelier/Self-Refine/PromptQuorum/Dredyson，发现第一轮质量低下的根因是生成时无内部质量检查。嵌入Self-Refine到生成指令（场景级自检点+全文自审）；新增质量指纹提取器（extract-fingerprint.ts，从上一章检测报告提取约束注入下一章）；生成指令新增§0.6前章质量警示+§0.7场景自检机制；来源：LibriScribe ContentQualityAgent的Style Constraints注入+Self-Refine的generate→critique→refine循环 |
| v4.5.3 | 2026-08-15 | 引擎预防升级v3（第一轮指纹保存）：v4.5.2单轮Self-Refine验证失败（第11章第一轮45分D级，低于优化前65分平均），确认单轮Self-Refine对LLM无效——LLM不真正暂停回读。真正有效的机制是LibriScribe的ContentQualityAgent：保存第一轮检测报告（--save-fingerprint），用真实问题指纹注入下一章。check-chapter.ts新增--save-fingerprint参数，输出.fingerprint.json（含errors/warnings/infos分类+破折号/不是X是Y/逗号链/字数统计）。修复参数解析bug（break→continue+递减索引）。根因：Self-Refine多轮循环不能压缩到单次生成。 |
| v4.8 | 2026-08-17 | **反向闭环管道 + 风格多样性检测**：**Wave1-A 反向闭环**（pre-analysis.ts injectFingerprint增强——从上一章stylePatterns生成"本章禁忌"硬约束，优先级：排比堆叠>确定违规>其他参考）；**Wave1-B 风格检测**（checkers.ts新增checkStyleStacking——排比堆叠/title_stacking_verb/的密度/title_stacking_name段落开头重复；check-chapter.ts指纹新增stylePatterns字段）；**生成指令**（铁则十六·排比上限 + 铁则十七·的的去重，各含3条✔✘示例）；**闭环验证**（第14章检测到16组74处排比堆叠，成功注入第15章写前分析"本章禁忌"） |
| v4.9 | 2026-08-18 | **反向闭环v2硬约束 + 轻量模式升级**：**#2a 反例/正例**（injectFingerprint 从 rawViolations[].fixes[].before 提取上章原句作反例，新增分镜式正例模板）；**#2b 感官密度进禁忌**（sense_density_balance 从"其他参考"升级为独立🔴硬约束，含正例）；**#2c 合并风格契约**（step0 预设配方 + fingerprint 禁忌合并为单一"第0步：本章风格契约"，消除信号分裂）；**#2d 跨章重复检测**（checkers.ts 新增 crossChapterRepeat，读上章 verbStacking 句式检测本章复发，对话白名单过滤）；**#2e 感官闭环升级**（checkSenseDensityWithPrev：上章感官 error → 本章感官违规 severity 升一级）；**#3 轻量模式**（quick-write.ts 接入 step0StyleRecipe，输出含预设+22节点+多样性指令+3门禁）；**pre-analysis.ts 模块化**（resolveProjectDir/step0StyleRecipe 导出，import 不触发 main()） |

**版本号规范**：
- 入口 SKILL.md 和所有子模块 SKILL.md 必须同步标注版本号
- 升级时先更新 VERSION.md，再同步更新所有 SKILL.md
- 版本号格式：v<主版本>.<次版本>