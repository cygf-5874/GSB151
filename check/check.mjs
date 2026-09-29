// GSB151 phifd 固定验收程序（固定件）。**别改这个文件。**
//
// 用法：
//   node check/check.mjs                   跑全部场景
//   node check/check.mjs -list             列出全部场景
//   node check/check.mjs --only finding    只跑某一组（unmodified / format / finding，可逗号分隔）
//
// 三组共 8 个场景：
//   unmodified 1 —— src/phi.mjs 与 src/stats.mjs 的 SHA-256 与基线一致（源码一个字节都没改）；
//   format     1 —— REVIEW.md 存在，四列表头齐全，结论清单恰好 6 行（D1..D6），且不出现无法核对的措辞；
//   finding    6 —— D1..D6 每行命中允许的「违反保证」编号、指向允许的「文件::函数」、证据可判定。
//
// 本文件只校验 `REVIEW.md` 的**交付格式与结论自洽**以及被审源码的完整性（SHA-256 基线）；
// 结论「是否正确」由人按 README「对外保证」逐条复核。
//
// 判据全程确定性：只读文件、比对 SHA-256 与固定词表，不依赖墙钟 / 机器速度 / 哈希顺序。

import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// 「不许被改」的源码文件 SHA-256 基线（先去掉 \r，与换行风格无关）。
const BASELINE = {
  'src/phi.mjs': '8ad6b1796182bb78b3a2a3941c2af1ae28e091d397381c2b3cf55dfcbe653796',
  'src/stats.mjs': 'ab27582343e3cbd57ad0dae40406f867ddeacbf10b085f7935da4852430da2eb',
};

const REQUIRED_COLUMNS = ['编号', '违反保证', '文件::函数', '可判定证据'];

// 「无法核对」的措辞：证据一列不许出现这些。
const BANNED_WORDS = [
  '可能有风险', '建议关注', '看起来', '或许', '也许', '大概', '疑似',
  '需要注意', '可能存在问题', '有待', '不太对', '可能有问题', '最好', '???',
];

const PLACEHOLDERS = ['TODO', '待补', '待定', '……', '...'];

// 每个缺陷一行：允许命中的「违反保证」编号、允许指向的文件 / 函数、证据里应有的话题词。
const FINDINGS = [
  {
    id: 'D1',
    guarantees: [3],
    files: ['phi.mjs'],
    fns: ['trim', 'heartbeat', 'AccrualDetector'],
    keywords: ['窗口', 'W', '淘汰', '端点', '多留', '样本', '间隔', 'shift', 'length', '超出', '+ 2', '+2'],
  },
  {
    id: 'D2',
    guarantees: [5],
    files: ['phi.mjs'],
    fns: ['phi'],
    keywords: ['未满', '填充', '补零', '假样本', '0', '凑', '实际', '样本数', '虚高', 'new Array', 'samples'],
  },
  {
    id: 'D3',
    guarantees: [4],
    files: ['phi.mjs'],
    fns: ['phi', 'heartbeat'],
    keywords: ['Date.now', '墙钟', '注入', '忽略', 'now', '时间', '参数', 'elapsed'],
  },
  {
    id: 'D4',
    guarantees: [2],
    files: ['stats.mjs'],
    fns: ['stddev'],
    keywords: ['n-1', 'n − 1', 'n - 1', '分母', '总体', '样本', '方差', '标准差', 'values.length', 'mean'],
  },
  {
    id: 'D5',
    guarantees: [8, 7],
    files: ['phi.mjs'],
    fns: ['phi'],
    keywords: ['lastPhi', '缓存', '状态', '赋值', '写', '纯函数', '修改', '内部', 'this.#'],
  },
  {
    id: 'D6',
    guarantees: [1],
    files: ['phi.mjs'],
    fns: ['heartbeat'],
    keywords: ['倒流', '越界', '拒绝', '抛', 'PhiError', '负', '单调', '检查', '校验'],
  },
];

const LOCATION_RE = /([A-Za-z0-9_./-]*\.mjs)\s*::\s*([A-Za-z_][A-Za-z0-9_]*)/;

class CheckFailure extends Error {
  constructor(expected = '-', actual = '-', message = 'assertion failed') {
    super(message);
    this.expected = expected;
    this.actual = actual;
  }
}

function sha256Of(path) {
  if (!existsSync(path)) return null;
  const raw = readFileSync(path, 'utf8');
  return createHash('sha256').update(raw.replace(/\r/g, ''), 'utf8').digest('hex');
}

function containsAny(haystack, needles) {
  for (const needle of needles) {
    if (needle !== '' && haystack.includes(needle)) return true;
  }
  return false;
}

/**
 * 解析 REVIEW.md：找出「结论清单」表里的表头与数据行。
 */
function parseReview() {
  const review = { exists: false, raw: '', headerOk: false, rows: [] };
  const path = join(ROOT, 'REVIEW.md');
  if (!existsSync(path)) return review;

  const raw = readFileSync(path, 'utf8');
  review.exists = true;
  review.raw = raw;

  let inConclusions = false;
  for (const line of raw.replace(/\r\n/g, '\n').split('\n')) {
    const trimmed = line.trim();
    if (trimmed.startsWith('#')) {
      inConclusions = trimmed.includes('结论');
      continue;
    }
    if (!inConclusions || !trimmed.startsWith('|')) continue;

    const cells = [];
    const parts = trimmed.split('|');
    for (let i = 1; i < parts.length - 1; i += 1) cells.push(parts[i].trim());
    if (cells.length === 0) continue;

    const joined = cells.join('');
    if (joined.includes('编号') && joined.includes('违反保证')) {
      review.headerOk = true;
      for (const column of REQUIRED_COLUMNS) {
        if (!joined.includes(column)) review.headerOk = false;
      }
      continue;
    }

    let allSeparator = true;
    for (const cell of cells) {
      if (cell.replace(/[-: ]/g, '') !== '') allSeparator = false;
    }
    if (allSeparator) continue;

    let allEmpty = true;
    for (const cell of cells) {
      if (cell !== '') allEmpty = false;
    }
    if (allEmpty) continue;

    review.rows.push(cells);
  }

  return review;
}

const review = parseReview();

const scenarios = [];

// ---------------- unmodified 1 ----------------
scenarios.push({
  group: 'unmodified',
  name: 'sources',
  expect: 'src/phi.mjs 与 src/stats.mjs 的 SHA-256 与基线一致（源码一个字节都没改）',
  run() {
    for (const relative of Object.keys(BASELINE)) {
      const got = sha256Of(join(ROOT, relative));
      if (got === null) throw new CheckFailure(`${relative} 存在`, '读取失败');
      if (got !== BASELINE[relative]) {
        throw new CheckFailure(
          `${relative} 保持原样（SHA-256=${BASELINE[relative].slice(0, 12)}…）`,
          got.slice(0, 12) + '…'
        );
      }
    }
  },
});

// ---------------- format 1 ----------------
scenarios.push({
  group: 'format',
  name: 'table',
  expect: 'REVIEW.md 存在，含四列表头与 D1..D6 六行（每行四列），且不出现无法核对的措辞',
  run() {
    if (!review.exists) throw new CheckFailure('REVIEW.md 存在', '文件不存在');
    if (!review.headerOk) throw new CheckFailure(`表头含四列 ${REQUIRED_COLUMNS.join(' / ')}`, '未找齐');
    if (review.rows.length !== 6) throw new CheckFailure('结论清单恰好 6 行', `${review.rows.length} 行`);

    const ids = ['D1', 'D2', 'D3', 'D4', 'D5', 'D6'];
    ids.forEach((id, index) => {
      const row = review.rows[index];
      if (row.length !== 4) throw new CheckFailure(`第 ${index + 1} 行有 4 列`, `${row.length} 列`);
      if (row[0].toUpperCase() !== id) throw new CheckFailure(`第 ${index + 1} 行编号为 ${id}`, row[0]);
    });

    for (const word of BANNED_WORDS) {
      if (review.raw.includes(word)) throw new CheckFailure('不出现无法核对的措辞', `出现「${word}」`);
    }
  },
});

// ---------------- finding 6 ----------------
for (const finding of FINDINGS) {
  scenarios.push({
    group: 'finding',
    name: finding.id,
    expect: `${finding.id} 命中允许的「违反保证」编号 ${JSON.stringify(finding.guarantees)}，`
      + `文件::函数落在 ${finding.files.join('/')} 的 ${finding.fns.join('/')}，证据可判定`,
    run() {
      if (!review.exists) throw new CheckFailure('REVIEW.md 存在', '文件不存在');

      const row = review.rows.find((candidate) => candidate[0] && candidate[0].toUpperCase() === finding.id);
      if (!row) throw new CheckFailure(`结论清单里有编号 ${finding.id} 的行`, '缺失');
      if (row.length < 4) throw new CheckFailure(`${finding.id} 行有 4 列`, `${row.length} 列`);

      const guaranteeText = row[1];
      const matched = /(\d+)/.exec(guaranteeText);
      const guarantee = matched ? Number(matched[1]) : null;
      if (guarantee === null || !finding.guarantees.includes(guarantee)) {
        throw new CheckFailure(`${finding.id} 的「违反保证」∈ ${JSON.stringify(finding.guarantees)}`, guaranteeText);
      }

      const location = row[2];
      const loc = LOCATION_RE.exec(location);
      if (!loc) throw new CheckFailure(`${finding.id} 的「文件::函数」写成 文件名::函数名`, location);

      const base = loc[1].replace(/\\/g, '/').split('/').pop();
      if (!finding.files.includes(base)) throw new CheckFailure(`${finding.id} 指向 ${finding.files.join('/')}`, loc[1]);
      if (!finding.fns.includes(loc[2])) throw new CheckFailure(`${finding.id} 的函数 ∈ ${finding.fns.join('/')}`, loc[2]);

      const evidence = row[3];
      if (evidence.length < 10) throw new CheckFailure(`${finding.id} 的「可判定证据」足够具体`, `${evidence} 过短`);
      for (const word of PLACEHOLDERS) {
        if (evidence.includes(word)) {
          throw new CheckFailure(`${finding.id} 的「可判定证据」是具体描述`, `出现占位词「${word}」`);
        }
      }
      if (!containsAny(evidence, finding.keywords) && !/\d/.test(evidence)) {
        throw new CheckFailure(
          `${finding.id} 的「可判定证据」提到可复现的输入 / 现象（${finding.keywords.slice(0, 4).join('、')}…）`,
          evidence
        );
      }
    },
  });
}

// ---------------------------------------------------------------------------
// runner
// ---------------------------------------------------------------------------

let list = false;
let only = null;
const args = process.argv.slice(2);
for (let i = 0; i < args.length; i += 1) {
  const arg = args[i];
  if (arg === '-list' || arg === '--list') {
    list = true;
  } else if (arg === '--only' || arg === '--group') {
    i += 1;
    if (i >= args.length) {
      process.stderr.write('--only 需要一个组名（unmodified / format / finding）\n');
      process.exit(2);
    }
    only = new Set(args[i].split(',').map((part) => part.trim()).filter((part) => part !== ''));
  } else if (arg === '-h' || arg === '--help') {
    process.stdout.write('用法: node check/check.mjs [-list] [--only <组名>]\n');
    process.exit(0);
  } else {
    process.stderr.write(`未知参数: ${arg}\n`);
    process.exit(2);
  }
}

if (list) {
  for (const scenario of scenarios) process.stdout.write(`${scenario.group}/${scenario.name}\n`);
  process.exit(0);
}

const groups = new Set(scenarios.map((scenario) => scenario.group));
if (only !== null) {
  for (const name of only) {
    if (!groups.has(name)) {
      process.stderr.write(`未知分组 ${name}（可选：${[...groups].join(' / ')}）\n`);
      process.exit(2);
    }
  }
}

let passed = 0;
let selected = 0;
for (const scenario of scenarios) {
  if (only !== null && !only.has(scenario.group)) continue;
  selected += 1;
  const label = `${scenario.group}/${scenario.name}`;
  try {
    scenario.run();
    passed += 1;
    process.stdout.write(`PASS ${label}\n`);
  } catch (error) {
    const expected = error instanceof CheckFailure ? error.expected : '(未抛断言)';
    const actual = error instanceof CheckFailure ? error.actual : error.message;
    process.stdout.write(`FAIL ${label}  期望=${expected} 实际=${actual}\n`);
  }
}

if (selected === 0) {
  process.stderr.write('没有匹配的场景\n');
  process.exit(2);
}

process.stdout.write(`结果：通过 ${passed}/${selected}\n`);
process.exit(passed === selected ? 0 : 1);