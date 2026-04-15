# Harness / Mindclaw 安全增强实施清单

> 用途：把《Harness / Mindclaw 安全增强与可扩展并存方案》落成可执行任务。
> 原则：不收死自研能力，只给扩展加护栏。

---

## 0. 执行总原则

1. **不砍扩展性，只补护栏**
2. **主 hook 不继续膨胀**
3. **一次只切一根线**
4. **高风险能力必须可关闭**
5. **所有新增护栏都要有 trace**
6. **实验能力与稳定能力分层**

---

## 1. P0：立刻做的安全护栏

### P0-1 Feature Flags 补齐
**目标**：所有实验/高风险能力可一键关闭。

#### 任务
- [ ] 补齐 flags 清单
- [ ] 统一读取入口 `runtime/feature-flags.js`
- [ ] trace 输出 `featureFlags` 快照
- [ ] 给每个 flag 标默认值和回滚说明

#### 最少应覆盖
- [ ] `skillLearningLite`
- [ ] `learnedSkillHints`
- [ ] `promptFactInjection`
- [ ] `promptLessonInjection`
- [ ] `experimentalPlugins`
- [ ] `outboundEnhancements`
- [ ] `channelBehaviorOverrides`

#### 验收
- [ ] 任一能力关闭后，主流程能正常退化
- [ ] trace 可看到当前 flags

---

### P0-2 Source / Risk Metadata
**目标**：每个模块、插件、热修补都知道“是谁、风险多大、怎么回滚”。

#### 任务
- [ ] 定义 metadata 格式
- [ ] 给核心自研模块补 sourceType / owner / riskLevel
- [ ] 给插件补 reviewed / rollback 字段
- [ ] experimental 模块单独标记

#### 建议格式
```json
{
  "sourceType": "core|mindclaw|experimental|external",
  "owner": "sage",
  "reviewed": true,
  "riskLevel": "low|medium|high",
  "rollback": "env flag / revert patch / disable plugin"
}
```

#### 验收
- [ ] 核心模块可追溯
- [ ] 外部插件与内部模块可区分

---

### P0-3 Hotfix Ledger
**目标**：热修补可追溯，不再长期漂浮。

#### 任务
- [ ] 新建 `docs/Hotfix-Ledger.md`
- [ ] 盘点当前直接改过的 `dist/` 文件
- [ ] 每个 hotfix 记录：原因、影响面、回滚方式、是否回源
- [ ] 新增规则：未来热修补必须登记

#### 每条记录至少要有
- [ ] patch 位置
- [ ] patch 原因
- [ ] patch 时间
- [ ] patch owner
- [ ] rollback 方法
- [ ] upstream/backport 状态

#### 验收
- [ ] 当前已知热修补有账可查

---

### P0-4 Channel Health 统一观测
**目标**：微信 2/5 这种信号不能只停留在感知层。

#### 任务
- [ ] 定义 channel health score 结构
- [ ] 为 weixin / discord / telegram 统一健康指标
- [ ] trace / report 输出 channel health
- [ ] 低健康通道默认禁用实验能力

#### 指标建议
- [ ] message success rate
- [ ] delay / timeout
- [ ] token mismatch count
- [ ] channel auth / session stability

#### 验收
- [ ] health 可见
- [ ] 低健康通道有自动降级策略

---

## 2. P1：两周内完成的治理项

### P1-1 Token Mismatch 治理
**目标**：token mismatch 不再长期带病存在。

#### 任务
- [ ] 在 trace 中单独输出 mismatch 字段
- [ ] 记录 mismatch 来源（provider / channel / transform）
- [ ] 加阈值统计
- [ ] 给出告警门槛

#### 验收
- [ ] 能回答 mismatch 来自哪层
- [ ] 能看到趋势，不靠猜

---

### P1-2 高风险能力统一过 Gate
**目标**：扩展可做，但高风险动作必须有门禁。

#### 任务
- [ ] 明确高风险动作列表
- [ ] outbound 接 `DeliveryPolicy`
- [ ] file write / batch edit 接 `RiskGate`
- [ ] provider/token 修改类操作单独归类 high

#### 验收
- [ ] high risk 动作不再裸跑
- [ ] trace 中能看到 gate 决策

---

### P1-3 Experimental Layer 分层
**目标**：实验逻辑不污染稳定主链路。

#### 任务
- [ ] 规划 `experimental/` 或等价目录
- [ ] 把实验 learning / prompt 策略单独归档
- [ ] stable 模块只接稳定接口，不直接依赖试验实现

#### 验收
- [ ] 实验能力可整体关闭
- [ ] 核心链路不依赖实验代码存活

---

## 3. P2：后续持续项

### P2-1 Dist 回源机制
#### 任务
- [ ] 能回源的 patch 尽快回源到真实源码
- [ ] 不再把 `dist/` 作为长期维护面
- [ ] 新 patch 默认先改源码层，再产物构建

### P2-2 插件来源清理
#### 任务
- [ ] 未知来源插件列清单
- [ ] 分级：保留 / 隔离 / 下线
- [ ] 外部插件默认不进核心链路

### P2-3 Learning Loop 升级
#### 任务
- [ ] 从“最小候选技能”进化到“执行后验证”
- [ ] candidate 增加人工确认 / 清理策略
- [ ] 建立 candidate 增长观察面

---

## 4. 文件级建议

### 推荐新增文档
- [ ] `docs/Hotfix-Ledger.md`
- [ ] `docs/Plugin-Source-Registry.md`
- [ ] `docs/Channel-Health-Spec.md`
- [ ] `docs/Token-Mismatch-Tracking.md`

### 推荐新增模块
- [ ] `runtime/feature-flags.js`（继续扩展）
- [ ] `monitoring/channel-health.js`
- [ ] `monitoring/token-mismatch-tracker.js`
- [ ] `runtime/source-metadata.js`

---

## 5. 给 Codex 的执行顺序

### 第 1 批
1. flags 补齐
2. hotfix ledger
3. source/risk metadata

### 第 2 批
4. channel health 统一观测
5. token mismatch 跟踪
6. high risk gate 接线

### 第 3 批
7. experimental 分层
8. dist 回源
9. 插件来源清理

---

## 6. 验收标准

### 说明已经变安全了，不靠感觉，要靠这几条：
- [ ] 实验能力可关闭
- [ ] 高风险能力有 gate
- [ ] 热修补有账
- [ ] 来源可追溯
- [ ] 通道健康可见
- [ ] token mismatch 可定位
- [ ] 低健康通道自动降级

---

## 7. 一句话结论

这不是“把 harness / mindclaw 收死”的清单。
这是让它们继续能长、但不会越长越危险的清单。

**扩展性保留，风险面收口，状态可见，回退真实。**
