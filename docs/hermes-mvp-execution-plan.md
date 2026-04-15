# Mindclaw × Hermes 融合执行建议（MVP 裁剪版）

## 1. 目标
别一口吃胖。
先用最小代价，把最值钱的能力补上。

目标不是“像 Hermes”。
目标是：**Mindclaw 先变得更会记、更会学、更不容易炸。**

---

## 2. 为什么要裁
完整版方案大概 **19.5 人天**。
这对当前阶段太重。

而且大改 Gateway 这种事，
收益不差，
但最容易把系统改乱。

所以 MVP 只做三件事：
1. 分层记忆
2. 技能学习最小闭环
3. 性能护栏 + feature flags

这三件做完，
系统已经会明显变聪明。
而且风险还能控住。

---

## 3. MVP 范围

### 3.1 必做

#### A. Memory Store V2
做：
- `facts.jsonl`
- `execution.jsonl`
- working memory 继续保留
- prompt 按需注入 facts / lessons

不做：
- FTS5
- 向量检索
- 复杂 user model

#### B. Skill Learning Lite
做：
- 记录 execution trace
- 相似任务分桶
- 达到 3 次成功后生成 candidate skill
- **只提示，不自动启用**

不做：
- 自动优化 skill 内容
- embedding 相似度
- 自动合并复杂工作流

#### C. Performance Guardrails
做：
- prompt budget policy
- query cache
- feature flags
- learned skill 禁止高风险自动执行

不做：
- 大规模 profiling 平台
- 分布式缓存
- 复杂异步队列系统

---

## 4. 明确不进 MVP 的东西

这些先别碰：

### 4.1 统一 Gateway
原因：
- 改动面太大
- 容易影响现有渠道稳定性
- 当前收益不如 memory / learning 直接

### 4.2 内置 Scheduler
原因：
- 不如记忆和学习基础设施紧急
- 现在外部 cron 先顶着能用

### 4.3 skills.io 全量兼容
原因：
- 生态价值大于短期价值
- 现在先把本地 learned skill 跑通更重要

---

## 5. MVP 架构

```text
用户消息
  ↓
openclaw-hook
  ↓
prompt-assembler
  ├─ 读取 working memory
  ├─ 读取 relevant facts
  ├─ 读取 relevant lessons
  └─ 注入 top candidate skill hint
  ↓
模型响应
  ↓
memory-loop / memory-store
  ├─ 写 facts
  ├─ 写 execution
  └─ 记录 trace
  ↓
skill-learning-lite
  ├─ intent 分桶
  ├─ 统计重复成功任务
  └─ 生成 candidate
```

关键点：
**不改总线。**
**不换框架。**
**只给现在的 Mindclaw 补脑子。**

---

## 6. 实施顺序

### Step 1：先上 Feature Flags
先把开关铺好。
这样后面任何一步翻车都能秒关。

建议：
```javascript
const featureFlags = {
  memoryStoreV2: true,
  skillLearningLite: false,
  promptFactInjection: true,
  promptLessonInjection: true,
  learnedSkillHints: false
};
```

### Step 2：做 Memory Store V2
先把 facts / execution 记下来。
没有这个，后面的学习就是空谈。

### Step 3：接 Prompt 读取
把相关 facts / lessons 注进去。
先少量注。
别一下塞满。

### Step 4：做 Skill Learning Lite
只做候选技能生成。
别自动应用。
先观察质量。

### Step 5：加性能护栏
把预算、缓存、阈值拉起来。
防止系统开始学了之后越学越臃肿。

---

## 7. MVP 工期

| 模块 | 人天 |
|------|------|
| Feature Flags | 0.5 |
| Memory Store V2 | 3 |
| Prompt 集成 | 1 |
| Skill Learning Lite | 2.5 |
| 性能护栏 | 1.5 |
| 测试 / 回归 | 1.5 |
| **总计** | **10 人天左右** |

如果再狠一点压缩：

### 超轻 MVP
只做：
- Memory Store V2
- Prompt 注入 facts
- Feature Flags

那就是 **4~5 人天**。

收益：
- 系统开始“记住事”
- 但还不会正式“学技能”

---

## 8. 验收标准（MVP版）

### 必须达到
1. 用户明确说过的偏好，下次能记住
2. 重复执行过的流程，能形成 candidate skill
3. prompt 构建时间没有明显变慢
4. 任何新功能都能一键关闭

### 不强求
1. 自动跨平台同步
2. 自动定时任务
3. 社区技能互通
4. 高级用户建模

---

## 9. 我建议的真实落地顺序

最稳的版本：

### 第 1 周
- feature flags
- memory store v2
- facts 注入 prompt

### 第 2 周
- execution 记录
- skill learning lite
- candidate skill 提示
- 回归测试

就两周。
别再加戏。
做完先用。

如果跑稳了，
再讨论：
- scheduler
- gateway 统一
- skills.io

---

## 10. 最终建议

**现在别碰大总线。**

先做：
- 记忆分层
- 技能学习 lite
- 性能护栏

这套做完，
Mindclaw 就已经不是“静态 prompt 拼装器”了。
而是开始变成一个：
**会积累经验的运行时。**

这才是最值钱的那一步。

---

*这是建议执行版，不是完整蓝图版。优先拿它落地。*
