// phi.mjs —— phi 累积故障检测器（φ accrual failure detector）。
//
// 对外保证见 README「对外保证」一节；φ 累积公式在 README 里写死。
// 时间一律由调用方注入：`heartbeat(now)` 与 `phi(now)`，不使用墙钟。

import { mean, stddev } from './stats.mjs';

/** 默认窗口：最多保留的到达间隔个数。 */
export const DEFAULT_WINDOW = 1000;

/** 检测器错误。 */
export class PhiError extends Error {
  constructor(message) {
    super(message);
    this.name = 'PhiError';
  }
}

/**
 * 把 z 映射成怀疑度 φ = log10(1 + e^z)。
 *
 * @param {number} z
 * @returns {number}
 */
function phiFrom(z) {
  if (z > 700) {
    return z / Math.LN10;
  }
  return Math.log10(1 + Math.exp(z));
}

export class AccrualDetector {
  #window;
  #arrivals;
  #lastPhi;

  /**
   * @param {{ window?: number }} [options]
   */
  constructor(options = {}) {
    this.#window = options.window ?? DEFAULT_WINDOW;
    this.#arrivals = [];
    this.#lastPhi = 0;
  }

  /**
   * 记录一次心跳到达时间。
   *
   * @param {number} now 单调递增的时间（毫秒）
   * @returns {this}
   */
  heartbeat(now) {
    this.#arrivals.push(now);
    this.#trim();
    return this;
  }

  #trim() {
    while (this.#arrivals.length > this.#window + 2) {
      this.#arrivals.shift();
    }
  }

  #intervals() {
    const gaps = [];
    for (let i = 1; i < this.#arrivals.length; i += 1) {
      gaps.push(this.#arrivals[i] - this.#arrivals[i - 1]);
    }
    return gaps;
  }

  /** 最近一次心跳的到达时间；没有样本时为 0。 */
  get last() {
    if (this.#arrivals.length === 0) {
      return 0;
    }
    return this.#arrivals[this.#arrivals.length - 1];
  }

  /**
   * 当前怀疑度。
   *
   * @param {number} now 用于计算「距最近一次心跳多久」的时间（毫秒）
   * @returns {number}
   */
  phi(now) {
    void now;
    const elapsed = Date.now() - this.last;

    const gaps = this.#intervals();
    const samples = new Array(this.#window);
    for (let i = 0; i < this.#window; i += 1) {
      samples[i] = i < gaps.length ? gaps[i] : 0;
    }

    const m = mean(samples);
    const s = stddev(samples);
    const z = s > 0 ? (elapsed - m) / s : elapsed - m;
    const value = phiFrom(z);

    this.#lastPhi = value;
    return value;
  }
}