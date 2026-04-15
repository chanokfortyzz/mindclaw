# Mindclaw Dynamic Context Loader 设计稿

> 目标：让 Mindclaw 不再靠一次性静态拼 prompt，而是按任务、预算、阶段动态装载上下文。

---

## 1. 核心目标

当前问题不是“上下文不够多”，而是：
- 经常把不相关内容也塞进去
- 首轮 prompt 负担过重
- 执行过程中无法补载真正需要的上下文
- context 与 task / risk / knowledge 没有统一调度层

因此需要一个统一模块：

**Dynamic Context Loader**

职责：
- 按需加载
- 按预算裁剪
- 按阶段补载
- 按风险切换上下文策略

---

## 2. 建议位置

新增模块：
- `harness/mindclaw/context/context-loader.js`

可选辅助模块：
- `harness/mindclaw/context/relevance.js`
- `harness/mindclaw/context/loaders/knowledge-loader.js`
- `harness/mindclaw/context/loaders/history-loader.js`
- `harness/mindclaw/context/loaders/skill-loader.js`

第一版可先只做一个 `context-loader.js`，别拆太细。

---

## 3. Context 槽位设计

建议统一拆成 6 类：

### 3.1 core
内容：
- SOUL
- 基础系统规则
- 主体身份 / 核心行为约束

特点：
- 几乎每次都要有
- 但按 budget 控制长度

### 3.2 channel
内容：
- 微信/Discord 等渠道风格
- 输出长度限制
- 展示格式偏好

特点：
- 由 channel 自动触发
- 始终是轻量上下文

### 3.3 task
内容：
- 当前 working memory
- 近期任务状态
- 当前目标

特点：
- 强相关
- 优先级高于 history

### 3.4 history
内容：
- success lessons
- failure lessons
- 相似历史任务

特点：
- 按任务相关性加载
- 不应默认全塞

### 3.5 skill
内容：
- candidate skills
- learned skills
- top skill hints

特点：
- 只注入最相关的 1~2 条

### 3.6 knowledge
内容：
- Obsidian 本地知识
- IMA 云端知识库
- 项目文档 / 仓库说明

特点：
- 默认不全量加载
- 只有任务明确需要时才加载

---

## 4. 两阶段加载模型

### 4.1 Phase A：首轮预加载
用户消息进入后：

```text
message
 → intent classify
 → budget check
 → risk check
 → context loader
   → core
   → channel
   → task
   → top history
   → top skill
 → prompt assembler
```

特点：
- 首轮尽量轻
- 先保证方向正确
- 不追求一口气把所有背景塞完

### 4.2 Phase B：执行中补载
当执行中遇到以下情况，再补载：
- 信息不足
- 任务漂移
- 风险提升
- 需要项目资料
- 需要相似失败案例
- 需要某个知识库内容

```text
execution in progress
 → detect insufficient context
 → reload specific context slot
 → continue execution
```

这才是真正的动态上下文。

---

## 5. 触发规则建议

### 5.1 按任务类型触发
- 代码任务 → `task + history + skill + knowledge(project)`
- 存档/笔记任务 → `task + knowledge(obsidian/IMA)`
- 高风险任务 → `task + history(failure) + guard`
- 一般闲聊 → `core + channel + minimal task`

### 5.2 按风险等级触发
- low → 正常加载
- medium → history/guard 权重提高
- high → 强制补 guard / lessons / approval context

### 5.3 按预算等级触发
- safe → 正常
- warning → 压缩 history / skill / knowledge
- critical → 只保留 core + task + top1 lesson
- emergency → 只保留核心约束和当前目标

---

## 6. 最小接口设计

```javascript
class DynamicContextLoader {
  loadInitial(context) {}
  reload(slot, context) {}
  selectRelevantHistory(intent, memory) {}
  selectRelevantKnowledge(intent, sources) {}
  selectSkillHints(intent, skills) {}
  applyBudgetPolicy(bundle, budget) {}
}
```

### 输入建议
```javascript
{
  message,
  channel,
  budget,
  risk,
  workingMemory,
  longTermMemory,
  skillState,
  knowledgeSources,
  agentProfile
}
```

### 输出建议
```javascript
{
  core: [],
  channel: [],
  task: [],
  history: [],
  skill: [],
  knowledge: [],
  debug: {
    selectedSlots: [],
    skippedSlots: [],
    budgetLevel: 'safe'
  }
}
```

---

## 7. 和现有模块的接法

### 可直接复用
- `prompt-assembler`
- `memory-loop`
- `memory-store`
- `skill-router`
- `feature-flags`
- `risk-gate`
- `token budget`

### 接入方式
#### 当前：
`openclaw-hook -> prompt-assembler`

#### 未来：
`openclaw-hook -> context-loader -> prompt-assembler`

即：
- prompt-assembler 只负责组装
- context-loader 负责决定“装什么”

这样职责更清楚。

---

## 8. Feature Flags 建议

建议加：
- `dynamicContextLoader`
- `contextReload`
- `knowledgeOnDemand`
- `historyOnDemand`

这样能：
- 出问题一键关闭
- 渐进上线
- 不影响稳定路径

---

## 9. 第一版实施建议

### 先做 MVP
只做三件事：
1. 首轮按相关性加载 history
2. skill hint 只保留 top1/top2
3. knowledge 改成按需补载，不默认注入

### 暂时不做
- 复杂向量检索
- 多轮自动补载链
- 大规模 knowledge federation

先把“有选择地加载”跑通就行。

---

## 10. 一句话结论

Dynamic Context Loader 不是给 Mindclaw 再加一层复杂度，
而是把现有 memory / skill / knowledge / budget / risk 这些分散能力，
统一成一个真正的：

**按任务、按预算、按阶段动态调度上下文的中间层。**
