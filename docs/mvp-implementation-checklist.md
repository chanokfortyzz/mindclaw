# Mindclaw MVP 实施任务拆解清单（给 Codex）

> 目标：按工程规范落地 MVP，不改总线，不做大爆炸替换。
> 约束：遵守 Mindclaw Engineering Guardrails v1 / Naming Spec v1 / Runtime Convergence Checklist v1

---

## 0. 总原则

### 必须遵守
1. **主 hook 不膨胀**：`openclaw-hook.js` 只做入口 / 编排 / 兼容
2. **一次只切一根线**：每次 PR 只接一个模块
3. **先 trace 再上线**：新增能力必须先有观测字段
4. **全部可回退**：每个模块有 feature flag
5. **不搞补丁命名**：禁止 `v2/final/fix-new/hook2`

### 本轮不允许碰
- 统一 Gateway
- Scheduler
- skills.io 全量兼容
- 高风险动作自动化

---

## 1. 推荐 PR 顺序

### PR-1：Feature Flags 基础层
**目标**：先铺回退开关。

**涉及文件**
- 新增：`harness/mindclaw/runtime/feature-flags.js`
- 小改：`harness/openclaw-hook.js`
- 小改：`harness/mindclaw/prompt/prompt-assembler.js`

**要做的事**
- 定义 flags：
  - `memoryStoreV2`
  - `promptFactInjection`
  - `promptLessonInjection`
  - `skillLearningLite`
  - `learnedSkillHints`
- 主 hook 只读取 flag，不写复杂逻辑
- trace 增加 flag 快照字段

**验收**
- flags 默认值可控
- 关闭 flags 后行为与当前一致

**回滚**
- 直接关闭 flags

---

### PR-2：Memory Store 基础层
**目标**：新增持久化 facts / execution 存储，不影响现有 working memory。

**涉及文件**
- 新增：`harness/mindclaw/memory/memory-store.js`
- 小改：`harness/mindclaw/memory/memory-loop.js`
- 新增状态文件职责文档引用：
  - `memory/facts.jsonl`
  - `memory/execution.jsonl`

**要做的事**
- `MemoryStore` 提供：
  - `writeFact()`
  - `writeExecution()`
  - `queryFacts()`
  - `queryExecutions()`
- 写入失败不能打崩主流程
- 先用简单 JSONL + 关键词检索
- `memory-loop.js` 保持兼容壳层，只加调用

**验收**
- facts / execution 能写入
- 读写失败时主流程不崩
- working memory 不受影响

**回滚**
- 关闭 `memoryStoreV2`
- 忽略新文件读取

---

### PR-3：Prompt 注入 Facts / Lessons
**目标**：让 prompt 真正用上新记忆，但严格控预算。

**涉及文件**
- 小改：`harness/mindclaw/prompt/prompt-assembler.js`
- 可能新增：`harness/mindclaw/prompt/budget-policy.js`（如果想收敛职责）

**要做的事**
- PromptAssembler 通过 wrapper 读取 `MemoryStore`
- 注入：
  - top facts
  - top lessons
- 加 budget policy：safe/warning/critical/emergency
- 微信渠道更严格压缩
- trace 输出：
  - `factCount`
  - `lessonCount`
  - `promptTokens`（估算即可）

**验收**
- prompt 有相关 facts / lessons 注入
- token 不明显膨胀
- 关闭 `promptFactInjection` / `promptLessonInjection` 可恢复旧行为

**回滚**
- 关闭 prompt 注入 flags

---

### PR-4：Skill Learning Lite 基础层
**目标**：只记录 trace 和生成 candidate，不自动应用。

**涉及文件**
- 新增：`harness/mindclaw/skills/skill-learning.js`
- 小改：`harness/mindclaw/skills/skill-router.js`
- 新增目录：`skills/candidates/`

**要做的事**
- `SkillLearner` 提供：
  - `recordTrace()`
  - `findSimilarTraces()`
  - `generateCandidate()`
- 采用 intent bucket + 工具签名分桶
- 阈值：至少 3 次成功任务才生成 candidate
- candidate 落盘，不自动生效
- trace 增加：
  - `candidateGenerated`
  - `candidateId`

**验收**
- 类似任务重复后能生成 candidate skill
- 不影响 builtin skill 路由
- 不自动执行 learned skill

**回滚**
- 关闭 `skillLearningLite`
- 停止生成 candidate

---

### PR-5：Learned Skill Hint 注入
**目标**：在 prompt 里轻量提示 top candidate/learned skill。

**涉及文件**
- 小改：`harness/mindclaw/prompt/prompt-assembler.js`
- 小改：`harness/mindclaw/skills/skill-router.js`

**要做的事**
- 只注入 top1 / top2
- 只做 hint，不自动调用高风险流程
- learned / candidate 要区分展示
- 微信渠道里保持极简

**验收**
- prompt 中能看到 candidate skill hint
- 关闭 `learnedSkillHints` 后恢复旧行为

**回滚**
- 关闭 `learnedSkillHints`

---

### PR-6：性能护栏与清理
**目标**：给前面所有新增能力装刹车。

**涉及文件**
- 新增：`harness/mindclaw/runtime/query-cache.js`
- 小改：`harness/mindclaw/prompt/prompt-assembler.js`
- 小改：`harness/mindclaw/memory/memory-store.js`
- 小改：`harness/openclaw-hook.js`（仅编排接线）

**要做的事**
- 高频查询缓存
- execution/facts 保留策略
- trace 补完整
- 清理多余内联逻辑，但不搞大删改

**验收**
- prompt 构建耗时、memory 查询耗时可观测
- 功能开关可单独关闭
- 无明显线上行为偏移

**回滚**
- 关闭相关 flags
- 缓存模块可直接旁路

---

## 2. 文件级职责边界

### `openclaw-hook.js`
只允许保留：
- fetch 拦截入口
- runtime context 收集
- 模块实例化
- trace 接线
- 向后兼容 glue code

禁止继续塞：
- 复杂 memory 逻辑
- 候选技能生成算法
- budget 细则
- 缓存实现

### `memory-store.js`
职责：
- facts / execution 持久化
- 简单查询
- 写失败降级

失败退化：
- 只保留 working memory

### `skill-learning.js`
职责：
- execution trace 学习
- candidate 生成
- 不负责最终执行

失败退化：
- skill learning 关闭，skill-router 仍正常

### `prompt-assembler.js`
职责：
- soul + channel + runtime profile + selected memory/skills 注入
- 严格遵守 budget policy

失败退化：
- 降回基础 soul + channel prepend

---

## 3. Trace 字段要求

新增能力必须至少补这些字段：
- `featureFlags`
- `factCount`
- `lessonCount`
- `candidateGenerated`
- `candidateId`
- `promptTokens`
- `memoryStoreEnabled`
- `skillLearningEnabled`

没有 trace，别上线。

---

## 4. Codex 开发约束

给 Codex 的要求：
1. **一次只做一个 PR 范围**
2. **每次先列改动文件清单再改**
3. **每次改完要给回滚点**
4. **禁止顺手重构无关代码**
5. **禁止把新逻辑继续堆进 `openclaw-hook.js`**
6. **文档同步：Obsidian + docs 各补一份**

建议 Codex 每次提交格式：
- 本次目标
- 改动文件
- 新增 trace
- feature flag
- 回滚方式
- 风险说明

---

## 5. 实施顺序建议（最稳）

### 第 1 周
- PR-1 flags
- PR-2 memory store
- PR-3 prompt facts/lessons

### 第 2 周
- PR-4 skill learning lite
- PR-5 learned skill hints
- PR-6 performance guardrails

---

## 6. 最终建议

让 Codex 干 implementation。
你盯住这几条：
- 有没有守住模块边界
- 有没有继续把逻辑塞回 hook
- 有没有 trace
- 有没有回滚点

只要这几条守住，
这轮就不容易改炸。

---

*本清单用于开发协作，不是架构蓝图。执行时按 PR 粒度推进。*
