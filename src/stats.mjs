// stats.mjs —— φ 累积检测器使用的统计辅助函数。

/**
 * 算术平均。
 *
 * @param {number[]} values
 * @returns {number}
 */
export function mean(values) {
  if (values.length === 0) {
    return 0;
  }
  let sum = 0;
  for (const value of values) {
    sum += value;
  }
  return sum / values.length;
}

/**
 * 标准差。
 *
 * @param {number[]} values
 * @returns {number}
 */
export function stddev(values) {
  if (values.length < 2) {
    return 0;
  }
  const m = mean(values);
  let acc = 0;
  for (const value of values) {
    acc += (value - m) * (value - m);
  }
  return Math.sqrt(acc / values.length);
}