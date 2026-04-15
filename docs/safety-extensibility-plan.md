# Harness / Mindclaw 安全增强与可扩展并存方案

> 目标：提高安全性、可控性、可维护性，同时保留自主开发速度与模块扩展能力。
> 原则：不是收死自研模块，而是把“自由扩展”升级成“受控扩展”。

---

## 1. 核心判断

Harness / Mindclaw 是我们自己的模块。
问题不在“自研”本身，问题在于：
- 扩展能力和核心链路耦合过深
- 权限边界不够显式
- 热修补和正式能力混在一起
- 审计、回滚、来源标记还不够强

所以方向不是削弱自研，
而是：

**核心稳定，边缘灵活。**

---

## 2. 总体目标

### 2.1 保留的东西
必须保留：
- Harness 作为自定义 runtime 的能力
- Mindclaw 作为自主演进层的能力
- 本地快速试验能力
- 多模块演进能力
- Prompt / Memory / Skill / Runtime 的自研空间

### 2.2 必须增强的东西
必须增强：
- 安全边界
- 模块权限分级
- feature flags
- trace / 审计
- 热修补回源机制
- 通道健康观测

---

## 3. 架构策略：核心稳定，扩展受控

### 3.1 分三层

#### A. Core Stable Layer
职责：
- gateway 基础链路
- provider route
- token / auth
- channel 基础适配
- risk gate
- trace logger

要求：
- 默认稳定
- 变更频率低
- 不直接承载试验逻辑

#### B. Mindclaw Runtime Layer
职责：
- prompt 组装
- memory policy
- skill routing
- runtime profile
- learning loop

要求：
- 模块化
- 可开关
- 可回滚
- 可观测

#### C. Experimental Edge Layer
职责：
- 新 learning 策略
- 新插件
- 新 skill 生成逻辑
- 新渠道行为试验
- 热修补候选逻辑

要求：
- 默认隔离
- 默认可关闭
- 必须带来源标记
- 必须有过期策略

---

## 4. 五层护栏设计

### 4.1 护栏一：Feature Flags 全面化
所有新增能力都必须 flag 化。

至少包括：
- `skillLearningLite`
- `learnedSkillHints`
- `promptFactInjection`
- `promptLessonInjection`
- `experimentalPlugins`
- `outboundEnhancements`
- `channelBehaviorOverrides`

规则：
- 默认值明确
- 环境变量可控
- trace 中可见当前 flags 快照
- 关闭后必须能退化回稳定路径

### 4.2 护栏二：模块权限分级
不是所有模块都该有同等权力。

建议分级：

#### Low
- prompt 辅助
- trace 增强
- 只读分析

#### Medium
- 单文件写入
- 本地状态持久化
- candidate skill 生成

#### High
- 批量改文件
- 外发消息
- provider/token/route 修改
- 远程执行

规则：
- high 默认需要 guard / approval
- medium 至少 trace + rollback
- low 可默认开放

### 4.3 护栏三：来源标记机制
自研模块不是问题，来源不透明才是问题。

每个扩展都应带：
- `sourceType`: core | mindclaw | experimental | external
- `owner`: 谁维护
- `reviewed`: 是否经过 review
- `riskLevel`: low | medium | high
- `rollback`: 回滚方式

目标：
- 自研也可追溯
- 实验能力不混入正式能力
- 外部插件与内部模块明确分开

### 4.4 护栏四：热修补制度化
热修补可以存在，但不能永久游离。

规则：
- 每个 hotfix 必须有记录
- 必须说明：修什么、影响面、回滚方式
- 必须标记：是否已回源
- 直接改 `dist/` 只能算临时措施
- 超过一个周期未回源的 hotfix 要进清理清单

### 4.5 护栏五：统一观测面
安全不是只靠禁止，而是靠可见。

需要统一观测：
- channel 健康
- provider failover
- token mismatch
- feature flags 状态
- candidate skill 增长速度
- outbound 行为
- hotfix 生效状态

---

## 5. 对当前痛点的具体处理

### 5.1 token mismatch
目标：不能长期带病存在。

动作：
- 单独 trace 字段
- 统计 mismatch 来源（provider / channel / transform）
- 达阈值报警
- 长期不允许靠“看起来还能用”混过去

### 5.2 插件来源不干净
动作：
- 插件清单化
- 标记 owner / source / risk
- 未知来源默认降级或隔离
- 外部插件不得直接进入核心链路

### 5.3 直接改 dist
动作：
- 建立 hotfix ledger
- 把当前已改 dist 先盘点
- 能回源的尽快回源
- 新增规则：不允许长期把 dist 当源码仓

### 5.4 通道健康不一致
动作：
- 给每个 channel 独立健康分
- 低于阈值时禁止继续叠加实验能力
- 微信如果长期 2/5，要先恢复基础链路，再谈新功能

### 5.5 harness 权限面过大
动作：
- 核心入口只保留编排
- 高风险能力走 RiskGate
- outbound 单独纳入 DeliveryPolicy
- learning / experimental 行为必须可 flag 关闭

---

## 6. 推荐落地顺序

### 第 1 步：先补护栏，不先砍功能
优先做：
1. feature flags 补齐
2. source/risk metadata 机制
3. hotfix ledger
4. channel health 观测

### 第 2 步：再做链路收敛
1. hook 继续瘦身
2. high risk 能力强制走 gate
3. experimental 模块与 stable 模块分层

### 第 3 步：再做长期优化
1. token mismatch 治理
2. dist 回源
3. 插件来源整顿
4. 学习闭环升级

## 6.1 补齐 Harness Engineering 缺口

当前 Mindclaw / Harness 已经具备 Harness Engineering 的前半段能力：
- 约束：risk gate / feature flags / budget / channel prepend
- 引导：prompt assembler / SOUL / runtime profile / skill router
- 防漂移：working memory / long-term memory / compression / budget guard

但后半段能力仍不完整，必须明确补齐：

### A. 失败归因（Failure Attribution）
现在能记录 trace，但还不够系统化地区分：
- 是 provider 问题
- 是 channel 问题
- 是 prompt 组装问题
- 是工具调用失败
- 是执行策略错误
- 是 token/context 漂移导致的失误

改进要求：
- trace 中补 `failureType`、`failureLayer`、`failureReason`
- 错误必须能落到 provider / channel / tool / prompt / policy 层级
- 不允许长期停留在“失败了但不知道为什么”

### B. 执行后验证（Post-Execution Verification）
现在 learning 更偏“记录消息/轨迹”，还不够偏执行验证。
Harness Engineering 真正强调的是：
- 动作执行后，判断是否成功
- 成功/失败进入不同后续分支
- 不把普通聊天误当 workflow 成功

改进要求：
- learning 的主要触发点后移到 execution 后
- tool / browser / file / outbound 等动作统一产出 success/failure verdict
- 没有 verdict 的事件，不进入正式学习主链

### C. 错误防复发机制（No-Repeat Policy）
现在已经能生成 candidate skill，但更偏成功经验沉淀。
真正缺的是：
- 某类错误发生后，系统如何阻止它第二次发生
- 失败模式如何固化成 guard / policy / hint

改进要求：
- failure trace 可转化为 guard rule candidate
- 对高频失败生成 `do-not-repeat` 提示或 policy candidate
- 对确定性错误优先固化到 gate / policy，而不是只写进 memory

### D. 学习闭环分流（Success Loop / Failure Loop）
当前 learning 基本围绕重复成功任务生成 candidate。
后续需要显式拆成两条：

1. **Success Loop**
   - 成功任务 → 轨迹聚类 → candidate skill → 复用

2. **Failure Loop**
   - 失败任务 → 归因 → 生成限制/修正建议 → 下次执行前预警

改进要求：
- success 与 failure 不共用一套模糊逻辑
- failure loop 优先进入 guard / hint / approval，而不是直接生成 skill

### E. 统一健康反馈（Runtime Feedback Surface）
Harness Engineering 不是只做一次纠错，而是要让系统长期知道自己哪里不稳。

改进要求：
- 统一输出：channel health / token mismatch / provider failover / failure clusters / candidate growth
- learning、risk、channel、provider 四个面必须能放到同一观测面里
- 没有统一反馈面，就无法证明系统正在“少犯重复错误”

### F. Candidate 治理与晋升机制
现在 candidate skill 是最小可行插入，但还缺治理层。

改进要求：
- candidate 必须有 TTL / 审核 / 清理策略
- candidate 不得无限增长
- candidate → learned 的晋升必须有条件
- learned skill 的失效/降级机制也要定义

### G. 从 Context Engineering 过渡到 Harness Engineering
当前系统并不是没做 Harness，而是处在：
- Context Engineering 已经做得不少
- Harness Engineering 进入前半段
- 后半段（失败闭环、错误防复发、执行后验证）仍需补齐

因此后续方案不应只继续加 prompt / memory / skill，
而应优先补：
1. failure attribution
2. post-execution verification
3. no-repeat policy
4. success/failure loop split
5. candidate governance

### H. Advisor / Executor 双层智能架构（可选演进方向）
参考 Anthropic 的 advisor tool，可为 Mindclaw / Harness 增加“双层智能结构”：

1. **Executor Layer**
   - 负责机械执行
   - 负责工具调用、文件处理、流程推进、代码落地
   - 默认走更便宜、更稳定的执行模型

2. **Advisor Layer**
   - 负责高层规划
   - 负责复杂任务拆解、中途纠偏、风险复核、长流程方向校正
   - 默认走更强、更贵但调用次数更少的模型

该模式适合：
- 长流程 coding / agent 任务
- 高风险改动前复核
- 长任务中途漂移纠偏
- 成本受限但又需要高质量规划的场景

#### 对当前 Mindclaw 的映射
- `openclaw-hook` / `skill-router` / `reporter` / tool chain → 更像 Executor 主链
- `risk-gate` / future failure attribution / future planner → 可演进为 Advisor 触发点

#### 推荐接入点
- 复杂任务进入 Codex 前，先 advisor 产出 plan
- 长流程执行到中段时，advisor 做一次 course correction
- high risk 操作执行前，advisor 做策略级复核
- failure loop 中，由 advisor 把失败归因整理成 policy / hint candidate

#### 安全与治理要求
- advisor 结果不得直接绕过 RiskGate
- advisor 只提供 plan / guidance，不直接拥有高风险执行权
- advisor 调用次数要受 budget / health / feature flags 控制
- 低健康通道默认禁用 advisor 增强

#### 价值
这条路线能让 Mindclaw 不只是“更会拼 prompt”，
而是逐步具备：
- 低成本执行
- 高质量规划
- 中途纠偏
- 更强的长流程稳定性

---

## 7. 关键原则

### 不做的事
- 不把自研模块收死
- 不因为有风险就砍掉扩展能力
- 不把试验速度完全换成官僚流程

### 要做的事
- 让扩展有边界
- 让试验有开关
- 让热修补可追溯
- 让风险动作有门禁
- 让系统状态可见

---

## 8. 一句话结论

Harness / Mindclaw 应继续作为我们的自主 runtime 与演进层存在。
但后续路线不是“继续自由生长”，也不是“彻底收死”。

而是：

**以护栏换可持续，以分层换扩展性，以可见性换安全。**

---

*这份文档是方向性方案，下一步可继续拆成实施清单。*
