故障检测器的输出要不要信，先审一遍。phifd 是 Node.js 22 的 phi 累积故障检测器（仅 node: 内置模块），自检走 `scripts/check.sh`。项目是 ESM，`package.json` 里没有也不该有 `dependencies`，构建不需要额外步骤。

README 的「对外保证」8 条是这份实现的契约，φ 累积公式与窗口常量都在 README 里写死；`src/phi.mjs` 与 `src/stats.mjs` 里有若干处没有守住。`tests/phi.test.mjs` 当前全绿，但它只走了窗口已满、时间连续递增的常规路径。

任务：通读两个源码文件，把 `REVIEW.md` 里那张结论清单填满 —— 6 处问题各占一行，写清它违反哪一条保证、出在哪个文件的哪个函数、以及一句可判定的证据（别人照你说的输入能看出区别，或者能说出抛出的异常类型）。只审不改。

验收：
- bash scripts/check.sh 退出码 0，8 个场景全过（unmodified 1 + format 1 + finding 6）；
- 源码一个字节都不许改，`check/` 会校验 `src/` 两个文件的 SHA-256。

约束：
1. 只改 `REVIEW.md`；`src/` 与 `tests/` 下的文件一律不动。
2. 不改 `check/`；对外类名、方法名与签名不许改。
3. 只用 `node:` 内置模块，`package.json` 里不许出现 `dependencies`。
4. 证据一列不要写「看起来不对」「可能有风险」这类无法核对的话。