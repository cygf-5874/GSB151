# phifd —— phi 累积故障检测器

`src/phi.mjs` 实现一个 **phi 累积故障检测器**（φ accrual failure detector）：
调用方不断喂入心跳到达时间，需要判断「对端是不是挂了」时就问一次当前怀疑度 φ。
φ 越大越可疑。检测器只用 `node:` 内置模块，没有任何第三方依赖。

```js
import { AccrualDetector } from './src/phi.mjs';

const detector = new AccrualDetector({ window: 8 });
detector.heartbeat(1000).heartbeat(1100).heartbeat(1200);
detector.phi(1200);   // => 怀疑度（非负实数）
```

## φ 累积公式（写死，实现必须逐字照此）

设窗口大小为 `W`（构造时注入，默认 `1000`）。设 `x1..xn` 为**最近至多 W 个到达间隔**
（「到达间隔」= 相邻两次 `heartbeat` 的时间差，按记录顺序）。记 `lastArrival` 为最近一次心跳时间。

- 均值：`mean = (Σ xi) / n`
- 标准差：`std = sqrt( Σ (xi − mean)² / (n − 1) )` —— **样本**标准差，分母是 `n − 1`；
  当 `n < 2` 时 `std = 0`。
- 距上次心跳：`t = now − lastArrival`
- 标准化偏离：`z = (t − mean) / std`（`std` 为 `0` 时取 `z = t − mean`）
- 怀疑度：`φ = log10(1 + e^z)`

据此，`heartbeat` 时间连续时 φ 稳定在低位；对端沉默越久 `t` 越大，φ 单调上升。

## 对外保证（8 条）

1. `heartbeat(now)` 记录一次心跳到达时间；**时间必须单调不减**：`now` 小于上一次记录的
   到达时间时（时间倒流），必须抛出 `PhiError`，且**不得改变内部状态**。
2. `phi(now)` 按上面「φ 累积公式」返回怀疑度；`now` 与所有样本都是**同一时间轴上的
   绝对毫秒值**。
3. 窗口固定为 `W`：超出窗口的样本**必须淘汰**，任何时刻用来计算 φ 的**到达间隔个数不超过 W**。
4. **时间必须注入**：`heartbeat` / `phi` 的计算只能使用调用方传入的 `now` 与已记录的到达时间，
   **不得内部读取 `Date.now()`** 或其他墙钟源。
5. 窗口未满时**按实际样本数计算**（用真实的到达间隔凑足 `n`），**不得用假样本（如 0 填充）凑数**。
6. `phi(now)` **单调不减**：在没有新心跳的情况下，用更大的 `now` 询问，得到的 φ 不小于之前。
7. 同一次调用内部多次求值（同一 tick）不得因为并发调用而互相影响。
8. **纯函数性质**：除 `heartbeat` 会记录样本外，`phi` 不得修改检测器的任何内部状态
   （多次调用的结果只由样本与入参决定）。

## 交付物

`REVIEW.md` 里有一张结论清单表，请把 **6 处**没有守住上述保证的地方填进去（每处一行）。
本次**只审不改**：`src/` 下的两个文件一个字节都不能动，`check/` 会校验它们的 SHA-256。

## 怎么跑

```bash
node --test                      # 既有用例（常规路径，当前全绿）
bash scripts/check.sh            # 固定验收程序；加 -list / --only <组> 可过滤场景
```

`check/` 是固定验收程序，**不要修改**。

## 目录

```
src/phi.mjs         检测器主体（heartbeat / phi / 窗口 / φ 计算）
src/stats.mjs       mean / stddev 统计辅助
tests/phi.test.mjs  既有用例（常规路径，当前全绿）
REVIEW.md           交付物：审查结论表
check/check.mjs     固定验收程序（unmodified 1 + format 1 + finding 6）
scripts/check.sh    自检入口
```

## 环境

Node.js 22（ESM）。`package.json` 里没有 `dependencies`，也不应该有；只用 `node:` 内置模块。