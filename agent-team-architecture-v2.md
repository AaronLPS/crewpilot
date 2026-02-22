# AI Agent Team 架构设计文档

> 版本: 2.0 | 日期: 2026-02-22
> 基于两轮实验验证 + 架构简化后的最终方案
> 变更: 去除 Agent Teams 依赖，采用纯 tmux + 文件系统架构

---

## 一、架构总览

本架构通过 tmux 实现一个 Team Lead 管理多个独立 Claude Code session 的协作系统。Team Lead 作为 User Proxy 代替人类参与 GSD/Superpowers 的交互式工作流，通过 `tmux capture-pane` 监控 Runner 状态，通过 `tmux send-keys` 回答工作流提出的问题。所有开发执行工作由 Runner 内部的 workflow 机制（GSD/Superpowers 的 sub-agent 系统）完成。

### 核心设计原则

1. **GSD/Superpowers 的 workflow 完全原生运行**，不做任何 prompt hack 或行为覆盖
2. **开发任务由 workflow 内部分配**（GSD/Superpowers 自己的 sub-agent），不由 Team Lead 额外创建
3. **tmux 是唯一的进程管理和通信层**，不依赖 Agent Teams
4. **文件系统是唯一的持久化层**，所有重要信息都有文件备份
5. **所有角色使用 Opus 模型**，质量优先

### 架构图

```
┌──────────────────────────────────────────────────────────────┐
│                         人类用户                              │
│                                                              │
│  交互方式:                                                    │
│  - 直接在 Team Lead 的 tmux pane 中对话                       │
│  - 异步编辑 .team-config/human-inbox.md                       │
└──────────────────────────┬───────────────────────────────────┘
                           │
                           ▼
┌──────────────────────────────────────────────────────────────┐
│                 Team Lead (Opus, tmux pane 0)                │
│                                                              │
│  ┌──────────────┐  ┌───────────────┐  ┌──────────────────┐  │
│  │ 职能1:       │  │ 职能2:        │  │ 职能3:           │  │
│  │ User Proxy   │  │ tmux Manager  │  │ Review &         │  │
│  │              │  │               │  │ Evaluate         │  │
│  │ 理解用户需求  │  │ 启动/监控/    │  │ 从用户角度评估    │  │
│  │ 维护用户画像  │  │ 交互 Runner   │  │ 开发成果          │  │
│  │ 代替用户回答  │  │ sessions      │  │ 驱动迭代循环      │  │
│  └──────────────┘  └───────────────┘  └──────────────────┘  │
│                                                              │
│  通信工具:                                                    │
│  - tmux capture-pane  (读取 Runner 终端内容)                  │
│  - tmux send-keys     (向 Runner 终端注入输入)                │
│  - 文件系统读写        (持久化 + 跨 session 传递)              │
└──────────┬───────────────────────────┬───────────────────────┘
           │                           │
           ▼                           ▼
┌─────────────────────────┐  ┌─────────────────────────┐
│  GSD Runner             │  │  Superpowers Runner     │
│  (tmux pane 1)          │  │  (tmux pane 2, 按需)    │
│                         │  │                         │
│  claude                 │  │  claude                 │
│  --dangerously-skip-    │  │  --dangerously-skip-    │
│  permissions            │  │  permissions            │
│                         │  │                         │
│  执行 GSD 完整工作流:    │  │  执行 Superpowers 工作流:│
│  ┌───────────────────┐  │  │  ┌───────────────────┐  │
│  │ Questioning       │  │  │  │ Brainstorm        │  │
│  │  (Team Lead 通过   │  │  │  │  (Team Lead 通过   │  │
│  │   send-keys 回答)  │  │  │  │   send-keys 回答)  │  │
│  ├───────────────────┤  │  │  ├───────────────────┤  │
│  │ Research          │  │  │  │ Plan              │  │
│  │  → 4x researcher  │  │  │  │  → micro-tasks    │  │
│  │    sub-agents     │  │  │  │    (2-5 min each) │  │
│  ├───────────────────┤  │  │  ├───────────────────┤  │
│  │ Plan              │  │  │  │ Execute           │  │
│  │  → planner +      │  │  │  │  → per-task       │  │
│  │    plan-checker   │  │  │  │    sub-agent +    │  │
│  ├───────────────────┤  │  │  │    two-stage      │  │
│  │ Execute           │  │  │  │    review         │  │
│  │  → per-task       │  │  │  └───────────────────┘  │
│  │    sub-agent      │  │  │                         │
│  │    (fresh 200k    │  │  │  Sub-agents 全部由       │
│  │     context)      │  │  │  Superpowers 内部管理    │
│  ├───────────────────┤  │  │                         │
│  │ Verify            │  │  └─────────────────────────┘
│  │  → goal-backward  │  │
│  │    verification   │  │
│  └───────────────────┘  │
│                         │
│  Sub-agents 全部由       │
│  GSD 内部管理            │
└─────────────────────────┘
```

### 为什么不用 Agent Teams

1. **Permission Gate 死锁**（Round 2 实验发现）: Teammate 调用 AskUserQuestion 时需要 Team Lead 批准，但批准消息只有在 Team Lead turn 结束后才能送达，造成死锁
2. **开发执行不需要 teammates**: GSD/Superpowers 内部的 sub-agent 机制比 Agent Teams teammates 更可靠——有 fresh context、atomic commits、验证步骤等完整的质量保障
3. **架构简洁性**: 纯 tmux 管理避免了 mailbox 异步、permission 系统等 Agent Teams 的复杂性

---

## 二、角色详细定义

### 2.1 Team Lead

**身份**: 人类用户的唯一 AI 对话接口，整个系统的协调中枢。

**运行环境**: Claude Code 主 session，tmux pane 0，Opus 模型。

#### 职能 1: User Proxy (用户代理人 / Digital Twin)

目标: 充分理解并代表目标用户，在开发过程中代替人类做用户层面的决策。

工作内容:
- 跟人类沟通，建立对项目和目标用户的理解
- 通过 spawn research sub-agent 做 web research，调研目标用户群体
- 将调研成果持续迭代写入 `target-user-profile.md`
- 当 GSD/Superpowers Runner 提问时，以用户身份回答（通过 tmux send-keys）
- 从用户角度评估开发成果

自我迭代机制:
- 项目新阶段开始时 → spawn research sub-agent 调研当前阶段相关的用户需求
- 人类给出新反馈时 → 更新 `target-user-profile.md`，版本号递增
- Review 开发成果时 → 如果发现画像不够完整，主动补充调研
- 持久化: 所有积累写入文件，session 重启后从文件恢复

#### 职能 2: tmux Manager (Runner 管理者)

工作内容:
- 通过 tmux 命令启动/监控/关闭 Runner sessions
- 定期轮询 Runner 状态（capture-pane）
- 检测到 AskUserQuestion 时，基于 User Proxy 知识生成回答并通过 send-keys 注入
- 检测到错误或异常时介入处理
- Runner 完成后读取产出文件，决定下一步

#### 职能 3: Review & Evaluate (评审者)

工作内容:
- 从 User Proxy 视角评估开发成果（功能完整性、易用性、性能感知、情感体验）
- 生成结构化评估报告写入 `.team-config/evaluations/`
- 产出改进建议，驱动下一轮迭代
- 判断何时项目阶段完成，可以交付给人类

### 2.2 GSD Runner

**身份**: 执行 GSD spec-driven development 工作流的独立 agent。

**运行环境**: 独立 Claude Code session，tmux split pane，`--dangerously-skip-permissions`，Opus 模型。

**职责**:
- 完全按 GSD 原生设计执行（`/gsd:new-project`、`/gsd:discuss-phase`、`/gsd:plan-phase`、`/gsd:execute-phase`、`/gsd:verify-work` 等）
- Questioning 阶段通过 AskUserQuestion 提问 → Team Lead 通过 send-keys 回答
- Research 阶段自动 spawn 4 个 parallel researcher sub-agents
- Plan 阶段自动 spawn planner + plan-checker sub-agents
- Execute 阶段自动 spawn per-task sub-agents（每个拿到 fresh 200k context）
- Verify 阶段执行 goal-backward verification

**它不负责的事**:
- 不负责理解用户需求（Team Lead 的事，通过 send-keys 传达）
- 不负责评估用户体验（Team Lead 的事）
- 不负责跨工作流协调（Team Lead 的事）

**GSD 内部的 sub-agent 分工**:
- gsd-project-researcher: 调研技术方案
- gsd-research-synthesizer: 综合调研结果
- gsd-roadmapper: 生成路线图
- gsd-planner: 生成执行计划
- gsd-plan-checker: 审查计划质量
- execution sub-agents: 每个 task 一个 fresh agent 执行

**模型配置**: 在 `/gsd:settings` 中将所有阶段（planning、execution、verification）的模型设为 Opus。

### 2.3 Superpowers Runner

**身份**: 执行 Superpowers feature-driven development 工作流的独立 agent。

**运行环境**: 与 GSD Runner 相同。

**职责**:
- Brainstorm 阶段: Socratic 对话挖掘需求 → Team Lead 通过 send-keys 参与
- Plan 阶段: 将工作分解为 micro-tasks（每个 2-5 分钟），含精确的文件路径、代码内容、验证步骤
- Execute 阶段: subagent-driven-development，每个 task dispatch 一个 fresh sub-agent + 两阶段 review（spec compliance + code quality）
- TDD 强制执行（测试先行）

**Superpowers 内部的 sub-agent 分工**:
- brainstorming skill: Socratic 需求提炼
- writing-plans skill: micro-task 规划
- subagent-driven-development skill: 每 task 一个 sub-agent + review
- systematic-debugging skill: 4-phase root cause 分析
- verification-before-completion skill: 完成前验证

---

## 三、通信协议详解

本架构只有三种通信路径，全部基于 tmux 和文件系统。

### 3.1 人类 ↔ Team Lead: 终端直接对话

```
人类在 Team Lead 的 tmux pane 0 中直接输入文字
```

- 延迟: 实时
- 可靠性: 最高
- 适用: 初始需求沟通、方向调整、紧急中断、进度查询

备选异步通道: 人类编辑 `.team-config/human-inbox.md`，Team Lead 在轮询中检查。

### 3.2 Team Lead ↔ Runner: tmux 命令（核心通信机制）

#### 读取 Runner 状态: capture-pane

```bash
tmux capture-pane -t {RUNNER_PANE_ID} -p -S -50
```

- 延迟: 实时
- 可靠性: 高（两轮实验 100% 可靠）
- 用途: 检测 Runner 是否在等待输入、读取问题内容、监控进度、检测错误

识别 Runner 状态的标志:
- **正在处理**: 有 spinner 动画（Proofing, Mustering 等）
- **等待用户输入 (AskUserQuestion)**: 有 tab bar `← ☐ Scope ☐ Storage ✔ Submit →`，编号选项 `❯ 1. Option`，底部提示 `Enter to select · Tab/Arrow keys to navigate`
- **空闲**: 显示 `❯` 输入提示符，无 spinner
- **GSD 阶段标记**: `━━━ GSD ► QUESTIONING ━━━` 等 UI 标志

#### 向 Runner 输入: send-keys

**选择默认选项（选项 1）:**
```bash
tmux send-keys -t {PANE_ID} Enter
```

**选择非默认选项（选项 N）:**
```bash
for i in $(seq 1 $((N-1))); do
    tmux send-keys -t {PANE_ID} Down
    sleep 0.5
done
tmux send-keys -t {PANE_ID} Enter
```
注意: 每次 Down 后必须 sleep 0.5 秒，否则 UI 更新来不及，会选错。

**文本输入（开放式问题）:**
```bash
tmux send-keys -t {PANE_ID} "回答内容" Enter
sleep 1
tmux send-keys -t {PANE_ID} Enter
```
注意: Claude Code 使用多行输入。第一个 Enter 是换行，sleep 后第二个 Enter 才是提交。

- 延迟: 命令即时执行，Runner 空闲等待输入时立刻处理
- 可靠性: 高（实验验证 15/15 成功）
- 关键: 必须确认 Runner 在等待输入状态时才发送

#### 启动 Runner

```bash
# 创建新的 tmux pane
tmux split-window -h

# 获取新 pane 的 ID
PANE_ID=$(tmux display-message -p -t '{last}' '#{pane_id}')

# 进入项目目录
tmux send-keys -t $PANE_ID "cd {project-dir}" Enter
sleep 1

# 启动 Claude Code
tmux send-keys -t $PANE_ID "claude --dangerously-skip-permissions" Enter
sleep 3

# 记录 pane ID
echo $PANE_ID > .team-config/runner-pane-id.txt

# 启动 GSD 工作流
tmux send-keys -t $PANE_ID "/gsd:new-project" Enter
sleep 1
tmux send-keys -t $PANE_ID Enter
```

#### 关闭 Runner

```bash
# 方式 1: 优雅关闭（让 Runner 完成当前工作）
tmux send-keys -t {PANE_ID} "/exit" Enter
sleep 1
tmux send-keys -t {PANE_ID} Enter

# 方式 2: 强制关闭
tmux kill-pane -t {PANE_ID}
```

### 3.3 Runner 产出 ↔ Team Lead 读取: 文件系统

```
GSD Runner 执行 → 自动产出 .planning/ 下的文件
Team Lead 读取这些文件 → 评估 → 决定下一步
```

GSD 原生产出的文件:
- `.planning/PROJECT.md` — 项目定义
- `.planning/REQUIREMENTS.md` — 需求规格
- `.planning/ROADMAP.md` — 路线图和阶段划分
- `.planning/STATE.md` — 当前执行状态
- `.planning/config.json` — GSD 配置
- `.planning/research/*.md` — 调研报告
- `.planning/phases/phase-N/PLAN.md` — 各阶段执行计划

这些文件是 Team Lead 了解 Runner 工作产出的主要来源，也是跨 session 恢复状态的关键依据。

---

## 四、核心工作流程

### 4.1 项目启动流程

```
Step 1: 人类与 Team Lead 沟通
        ├── 描述项目目标
        ├── 描述目标用户
        └── 说明技术偏好和约束

Step 2: Team Lead 建立 User Proxy
        ├── 整理人类输入 → 写入 USER-CONTEXT.md
        ├── Spawn research sub-agent 做用户调研
        │   └── 产出写入 target-user-profile.md
        └── 分析项目现有代码（如果有）→ 写入 project-context.md

Step 3: Team Lead 选择工作流并启动 Runner
        ├── 需要深度规划的项目 → GSD Runner
        ├── 需要 TDD 和结构化开发 → Superpowers Runner
        └── 简单任务 → Team Lead 自己做或 spawn sub-agent

Step 4: Team Lead 进入轮询循环，辅助 Runner 执行
        └── (详见第五节)

Step 5: Runner 完成后，Team Lead 以 User Proxy 视角 Review
        ├── 读取开发成果和 GSD/Superpowers 的验证结果
        ├── 按评估模板从用户角度打分
        ├── 生成 REVIEW-FEEDBACK.md
        └── 决定: 满意 → 通知人类 | 不满意 → 启动下一轮迭代

Step 6: 迭代（如需要）
        ├── 更新 USER-CONTEXT.md（加入 review 发现的新需求）
        ├── 启动新的 Runner session 执行改进
        └── 重复 Step 4-5
```

### 4.2 GSD 工作流中 Team Lead 的具体操作

```
GSD Questioning 阶段:
│
├── Team Lead 轮询 capture-pane
├── 检测到 AskUserQuestion UI
├── 读取问题内容和选项
├── 以 User Proxy 身份判断最佳回答
│   ├── 参考 target-user-profile.md
│   ├── 参考 USER-CONTEXT.md
│   └── 参考 project-context.md
├── 通过 send-keys 注入回答
├── 记录问答到 communication-log.md
└── 继续轮询等待下一个问题

GSD Research 阶段:
│
├── GSD 自动 spawn 4x researcher sub-agents
├── Team Lead 通过 capture-pane 监控进度
├── 无需干预，等待完成
└── 完成后读取 .planning/research/ 下的报告

GSD Plan 阶段:
│
├── GSD 生成 ROADMAP.md 和 PLAN.md
├── 可能有 AskUserQuestion（同样 send-keys 回答）
└── Team Lead 可读取 PLAN.md 了解即将执行的内容

GSD Execute 阶段:
│
├── GSD 自动为每个 task spawn fresh sub-agent
├── 每个 sub-agent 拿到 200k clean context
├── atomic commit（每个 task 完成后立即 commit）
├── Team Lead 通过 capture-pane 监控整体进度
└── 无需干预（除非出错）

GSD Verify 阶段:
│
├── GSD 执行 goal-backward verification
├── Team Lead 读取验证结果
└── Team Lead 补充 User Proxy 视角的评估
```

### 4.3 Superpowers 工作流中 Team Lead 的具体操作

```
Superpowers Brainstorm 阶段:
│
├── Superpowers 发起 Socratic 对话
├── Team Lead 通过 send-keys 参与（同 GSD questioning）
├── 产出: design document
└── Team Lead 记录到 communication-log.md

Superpowers Plan 阶段:
│
├── 自动分解为 micro-tasks（每个 2-5 分钟）
├── 每个 task 含精确的文件路径、代码、验证步骤
└── Team Lead 可读取 plan 了解内容

Superpowers Execute 阶段:
│
├── 每个 task dispatch 一个 fresh sub-agent
├── 两阶段 review: spec compliance → code quality
├── TDD 强制执行（测试先行）
├── Team Lead 通过 capture-pane 监控
└── 无需干预（除非出错）
```

### 4.4 多 Runner 并行场景

当项目需要同时推进多个独立模块时:

```
Team Lead (pane 0)
├── GSD Runner A (pane 1): 开发用户认证模块
└── GSD Runner B (pane 2): 开发数据分析模块

协调方式:
- Team Lead 分别 capture-pane 两个 Runner
- 如果 A 和 B 有接口依赖:
  1. A 完成 API 定义后，产出写入文件
  2. Team Lead 读取文件
  3. Team Lead 通过 send-keys 告知 B 相关接口信息
     或在 B 的 questioning 阶段回答相关问题
```

---

## 五、Team Lead 轮询循环

```
POLLING LOOP (每 5-8 秒一个周期):

┌─ Runner 监控 ────────────────────────────────────────────┐
│                                                          │
│  1. 对每个活跃的 Runner:                                   │
│     tmux capture-pane -t {PANE_ID} -p -S -50              │
│                                                          │
│  2. 分析 Runner 状态:                                     │
│     ├── 有 spinner → Runner 在工作，不干预                │
│     ├── 有 AskUserQuestion UI:                           │
│     │   ├── 读取问题内容                                  │
│     │   ├── 基于 User Proxy 知识生成回答                  │
│     │   ├── send-keys 注入回答                           │
│     │   └── 记录问答到 communication-log.md               │
│     ├── 有错误信息 → 记录，决定是否介入                    │
│     ├── Runner 空闲 → 工作流可能完成，检查产出文件         │
│     └── Runner 停止 → 读取产出，准备 review               │
│                                                          │
└──────────────────────────────────────────────────────────┘

┌─ 人类反馈检查 ───────────────────────────────────────────┐
│                                                          │
│  3. 检查 .team-config/human-inbox.md                      │
│     └── 有新内容 → 处理:                                  │
│         ├── 需求变更 → 更新 USER-CONTEXT.md               │
│         │              → send-keys 通知 Runner（如相关）  │
│         ├── 紧急中断 → 关闭 Runners → 保存状态            │
│         └── 一般反馈 → 记录到 human-directives.md         │
│                                                          │
└──────────────────────────────────────────────────────────┘

┌─ 自我管理 ───────────────────────────────────────────────┐
│                                                          │
│  4. 防御性状态快照                                         │
│     ├── 将当前重要状态写入 state-snapshot.md               │
│     └── 更新 session-recovery.md                          │
│                                                          │
│  5. Context 健康检查                                      │
│     ├── < 50% → 正常继续                                 │
│     ├── 50-70% → 增加写文件频率，准备 /clear              │
│     └── > 70% → 写入完整快照 → /clear → 从文件恢复       │
│                                                          │
│  6. sleep 5（轮询间隔）                                    │
│                                                          │
│  7. 回到步骤 1                                            │
└──────────────────────────────────────────────────────────┘
```

---

## 六、文件系统持久化设计

### 6.1 目录结构

```
{project-root}/
│
├── .team-config/                          # 团队管理（本架构专用）
│   ├── team-lead-persona.md               # Team Lead 行为规则 + User Proxy 定义
│   ├── target-user-profile.md             # 目标用户画像（持续迭代，带版本号）
│   ├── USER-CONTEXT.md                    # 给工作流的用户需求摘要
│   ├── project-context.md                 # 项目背景、架构、当前阶段
│   ├── session-recovery.md                # Session 重启后的恢复指令
│   ├── state-snapshot.md                  # Team Lead 状态快照（防 compaction）
│   ├── communication-log.md               # Team Lead 与 Runner 的问答记录
│   ├── human-inbox.md                     # 人类异步反馈通道
│   ├── human-directives.md                # 人类指示历史记录
│   ├── needs-human-decision.md            # 需要人类亲自决策的问题
│   ├── runner-pane-id.txt                 # 当前 Runner 的 tmux pane ID
│   ├── user-research/                     # Research sub-agent 产出
│   │   └── {date}-{topic}.md
│   ├── evaluations/                       # User Proxy 评估记录
│   │   └── {date}-{phase}.md
│   └── archives/                          # 历史摘要
│       └── {date}-{topic}.md
│
├── .planning/                             # GSD 原生产出（GSD 自动管理）
│   ├── PROJECT.md
│   ├── REQUIREMENTS.md
│   ├── ROADMAP.md
│   ├── STATE.md
│   ├── config.json
│   ├── research/
│   └── phases/
│       └── phase-N/
│           └── PLAN.md
│
├── CLAUDE.md                              # 项目级配置（引用 .team-config/）
│
└── {项目代码文件...}
```

### 6.2 关键文件格式

#### target-user-profile.md

```markdown
# Target User Profile
version: 3
last_updated: 2026-02-22
human_confirmed: true

## Demographics
- age_range: 25-35
- tech_level: non-technical
- primary_device: mobile
- language: zh-CN

## Core Needs (priority ordered)
1. {需求} | priority: critical | source: human-input
2. {需求} | priority: high | source: web-research

## Pain Points
1. {痛点} | severity: high | source: competitor-reviews

## Usage Patterns
- typical_session_duration: 5min
- frequency: daily
- context: commute

## Preferences
- ui_style: minimal
- interaction_model: tap-based

## Anti-Needs (用户明确不需要的)
1. {不需要的功能}

## Research Findings
- [{date}] [{source}] {finding}

## Version History
- v1: 初始版本，基于人类描述
- v2: 加入 web research findings
- v3: 根据人类反馈修正
```

#### session-recovery.md

```markdown
# Session Recovery Instructions

执行以下恢复步骤:
1. 读取 target-user-profile.md → 恢复 User Proxy 人格
2. 读取 state-snapshot.md → 了解中断前的工作状态
3. 读取 .planning/STATE.md → 了解 GSD 进度
4. 检查是否有活跃的 Runner tmux pane
   - 有 → capture-pane 检查状态，继续轮询
   - 无 → 根据 state-snapshot 决定是否需要启动新 Runner
5. 检查 human-inbox.md → 处理人类在离线期间的反馈

## 当前项目阶段: {phase}
## 当前工作流: GSD / Superpowers
## 上次 snapshot 时间: {timestamp}
## 待处理事项:
- [ ] {item}
```

#### communication-log.md

```markdown
# Communication Log

## 2026-02-22 14:05 | GSD Questioning | Phase 1
Q: "What do you want to build?"
A: (User Proxy) "A simple Python CLI todo app..."
Basis: USER-CONTEXT.md section 2.1

## 2026-02-22 14:06 | GSD Questioning | Phase 1
Q: "How should todos persist?"
A: (User Proxy) "Local JSON file, option 1"
Basis: target-user-profile.md, user prefers simplicity
```

---

## 七、Session 恢复机制

### 恢复流程

```
Step 1: 人类启动环境
        $ tmux new-session -s project
        $ cd {project-dir}
        $ claude --resume  (或 claude --continue)

Step 2: Team Lead 恢复（自动或 /restore-team）
        ├── 读取 session-recovery.md → 获取恢复指令
        ├── 读取 target-user-profile.md → 恢复 User Proxy
        ├── 读取 state-snapshot.md → 恢复工作状态
        └── 读取 .planning/STATE.md → 了解 GSD 进度

Step 3: 按需重启 Runner
        ├── 检查是否有存活的 Runner pane
        │   └── tmux list-panes 检查
        ├── 如果 Runner 已关闭且工作未完成:
        │   ├── tmux split-window -h → 启动新 session
        │   ├── 根据 STATE.md 从中断处继续
        │   │   (如 /gsd:plan-phase 3 从 phase 3 继续)
        │   └── 更新 runner-pane-id.txt
        └── 如果工作已完成 → 进入 review 阶段

Step 4: 继续工作
```

### 防御性快照时机

Team Lead 在以下时刻必须写入 state-snapshot.md:
- 每完成一个 GSD/Superpowers phase 转换
- 每回答一组 Runner 的问题后
- Context 使用量超过 50% 时
- 执行 /clear 之前
- 人类请求暂停时
- 检测到 Runner 异常时
- 每 10 分钟定期写入

---

## 八、人类介入机制

### 原则

```
人类 ←→ Team Lead ←→ Runners
         唯一的人机接口
```

人类不直接操作 Runner 的 tmux pane。所有指示通过 Team Lead 传达。

### 介入场景

| 场景 | 人类操作 | Team Lead 响应 |
|------|---------|---------------|
| 新需求/方向变更 | 在 Lead pane 输入 | 更新 USER-CONTEXT.md → 在 Runner 下次提问时体现 |
| 查询进度 | "进展怎么样?" | capture-pane Runner + 读取 STATE.md → 汇报 |
| 不满意成果 | 描述问题 | User Proxy 评估 → 启动新一轮迭代 |
| 紧急中断 | "停下来" | kill Runner panes → 保存状态快照 |
| 异步反馈 | 编辑 human-inbox.md | 下次轮询时处理 |
| 超出 AI 决策的问题 | Team Lead 写入 needs-human-decision.md | 人类回答后 Team Lead 在下次 send-keys 时体现 |

---

## 九、Context 管理策略

### 各角色 Context 负担

| 角色 | Context 负担 | 原因 |
|------|-------------|------|
| Team Lead | 中等 | 轮询 + capture-pane 分析 + 生成回答 |
| GSD Runner | 低 | 只跑 GSD，繁重工作交给内部 sub-agents |
| Superpowers Runner | 低 | 同上 |
| Runner 的 sub-agents | 最低 | 每个都是 fresh 200k context |

### Team Lead 的 Context 控制

**分阶段执行，阶段之间 /clear:**

```
阶段 1 → User Proxy 初始化（跟人类沟通 + 用户调研）
  产出写入文件 → /clear

阶段 2 → 启动 Runner + 轮询监控 + 回答问题
  关键问答写入 communication-log.md
  → context 超过 50% 时写入快照 → /clear → 从文件恢复继续轮询

阶段 3 → Review 评估
  评估结果写入 evaluations/ → /clear

阶段 4 → 迭代决策 + 启动新一轮 Runner
  → 回到阶段 2
```

**每次 /clear 前的必做动作:**
1. 写入 state-snapshot.md
2. 写入 communication-log.md（如有新的问答）
3. 更新 session-recovery.md
4. 确认 runner-pane-id.txt 是最新的

---

## 十、本架构的核心价值

### 与默认 GSD/Superpowers 的对比

| 维度 | 默认工作流 | 本架构 |
|------|-----------|--------|
| 人类参与度 | 每个问题都需要人类回答 | 初始设定后 AI 自主回答 |
| 多轮迭代 | 人类是瓶颈 | Team Lead 自主驱动迭代 |
| 用户视角评估 | 无（只有技术验证） | User Proxy 做用户体验评估 |
| 跨 Session 连续性 | 弱 | 用户画像+决策记录持续积累 |
| 工作流灵活性 | 单一 | 按需选择 GSD/Superpowers |
| 工作流完整性 | 完整 | 完整（不修改任何源码） |
| 架构复杂度 | 低 | 中等（增加了 tmux 管理层） |

核心价值: 在 GSD/Superpowers 之上增加了一个 **AI 产品经理层（User Proxy）**，使开发流程从 "AI 等人类做每个决策" 变为 "AI 自主推进，人类做战略级监督"。

适用场景:
- 项目足够大，需要多轮迭代
- 人类不能一直盯着电脑
- 用户体验很重要，需要用户角度的评估
- 项目持续时间长，跨 session 的知识积累有价值

---

## 十一、实验验证结果

### Round 1: Mailbox + Skill 注入方式验证

| 测试项 | 结果 |
|-------|------|
| GSD Skill 以 in-process 方式注入 agent context | ✅ |
| Agent 在工作流中保留全部工具访问权限 | ✅ |
| Mailbox 消息可靠送达（顺序正确、内容完整） | ✅ |
| Mailbox 实时性 | ❌ 批量送达，不实时 |
| tmux capture-pane 读取终端 | ✅ |

### Round 2: tmux send-keys 交互验证

| 测试项 | 结果 |
|-------|------|
| Teammate 的 AskUserQuestion 正常工作 | ❌ Permission Gate 死锁 |
| 独立 Session 的 AskUserQuestion 正常工作 | ✅ |
| tmux send-keys 回答选择题 | ✅ 15/15 成功 |
| tmux send-keys 回答开放题（double Enter） | ✅ |
| tmux send-keys 选非默认选项（加 delay） | ✅ |
| GSD 全流程通过 send-keys 驱动 | ✅ 完成到 research 阶段 |
| AskUserQuestion 等待状态可检测 | ✅ UI 标记清晰 |

### 关键架构决策的实验依据

| 决策 | 实验依据 |
|------|---------|
| Runner 用独立 session 而非 Agent Teams teammate | Round 2: Permission Gate 死锁 |
| 用 tmux send-keys 回答问题 | Round 2: 15/15 成功 |
| 用 tmux capture-pane 监控 Runner | Round 1+2: 100% 可靠 |
| 不修改 GSD/Superpowers 源码 | Round 2: 原生工作流可被 tmux 完整驱动 |
| 不需要 Agent Teams | 开发执行由 workflow 内部 sub-agent 完成 |

---

## 十二、已知限制与风险

| 限制 | 影响 | 缓解措施 |
|------|------|---------|
| tmux send-keys 选项导航需要 0.5s delay | 不加 delay 可能选错 | 每次 Down 后 sleep 0.5 |
| Claude Code 文本输入需要 double Enter | 单次 Enter 只换行不提交 | send-keys + sleep 1 + send-keys Enter |
| Team Lead context 会膨胀 | 长时间轮询后质量下降 | 分阶段 /clear + 文件恢复 |
| Runner session 无法跨重启保持 | 重启后 Runner 丢失 | 文件系统持久化 + 恢复机制 |
| Runner 和 Team Lead 在同一台机器 | 计算资源竞争 | Opus 模型对资源要求高，注意并行数量 |
| GSD/Superpowers 版本更新可能改变 UI | capture-pane 的解析逻辑可能失效 | 关注更新，适配 UI 变化 |
| User Proxy 的回答质量依赖用户画像质量 | 画像不准会导致错误决策 | 人类定期审查 target-user-profile.md |
