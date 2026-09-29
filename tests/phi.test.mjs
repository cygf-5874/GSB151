// 既有用例 —— 只覆盖常规路径（窗口已满、时间连续递增）。
// 这些用例当前全绿；本次任务不要求改它们。

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { AccrualDetector, DEFAULT_WINDOW } from '../src/phi.mjs';

test('窗口满时给出有限的非负怀疑度', () => {
  const detector = new AccrualDetector({ window: 4 });
  const base = Date.now();
  for (let i = 0; i <= 4; i += 1) {
    detector.heartbeat(base + i * 100);
  }

  const value = detector.phi(base + 500);
  assert.equal(Number.isFinite(value), true);
  assert.equal(value >= 0, true);
});

test('无心跳期间怀疑度不回落', () => {
  const detector = new AccrualDetector({ window: 4 });
  const base = Date.now();
  for (let i = 0; i <= 4; i += 1) {
    detector.heartbeat(base + i * 100);
  }

  const early = detector.phi(base + 500);
  const late = detector.phi(base + 900);
  assert.equal(late >= early, true);
});

test('默认窗口能承载长序列', () => {
  const detector = new AccrualDetector();
  const base = Date.now();
  for (let i = 0; i < 2000; i += 1) {
    detector.heartbeat(base + i);
  }

  assert.equal(Number.isFinite(detector.phi(base + 2500)), true);
  assert.equal(DEFAULT_WINDOW, 1000);
});