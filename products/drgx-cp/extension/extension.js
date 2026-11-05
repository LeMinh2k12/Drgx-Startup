const vscode = require('vscode');
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const http = require('http');
const judgeView = require('./judge-view');

const SKINS = ['DrgX Ion', 'DrgX Nebula', 'DrgX Tokyo', 'DrgX Matrix', 'DrgX Dawn'];
const SKIN_META = {
  'DrgX Ion': ['Tím · Cyan', 'Cân bằng, mặc định'],
  'DrgX Nebula': ['Tím · Hồng', 'Nổi bật, sáng tạo'],
  'DrgX Tokyo': ['Xanh · Tím', 'Dịu mắt, đêm dài'],
  'DrgX Matrix': ['Lục · Chanh', 'Tập trung, năng lượng'],
  'DrgX Dawn': ['Sáng · Ấm', 'Ban ngày, in ấn']
};

let statusItem;
let output;
let homePanel = null;
let lastTarget = null;
let lastAction = 'local';
let sessionStudentTokens = {};

// ─── Tiền kiểm Quy chế Thi Themis & Phân tích Tĩnh (Themis + Static Complexity Guard) ───
function runThemisAndStaticGuard(sourceText, filePath, lang) {
  const warnings = [];
  const raw = String(sourceText || '');
  const baseName = path.basename(filePath || '', path.extname(filePath || '')).toUpperCase();
  const lines = raw.split(/\r?\n/);

  if (lang === 'cpp') {
    // 1. Kiểm tra quy chế tệp tin Themis (TASK.INP / TASK.OUT)
    const freopenRe = /freopen\s*\(\s*"([^"]+)"\s*,\s*"([^"]+)"\s*,\s*(stdin|stdout)\s*\)/g;
    let m;
    while ((m = freopenRe.exec(raw)) !== null) {
      const targetFile = m[1].trim();
      const stream = m[3].trim();
      const expectedExt = stream === 'stdin' ? '.INP' : '.OUT';
      const expectedName = baseName + expectedExt;
      if (baseName && targetFile.toUpperCase() !== expectedName) {
        warnings.push(`[Themis File Guard] Phát hiện freopen("${targetFile}", ..., ${stream}) lệch tên bài "${expectedName}" — dễ bị 0 điểm trên Themis.`);
      }
    }

    // 2. Kiểm tra biến đếm tổng/tích kiểu int 32-bit trong vòng lặp (nguy cơ tràn số Integer Overflow)
    const intAccumDeclRe = /\bint\s+([a-zA-Z_]\w*(?:\s*=\s*[^,;]+)?(?:\s*,\s*[a-zA-Z_]\w*(?:\s*=\s*[^,;]+)?)*)\s*;/g;
    const intVars = new Set();
    let dm;
    while ((dm = intAccumDeclRe.exec(raw)) !== null) {
      const declPart = dm[1];
      for (const chunk of declPart.split(',')) {
        const vMatch = chunk.trim().match(/^([a-zA-Z_]\w*)/);
        if (vMatch && vMatch[1] !== 'main' && vMatch[1] !== 'i' && vMatch[1] !== 'j' && vMatch[1] !== 'k') {
          intVars.add(vMatch[1]);
        }
      }
    }

    let loopDepth = 0;
    let maxLoopDepth = 0;
    let endlInLoopLine = 0;
    const overflowRiskVars = new Set();

    for (let idx = 0; idx < lines.length; idx++) {
      const cleanLine = lines[idx].replace(/\/\/.*$/, '').trim();
      if (!cleanLine) continue;
      if (/\b(for|while)\s*\(/.test(cleanLine)) {
        loopDepth++;
        if (loopDepth > maxLoopDepth) maxLoopDepth = loopDepth;
      }
      if (loopDepth > 0) {
        if (/\bendl\b/.test(cleanLine) && !endlInLoopLine) {
          endlInLoopLine = idx + 1;
        }
        const accumMatch = cleanLine.match(/\b([a-zA-Z_]\w*)\s*(\+=|\*=|=\s*\1\s*[+*])/);
        if (accumMatch && intVars.has(accumMatch[1])) {
          overflowRiskVars.add(accumMatch[1]);
        }
      }
      const opens = (cleanLine.match(/\{/g) || []).length;
      const closes = (cleanLine.match(/\}/g) || []).length;
      if (closes > opens && loopDepth > 0) {
        loopDepth = Math.max(0, loopDepth - (closes - opens));
      }
    }

    if (overflowRiskVars.size > 0) {
      const varList = Array.from(overflowRiskVars).join(', ');
      warnings.push(`[Static Complexity Guard] Biến tích lũy (${varList}) trong vòng lặp đang dùng kiểu 'int' 32-bit (~2.14×10^9) có nguy cơ tràn số (Overflow) -> Gợi ý đổi sang 'long long'.`);
    } else if (/\bint\b/.test(raw) && !/\blong\s+long\b|\bll\b|\bint64_t\b/.test(raw) && maxLoopDepth >= 1) {
      warnings.push(`[Static Complexity Guard] Code chỉ dùng kiểu 'int' 32-bit trong bài có vòng lặp -> Gợi ý dùng 'long long' cho biến tổng/kết quả.`);
    }

    // 3. Kiểm tra dùng endl trong vòng lặp lớn gây TLE
    if (endlInLoopLine > 0) {
      warnings.push(`[Static Complexity Guard] Phát hiện dùng 'endl' trong vòng lặp (dòng ${endlInLoopLine}) gây flush bộ đệm liên tục dẫn đến TLE -> Gợi ý thay bằng '\\n'.`);
    }
  } else if (lang === 'python') {
    // Kiểm tra tên file .INP/.OUT trong Python open(...)
    const pyOpenRe = /open\s*\(\s*['"]([^'"]+\.(?:inp|out))['"]/gi;
    let pm;
    while ((pm = pyOpenRe.exec(raw)) !== null) {
      const fname = pm[1].trim();
      const stem = path.basename(fname, path.extname(fname)).toUpperCase();
      if (baseName && stem !== baseName) {
        warnings.push(`[Themis File Guard] Tệp "${fname}" trong open() không khớp tên bài "${baseName}.INP/.OUT".`);
      }
    }
  }

  return warnings;
}

function formatReceiptShort(resOrReceipt) {
  const r = (resOrReceipt && resOrReceipt.submission_receipt) ? resOrReceipt.submission_receipt : resOrReceipt;
  if (!r) return '';
  if (typeof r === 'string') return r;
  const id = r.receipt_id || `${r.exam_code || ''}-${r.sub_id || ''}`;
  const sig = (r.signature || '').slice(0, 10);
  const h = (r.audit_hash || '').slice(0, 10);
  return `${id} [HMAC:${sig}… | SHA256:${h}…]`;
}

function buildExecEnv() {
  const env = Object.assign({}, process.env);
  if (process.platform === 'win32') {
    const msysBin = 'C:\\msys64\\ucrt64\\bin';
    const curPath = env.PATH || env.Path || '';
    if (fs.existsSync(msysBin) && !curPath.toLowerCase().startsWith(msysBin.toLowerCase())) {
      env.PATH = msysBin + ';' + curPath;
      if ('Path' in env) env.Path = env.PATH;
    }
  }
  return env;
}

function findTestsDir(startDir) {
  let cur = startDir;
  for (let i = 0; i < 4 && cur; i++) {
    const cand = path.join(cur, 'tests');
    if (fs.existsSync(cand) && fs.statSync(cand).isDirectory()) return cand;
    const parent = path.dirname(cur);
    if (parent === cur) break;
    cur = parent;
  }
  return null;
}

function findExpectedFile(dir, base) {
  const exts = ['.out', '.ans', '.a'];
  for (const ext of exts) {
    const p = path.join(dir, base + ext);
    if (fs.existsSync(p)) return p;
  }
  return null;
}

function readTests(dir) {
  if (!dir || !fs.existsSync(dir)) return [];
  const files = fs.readdirSync(dir)
    .filter(f => f.toLowerCase().endsWith('.in'))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
  return files.map(f => {
    const base = f.slice(0, -3);
    const outPath = findExpectedFile(dir, base);
    return {
      name: base,
      inPath: path.join(dir, f),
      outPath: outPath || path.join(dir, base + '.out'),
      hasExpected: !!outPath
    };
  });
}

function runCommand(cmd, args, input, timeoutMs) {
  return new Promise(resolve => {
    const t0 = Date.now();
    const proc = execFile(cmd, args, { timeout: timeoutMs || 6000, maxBuffer: 4 * 1024 * 1024, env: buildExecEnv() }, (err, stdout, stderr) => {
      const ms = Date.now() - t0;
      if (err && err.killed) return resolve({ verdict: 'TLE', ms, stdout: '', stderr: '' });
      if (err) return resolve({ verdict: 'RE', ms, stdout: stdout || '', stderr: stderr || err.message });
      resolve({ verdict: 'OK', ms, stdout: stdout || '', stderr: stderr || '' });
    });
    if (input && proc.stdin) {
      proc.stdin.write(input);
      proc.stdin.end();
    }
  });
}

function clip(text, maxChars) {
  const raw = String(text == null ? '' : text);
  if (raw.length <= maxChars) return { text: raw, truncated: false };
  return { text: raw.slice(0, maxChars), truncated: true };
}

function detectLang(filePath) {
  const lower = String(filePath || '').toLowerCase();
  if (lower.endsWith('.cpp') || lower.endsWith('.cc') || lower.endsWith('.cxx')) return 'cpp';
  if (lower.endsWith('.py')) return 'python';
  return '';
}

function resolveTarget(preferred) {
  const ed = vscode.window.activeTextEditor;
  if (ed && ed.document && detectLang(ed.document.fileName)) {
    return { doc: ed.document, file: ed.document.fileName };
  }
  if (preferred && preferred.file && fs.existsSync(preferred.file)) return preferred;
  if (lastTarget && lastTarget.file && fs.existsSync(lastTarget.file)) return lastTarget;
  return null;
}

function formatSummary(state) {
  if (!state || state.phase === 'idle') return 'DrgX Judge: chưa có kết quả để sao chép.';
  const lines = [];
  const mode = state.mode === 'server' ? `Server (${state.examCode || '—'})` : 'Local';
  lines.push(`DrgX Judge · ${mode}`);
  if (state.source) lines.push(`File: ${state.source}`);
  if (state.summary && state.summary.verdict) {
    lines.push(`Verdict: ${state.summary.verdict} (${state.summary.ac || 0}/${state.summary.total || 0}) · ${state.summary.totalMs || 0} ms`);
  }
  if (state.receiptShort) {
    lines.push(`Cryptographic Receipt: ${state.receiptShort}`);
  }
  if (Array.isArray(state.guardWarnings) && state.guardWarnings.length) {
    lines.push('', 'Themis & Static Complexity Guard:');
    for (const w of state.guardWarnings) lines.push(`  ! ${w}`);
  }
  if (state.compile && state.compile.status === 'error' && state.compile.message) {
    lines.push('', 'Compile error:', state.compile.message.trim());
  }
  for (const t of state.tests || []) {
    lines.push(`- ${t.name}: ${t.verdict}${t.ms ? ` (${t.ms} ms)` : ''}`);
  }
  return lines.join('\n');
}

function mapServerResult(res, target, code, guardWarnings = []) {
  const rawTests = Array.isArray(res && res.tests) ? res.tests : [];
  const tests = rawTests.map(t => ({
    name: t.name || 'test',
    verdict: t.verdict || 'FAIL',
    ms: Number(t.ms) || 0,
    expected: t.expected != null ? String(t.expected) : null,
    got: t.got != null ? String(t.got) : '',
    stderr: t.stderr ? String(t.stderr) : '',
    missingExpected: t.expected == null
  }));
  const ac = tests.filter(t => t.verdict === 'AC').length;
  const totalMs = tests.reduce((sum, t) => sum + (Number(t.ms) || 0), 0);
  const verdict = (res && res.verdict) || (tests.length && ac === tests.length ? 'AC' : 'FAIL');
  const receiptShort = formatReceiptShort(res);
  const baseMsg = (res && res.message) || '';
  const fullMsg = [
    baseMsg,
    receiptShort ? `🔐 Biên lai nộp bài (HMAC-SHA256): ${receiptShort}` : '',
    ...guardWarnings
  ].filter(Boolean).join(' · ');
  return {
    phase: 'done',
    mode: 'server',
    source: target ? path.basename(target.file) : '',
    sourcePath: target ? target.file : '',
    examCode: code || '',
    finishedAt: Date.now(),
    compile: verdict === 'CE'
      ? { status: 'error', message: (res && res.compile_error) || 'Compile Error', ms: 0 }
      : { status: 'ok', message: '', ms: 0 },
    progress: { completed: tests.length, total: tests.length },
    tests,
    summary: { verdict, ac, total: tests.length, totalMs },
    receipt: (res && res.submission_receipt) || null,
    receiptShort,
    guardWarnings,
    message: fullMsg
  };
}

function postJson(urlStr, payload) {
  return new Promise((resolve, reject) => {
    const u = new URL(urlStr);
    const data = Buffer.from(JSON.stringify(payload), 'utf8');
    const req = http.request({
      hostname: u.hostname,
      port: u.port,
      path: u.pathname,
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': data.length }
    }, res => {
      let body = '';
      res.on('data', d => body += d.toString('utf8'));
      res.on('end', () => {
        try {
          const parsed = JSON.parse(body || '{}');
          if (res.statusCode >= 400) return reject(new Error(parsed.error || ('HTTP ' + res.statusCode)));
          resolve(parsed);
        } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

function updateStatus() {
  const cfg = vscode.workspace.getConfiguration('drgxCp');
  const code = cfg.get('examCode') || '';
  statusItem.text = code ? `$(shield) DrgX CP [${code}]` : '$(Flame) DrgX CP (F9 Judge)';
  statusItem.tooltip = code ? `Đang trong phòng thi ${code} — bấm để nộp bài` : 'Bấm để chấm toàn bộ tests/ (F9 / Ctrl+Alt+J)';
  statusItem.command = code ? 'drgxCp.submit' : 'drgxCp.judge';
  statusItem.show();
}

async function chooseSkin() {
  const wb = vscode.workspace.getConfiguration('workbench');
  const current = String(wb.get('colorTheme', 'DrgX Ion'));
  const items = SKINS.map(name => {
    const meta = SKIN_META[name];
    return {
      label: (current === name ? '$(check) ' : '$(symbol-color) ') + name,
      description: meta[0] + ' — ' + meta[1],
      detail: current === name ? 'Đang sử dụng' : 'Bấm để áp dụng ngay',
      theme: name
    };
  });
  const picked = await vscode.window.showQuickPick(items, {
    placeHolder: '🎨 Chọn skin DrgX — đồng bộ với Web & Dev Studio',
    matchOnDescription: true
  });
  if (picked) {
    await wb.update('colorTheme', picked.theme, vscode.ConfigurationTarget.Global);
    if (homePanel) homePanel.webview.html = renderHomeHtml(homePanel.webview, false);
    vscode.window.showInformationMessage('🎨 Đã đổi skin: ' + picked.theme.replace('DrgX ', ''));
  }
}

async function openLearnHub() {
  const candidates = [
    path.resolve(__dirname, '..', '..', '..', 'web', 'ecosystem', 'index.html'),
    path.resolve(__dirname, '..', '..', '..', '..', 'web', 'ecosystem', 'index.html')
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) {
      await vscode.env.openExternal(vscode.Uri.file(p));
      return;
    }
  }
  vscode.window.showInformationMessage('DrgX Learn Hub: mở file web/ecosystem/index.html trong trình duyệt.');
}

async function judge(preferredTarget) {
  const target = resolveTarget(preferredTarget);
  if (!target) {
    vscode.window.showWarningMessage('DrgX CP: hãy mở một file C++ (.cpp) hoặc Python (.py) trước khi nhấn F9.');
    return;
  }
  const lang = detectLang(target.file);
  if (!lang) {
    vscode.window.showWarningMessage('DrgX CP: chỉ hỗ trợ chấm file C++ (.cpp) hoặc Python (.py).');
    return;
  }
  lastTarget = target;
  lastAction = 'local';
  if (target.doc && target.doc.isDirty) await target.doc.save();
  const src = target.file;
  const srcName = path.basename(src);
  const dir = path.dirname(src);
  const testsDir = findTestsDir(dir);
  const tests = readTests(testsDir);
  output.clear();
  output.appendLine(`[DrgX CP] Bắt đầu chấm: ${src}`);

  const sourceText = target.doc ? target.doc.getText() : fs.readFileSync(src, 'utf8');
  const guardWarnings = runThemisAndStaticGuard(sourceText, src, lang);
  for (const w of guardWarnings) {
    output.appendLine(`⚠️ ${w}`);
  }
  if (guardWarnings.length) {
    vscode.window.showWarningMessage(`DrgX CP Guard: ${guardWarnings[0]}`);
  }

  const cfg = vscode.workspace.getConfiguration('drgxCp');
  const examCode = cfg.get('examCode') || '';
  const startedAt = Date.now();

  if (!tests.length) {
    output.appendLine('[DrgX CP] Không tìm thấy thư mục tests/*.in kế bên bài làm.');
    judgeView.show({
      phase: 'done',
      mode: 'local',
      source: srcName,
      sourcePath: src,
      examCode,
      startedAt,
      finishedAt: Date.now(),
      compile: { status: 'idle', message: '', ms: 0 },
      progress: { completed: 0, total: 0 },
      tests: [],
      summary: { verdict: 'NO_TESTS', ac: 0, total: 0, totalMs: 0 },
      message: 'Không tìm thấy cặp file .in/.out trong thư mục tests/ cạnh bài làm.'
    });
    return;
  }

  const pendingTests = tests.map(t => ({
    name: t.name,
    verdict: 'PENDING',
    ms: 0,
    expected: null,
    got: '',
    stderr: ''
  }));

  judgeView.show({
    phase: 'running',
    mode: 'local',
    source: srcName,
    sourcePath: src,
    examCode,
    startedAt,
    finishedAt: 0,
    compile: { status: 'running', message: '', ms: 0 },
    progress: { completed: 0, total: tests.length },
    tests: pendingTests,
    summary: { verdict: 'PENDING', ac: 0, total: tests.length, totalMs: 0 },
    message: ''
  });

  let runCmd = '';
  let runArgs = [];
  let exeToClean = null;
  let compMs = 0;

  if (lang === 'cpp') {
    const exe = path.join(dir, '.drgx_tmp.exe');
    exeToClean = exe;
    const comp = await runCommand('g++', ['-O2', '-std=c++17', src, '-o', exe], null, 15000);
    compMs = comp.ms;
    if (comp.verdict !== 'OK') {
      output.appendLine('[CE] Lỗi biên dịch:\n' + comp.stderr);
      judgeView.update({
        phase: 'done',
        finishedAt: Date.now(),
        compile: { status: 'error', message: comp.stderr || 'Không biên dịch được bằng g++.', ms: comp.ms },
        progress: { completed: 0, total: tests.length },
        tests: [],
        summary: { verdict: 'CE', ac: 0, total: tests.length, totalMs: 0 }
      });
      vscode.window.showErrorMessage('DrgX CP: Lỗi biên dịch (CE)');
      return;
    }
    runCmd = exe;
    runArgs = [];
  } else {
    const comp = await runCommand('python', ['-m', 'py_compile', src], null, 10000);
    compMs = comp.ms;
    if (comp.verdict !== 'OK') {
      output.appendLine('[CE] Lỗi cú pháp Python:\n' + (comp.stderr || comp.stdout));
      judgeView.update({
        phase: 'done',
        finishedAt: Date.now(),
        compile: { status: 'error', message: comp.stderr || comp.stdout || 'Lỗi cú pháp Python.', ms: comp.ms },
        progress: { completed: 0, total: tests.length },
        tests: [],
        summary: { verdict: 'CE', ac: 0, total: tests.length, totalMs: 0 }
      });
      vscode.window.showErrorMessage('DrgX CP: Lỗi cú pháp Python (CE)');
      return;
    }
    runCmd = 'python';
    runArgs = [src];
  }

  let ac = 0;
  let totalMs = 0;
  const timeLimitMs = Math.max(500, Number(cfg.get('timeLimit')) || 6000);
  for (let i = 0; i < tests.length; i++) {
    const t = tests[i];
    const inp = fs.readFileSync(t.inPath, 'utf8');
    const hasOut = t.hasExpected && fs.existsSync(t.outPath);
    const expectedRaw = hasOut ? fs.readFileSync(t.outPath, 'utf8').trim() : '';
    const r = await runCommand(runCmd, runArgs, inp, timeLimitMs);
    let v = r.verdict;
    const gotRaw = (r.stdout || '').trim();
    if (v === 'OK') {
      if (!hasOut) v = 'NO_OUT';
      else if (gotRaw === expectedRaw) { v = 'AC'; ac++; }
      else v = 'WA';
    }
    totalMs += r.ms || 0;
    const expClip = clip(expectedRaw, 6000);
    const gotClip = clip(gotRaw, 6000);
    const inpClip = clip(inp.trim(), 3000);
    const errClip = clip((r.stderr || '').trim(), 2000);
    pendingTests[i] = {
      name: t.name,
      verdict: v,
      ms: r.ms,
      expected: hasOut ? expClip.text : null,
      got: gotClip.text,
      stderr: errClip.text,
      input: inpClip.text,
      inputTruncated: inpClip.truncated,
      missingExpected: !hasOut
    };
    output.appendLine(`  Test ${t.name}: ${v} (${r.ms} ms)`);
    if (v === 'WA') {
      output.appendLine(`    Expected: ${expectedRaw.slice(0, 120)}`);
      output.appendLine(`    Got     : ${gotRaw.slice(0, 120)}`);
    }
    judgeView.update({
      phase: 'running',
      compile: { status: 'ok', message: '', ms: compMs },
      progress: { completed: i + 1, total: tests.length },
      tests: pendingTests.slice(),
      summary: { verdict: 'PENDING', ac, total: tests.length, totalMs }
    });
  }
  if (exeToClean) {
    try { fs.unlinkSync(exeToClean); } catch (_) {}
  }
  const summary = `${ac}/${tests.length} AC`;
  const finalVerdict = ac === tests.length ? 'AC' : 'FAIL';
  output.appendLine(`[DrgX CP] Tổng kết: ${summary}`);
  judgeView.update({
    phase: 'done',
    finishedAt: Date.now(),
    compile: { status: 'ok', message: '', ms: compMs },
    progress: { completed: tests.length, total: tests.length },
    tests: pendingTests.slice(),
    summary: { verdict: finalVerdict, ac, total: tests.length, totalMs },
    guardWarnings,
    message: guardWarnings.join(' · ')
  });
  vscode.window.showInformationMessage(`DrgX CP Judge: ${summary}`);
}

async function joinExam() {
  const cfg = vscode.workspace.getConfiguration('drgxCp');
  const srv = cfg.get('serverUrl');
  const code = await vscode.window.showInputBox({ prompt: 'Nhập mã phòng thi (6 ký tự)', placeHolder: 'VD: AB12CD' });
  if (!code) return;
  const name = await vscode.window.showInputBox({ prompt: 'Tên hoặc SBD của bạn', value: cfg.get('studentName') || 'hoc-sinh' });
  if (!name) return;
  try {
    const res = await postJson(srv + '/exam/join', { code: code.trim().toUpperCase(), name });
    if (res.studentToken && res.exam && res.exam.code) {
      sessionStudentTokens[res.exam.code] = res.studentToken;
    }
    await cfg.update('examCode', res.exam.code, vscode.ConfigurationTarget.Global);
    await cfg.update('studentName', name, vscode.ConfigurationTarget.Global);
    updateStatus();
    vscode.window.showInformationMessage(`Đã vào phòng thi: ${res.exam.title} [${res.exam.code}]`);
  } catch (e) {
    vscode.window.showErrorMessage('Không vào được phòng thi: ' + e.message);
  }
}

async function createExam() {
  const cfg = vscode.workspace.getConfiguration('drgxCp');
  const srv = cfg.get('serverUrl');
  const title = await vscode.window.showInputBox({ prompt: 'Tên phòng thi mới', value: 'Kiểm tra Đội tuyển Tin học' });
  if (!title) return;
  try {
    const res = await postJson(srv + '/exam/create', { title });
    await cfg.update('examCode', res.code, vscode.ConfigurationTarget.Global);
    updateStatus();
    vscode.window.showInformationMessage(`Đã tạo phòng thi [${res.code}] — chia sẻ mã này cho học sinh.`);
  } catch (e) {
    vscode.window.showErrorMessage('Không tạo được phòng: ' + e.message);
  }
}

async function submit(preferredTarget) {
  const target = resolveTarget(preferredTarget);
  if (!target) {
    vscode.window.showWarningMessage('Hãy mở bài làm (.cpp hoặc .py) trước khi nộp.');
    return;
  }
  const lang = detectLang(target.file);
  if (!lang) {
    vscode.window.showWarningMessage('DrgX CP: chỉ nộp được file C++ (.cpp) hoặc Python (.py).');
    return;
  }
  lastTarget = target;
  lastAction = 'server';
  if (target.doc && target.doc.isDirty) await target.doc.save();
  const cfg = vscode.workspace.getConfiguration('drgxCp');
  const srv = cfg.get('serverUrl');
  let code = cfg.get('examCode');
  if (!code) {
    await joinExam();
    code = vscode.workspace.getConfiguration('drgxCp').get('examCode');
    if (!code) return;
  }
  const student = cfg.get('studentName') || 'hoc-sinh';
  const sourceText = target.doc ? target.doc.getText() : fs.readFileSync(target.file, 'utf8');
  const guardWarnings = runThemisAndStaticGuard(sourceText, target.file, lang);
  judgeView.show({
    phase: 'running',
    mode: 'server',
    source: path.basename(target.file),
    sourcePath: target.file,
    examCode: code,
    startedAt: Date.now(),
    finishedAt: 0,
    compile: { status: 'running', message: '', ms: 0 },
    progress: { completed: 0, total: 0 },
    tests: [],
    summary: { verdict: 'PENDING', ac: 0, total: 0, totalMs: 0 },
    guardWarnings,
    message: guardWarnings.join(' · ')
  });
  try {
    const payload = {
      examCode: code,
      student,
      language: lang,
      code: sourceText
    };
    if (sessionStudentTokens[code]) {
      payload.studentToken = sessionStudentTokens[code];
    }
    const res = await postJson(srv + '/submit', payload);
    const receiptShort = formatReceiptShort(res);
    output.clear();
    output.appendLine(`[Exam Server · ${code}] Verdict: ${res.verdict}`);
    if (receiptShort) {
      output.appendLine(`[Cryptographic Receipt · HMAC-SHA256] ${receiptShort}`);
    }
    for (const w of guardWarnings) {
      output.appendLine(`⚠️ ${w}`);
    }
    if (res.compile_error) output.appendLine(res.compile_error);
    if (res.message) output.appendLine(res.message);
    for (const t of (res.tests || [])) {
      output.appendLine(`  Test ${t.name}: ${t.verdict} (${t.ms} ms)`);
    }
    judgeView.update(mapServerResult(res, target, code, guardWarnings));
    vscode.window.showInformationMessage(
      receiptShort
        ? `Server Verdict [${code}]: ${res.verdict} · 🔐 Biên lai: ${receiptShort}`
        : `Server Verdict [${code}]: ${res.verdict}`
    );
  } catch (e) {
    judgeView.update({
      phase: 'done',
      mode: 'server',
      examCode: code,
      finishedAt: Date.now(),
      compile: { status: 'idle', message: '', ms: 0 },
      tests: [],
      summary: { verdict: 'ERROR', ac: 0, total: 0, totalMs: 0 },
      message: 'Nộp bài thất bại: ' + e.message
    });
    vscode.window.showErrorMessage('Nộp bài thất bại: ' + e.message);
  }
}

function renderHomeHtml(webview, showIntro = true) {
  const cfg = vscode.workspace.getConfiguration('drgxCp');
  const wb = vscode.workspace.getConfiguration('workbench');
  const code = cfg.get('examCode') || 'Chưa vào phòng';
  const srv = cfg.get('serverUrl');
  const skin = wb.get('colorTheme') || 'DrgX Ion';
  const videoUri = webview
    ? webview.asWebviewUri(vscode.Uri.file(path.join(__dirname, 'media', 'drgx-intro.mp4')))
    : '';
  const logoUri = webview
    ? webview.asWebviewUri(vscode.Uri.file(path.join(__dirname, 'media', 'drgx-cp.png')))
    : '';
  return `<!DOCTYPE html>
<html lang="vi"><head><meta charset="UTF-8">
<style>
  * { box-sizing: border-box; }
  body { font-family: 'Segoe UI', system-ui, sans-serif; background:#090d16; color:#e5e7eb; padding:32px; margin:0; overflow-x:hidden; }
  .hero { position:relative; background:linear-gradient(135deg,#1e1b4b,#0f172a); border:1px solid #312e81; border-radius:16px; padding:28px; margin-bottom:24px; display:flex; align-items:flex-start; justify-content:space-between; gap:18px; flex-wrap:wrap; }
  .badge { display:inline-block; background:#ef4444; color:#fff; font-weight:700; font-size:11px; padding:4px 10px; border-radius:999px; letter-spacing:.08em; margin-right:8px; }
  .btn-intro { background:linear-gradient(135deg,rgba(99,102,241,.22),rgba(56,189,248,.18)); border:1px solid rgba(99,102,241,.55); color:#e0e7ff; padding:9px 15px; border-radius:999px; font-weight:700; font-size:12.5px; cursor:pointer; display:inline-flex; align-items:center; gap:7px; transition:.18s; }
  .btn-intro:hover { border-color:#38bdf8; transform:translateY(-1px); box-shadow:0 6px 20px rgba(56,189,248,.25); }
  h1 { margin:10px 0 6px; font-size:28px; }
  p.sub { color:#94a3b8; margin:0; max-width:680px; line-height:1.55; }
  .grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(220px,1fr)); gap:16px; margin-top:20px; }
  .card { background:#111827; border:1px solid #1f2937; border-radius:12px; padding:18px; cursor:pointer; transition:.15s; }
  .card:hover { border-color:#6366f1; transform:translateY(-2px); }
  .card h3 { margin:0 0 6px; font-size:16px; color:#a5b4fc; }
  .card p { margin:0; font-size:13px; color:#9ca3af; }
  .meta { margin-top:24px; padding:14px 18px; background:#0f172a; border-radius:10px; font-size:13px; color:#94a3b8; border:1px solid #1e293b; }
  b { color:#fff; }

  /* ═══ Cinematic Video Intro Overlay ═══ */
  .intro-overlay {
    position:fixed; inset:0; z-index:9999;
    background:radial-gradient(circle at 50% 42%, #151934 0%, #06080f 68%);
    display:flex; flex-direction:column; align-items:center; justify-content:space-between;
    padding:24px 32px;
    transition:opacity .45s cubic-bezier(.22,1,.36,1), transform .45s cubic-bezier(.22,1,.36,1);
  }
  .intro-overlay.hidden { opacity:0; transform:scale(1.03); pointer-events:none; }
  .intro-top { width:100%; max-width:960px; display:flex; align-items:center; justify-content:space-between; }
  .intro-kicker { display:inline-flex; align-items:center; gap:8px; padding:6px 14px; border-radius:999px; background:rgba(15,23,42,.8); border:1px solid rgba(99,102,241,.4); font-size:11px; font-weight:700; letter-spacing:.1em; color:#a5b4fc; text-transform:uppercase; }
  .intro-dot { width:7px; height:7px; border-radius:50%; background:#38bdf8; box-shadow:0 0 10px #38bdf8; animation:pulse 1.4s infinite; }
  .intro-skip { background:rgba(30,41,59,.75); border:1px solid rgba(148,163,184,.3); color:#e2e8f0; padding:7px 14px; border-radius:999px; font-size:12px; font-weight:600; cursor:pointer; display:inline-flex; align-items:center; gap:6px; transition:.15s; }
  .intro-skip:hover { border-color:#38bdf8; color:#fff; background:rgba(56,189,248,.15); }
  .intro-skip kbd { background:rgba(15,23,42,.9); border:1px solid rgba(148,163,184,.3); border-radius:4px; padding:1px 6px; font-size:10px; }
  .intro-stage { display:flex; flex-direction:column; align-items:center; gap:18px; my:auto; }
  .intro-bezel {
    width:min(460px, 76vw); aspect-ratio:16/10; border-radius:22px; padding:5px;
    background:linear-gradient(135deg, rgba(99,102,241,.6), rgba(56,189,248,.35), rgba(15,23,42,.9));
    box-shadow:0 24px 64px rgba(0,0,0,.78), 0 0 50px rgba(99,102,241,.3);
    overflow:hidden;
  }
  .intro-screen { width:100%; height:100%; border-radius:18px; background:#05070c; overflow:hidden; display:grid; place-items:center; position:relative; }
  .intro-video { width:100%; height:100%; object-fit:cover; display:block; }
  .intro-fallback { width:128px; height:128px; object-fit:contain; border-radius:22px; filter:drop-shadow(0 12px 36px rgba(99,102,241,.45)); display:none; }
  .intro-caption { text-align:center; }
  .intro-caption h2 { margin:0; font-size:22px; font-weight:800; background:linear-gradient(135deg,#fff,#a5b4fc,#38bdf8); -webkit-background-clip:text; -webkit-text-fill-color:transparent; }
  .intro-caption p { margin:4px 0 0; font-size:12.5px; color:#94a3b8; }
  .intro-bottom { width:100%; max-width:520px; display:flex; flex-direction:column; gap:8px; }
  .intro-bar-track { width:100%; height:4px; border-radius:999px; background:rgba(148,163,184,.16); overflow:hidden; }
  .intro-bar-fill { height:100%; width:0%; border-radius:999px; background:linear-gradient(90deg,#6366f1,#38bdf8,#34d399); transition:width .18s linear; }
  .intro-status { display:flex; justify-content:space-between; font-size:11.5px; color:#94a3b8; font-family:Consolas,monospace; }
  @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.35} }
</style></head>
<body>
  <div id="introOverlay" class="intro-overlay${showIntro ? '' : ' hidden'}" role="dialog" aria-label="DrgX CP Studio Video Intro">
    <div class="intro-top">
      <div class="intro-kicker"><span class="intro-dot"></span><span>DRGX CP STUDIO v2.0 · EXAM INTEGRITY</span></div>
      <button type="button" class="intro-skip" onclick="closeIntro()">Bỏ qua Intro <kbd>Esc</kbd></button>
    </div>
    <div class="intro-stage">
      <div class="intro-bezel">
        <div class="intro-screen">
          <video id="introVideo" class="intro-video" src="${videoUri}" poster="${logoUri}" autoplay muted playsinline></video>
          <img id="introFallback" class="intro-fallback" src="${logoUri}" alt="DrgX CP Studio">
        </div>
      </div>
      <div class="intro-caption">
        <h2>DrgX CP Studio</h2>
        <p>Chấm bài C++17 / Python tốc độ cao · Server-Authoritative Exam Integrity</p>
      </div>
    </div>
    <div class="intro-bottom">
      <div class="intro-bar-track"><div id="introBar" class="intro-bar-fill"></div></div>
      <div class="intro-status">
        <span id="introStep">[1/3] Khởi tạo Local C++17 &amp; Python Judge Engine...</span>
        <span id="introPct">0%</span>
      </div>
    </div>
  </div>

  <div class="hero">
    <div>
      <span class="badge">EXAM INTEGRITY · NO AI</span>
      <h1>DrgX CP Studio</h1>
      <p class="sub">Môi trường thi đấu &amp; luyện đội tuyển Tin học — hỗ trợ C++17 &amp; Python, khóa hoàn toàn AI gợi ý code, chấm đối chiếu qua Exam Server.</p>
    </div>
    <button type="button" class="btn-intro" onclick="replayIntro()" title="Xem lại Video Intro khởi động">
      <span>🎬 Xem Video Intro</span>
    </button>
  </div>
  <div class="grid">
    <div class="card" onclick="cmd('judge')">
      <h3>⚡ Chấm toàn bộ tests/ (F9)</h3>
      <p>Chạy C++17 / Python và so khớp từng cặp .in/.out (.ans/.a) trong bảng DrgX Judge.</p>
    </div>
    <div class="card" onclick="cmd('judgePanel')">
      <h3>📊 Mở bảng Judge UI</h3>
      <p>Xem lại kết quả từng testcase, thời gian chạy và bảng đối chiếu Expected / Got.</p>
    </div>
    <div class="card" onclick="cmd('joinExam')">
      <h3>🔑 Vào phòng thi bằng mã</h3>
      <p>Nhập mã 6 ký tự do giáo viên cung cấp để đồng bộ kỳ thi.</p>
    </div>
    <div class="card" onclick="cmd('submit')">
      <h3>📤 Nộp bài lên Exam Server</h3>
      <p>Server chấm độc lập (C++ / Python) và lưu biên bản chống gian lận.</p>
    </div>
    <div class="card" onclick="cmd('createExam')">
      <h3>🏫 Tạo phòng thi mới (Giáo viên)</h3>
      <p>Sinh mã phòng 6 ký tự trên Exam Server nội bộ.</p>
    </div>
    <div class="card" onclick="cmd('skin')">
      <h3>🎨 Đổi skin giao diện (${skin.replace('DrgX ', '')})</h3>
      <p>5 skin DrgX đồng bộ với Web &amp; Dev Studio: Ion, Nebula, Tokyo, Matrix, Dawn.</p>
    </div>
    <div class="card" onclick="cmd('learn')">
      <h3>🎓 Hệ sinh thái học tập (Ctrl+Alt+L)</h3>
      <p>Lộ trình 12 tuần, CLB theo sprint, showcase và tài liệu giáo viên.</p>
    </div>
  </div>
  <div class="meta">
    Phòng hiện tại: <b>${code}</b> &nbsp;|&nbsp; Exam Server: <b>${srv}</b> &nbsp;|&nbsp; Skin: <b>${skin}</b>
  </div>
  <script>
    const vscode = acquireVsCodeApi();
    function cmd(c){ vscode.postMessage({ command: c }); }

    const overlay = document.getElementById('introOverlay');
    const video = document.getElementById('introVideo');
    const fallback = document.getElementById('introFallback');
    const bar = document.getElementById('introBar');
    const stepEl = document.getElementById('introStep');
    const pctEl = document.getElementById('introPct');
    let introTimer = null;
    let tickTimer = null;

    function closeIntro() {
      if (!overlay || overlay.classList.contains('hidden')) return;
      overlay.classList.add('hidden');
      if (video) { try { video.pause(); } catch(e){} }
      if (introTimer) clearTimeout(introTimer);
      if (tickTimer) clearInterval(tickTimer);
    }

    function startIntroSequence() {
      if (!overlay) return;
      overlay.classList.remove('hidden');
      let progress = 0;
      if (bar) bar.style.width = '0%';
      if (pctEl) pctEl.textContent = '0%';
      if (stepEl) stepEl.textContent = '[1/3] Khởi tạo Local C++17 & Python Judge Engine...';

      if (video) {
        video.style.display = 'block';
        if (fallback) fallback.style.display = 'none';
        try {
          video.currentTime = 0;
          const p = video.play();
          if (p && p.catch) p.catch(() => {
            video.style.display = 'none';
            if (fallback) fallback.style.display = 'block';
          });
        } catch(e) {
          video.style.display = 'none';
          if (fallback) fallback.style.display = 'block';
        }
      }

      if (tickTimer) clearInterval(tickTimer);
      tickTimer = setInterval(() => {
        progress = Math.min(100, progress + 4);
        if (bar) bar.style.width = progress + '%';
        if (pctEl) pctEl.textContent = progress + '%';
        if (progress === 36 && stepEl) stepEl.textContent = '[2/3] Đồng bộ 5 Skins Chuyên nghiệp & Classroom Server...';
        if (progress === 76 && stepEl) stepEl.textContent = '[3/3] Sẵn sàng không gian thi đấu DrgX CP Studio!';
        if (progress >= 100) clearInterval(tickTimer);
      }, 120);

      if (introTimer) clearTimeout(introTimer);
      introTimer = setTimeout(closeIntro, 3600);
    }

    function replayIntro() { startIntroSequence(); }

    if (video) {
      video.addEventListener('ended', closeIntro);
      video.addEventListener('error', () => {
        video.style.display = 'none';
        if (fallback) fallback.style.display = 'block';
      });
    }

    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') closeIntro();
    });

    if (${showIntro ? 'true' : 'false'}) {
      startIntroSequence();
    }
  </script>
</body></html>`;
}

function openHome(context, showIntro = true) {
  if (homePanel) {
    homePanel.webview.html = renderHomeHtml(homePanel.webview, showIntro);
    homePanel.reveal();
    return;
  }
  homePanel = vscode.window.createWebviewPanel(
    'drgxCpHome',
    'DrgX CP — Trang chủ',
    vscode.ViewColumn.One,
    {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.file(path.join(__dirname, 'media'))]
    }
  );
  homePanel.webview.html = renderHomeHtml(homePanel.webview, showIntro);
  homePanel.webview.onDidReceiveMessage(msg => {
    if (msg.command === 'judge') vscode.commands.executeCommand('drgxCp.judge');
    if (msg.command === 'judgePanel') vscode.commands.executeCommand('drgxCp.judgePanel');
    if (msg.command === 'joinExam') vscode.commands.executeCommand('drgxCp.joinExam');
    if (msg.command === 'submit') vscode.commands.executeCommand('drgxCp.submit');
    if (msg.command === 'createExam') vscode.commands.executeCommand('drgxCp.createExam');
    if (msg.command === 'skin') vscode.commands.executeCommand('drgxCp.skin');
    if (msg.command === 'learn') vscode.commands.executeCommand('drgxCp.learn');
  }, undefined, context.subscriptions);
  homePanel.onDidDispose(() => { homePanel = null; });
}

function activate(context) {
  output = vscode.window.createOutputChannel('DrgX CP Judge');
  statusItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  judgeView.init(context, {
    rerun: () => {
      if (lastAction === 'server') return submit(lastTarget);
      return judge(lastTarget);
    },
    openLog: () => output.show(true),
    copy: async current => {
      await vscode.env.clipboard.writeText(formatSummary(current));
      vscode.window.showInformationMessage('DrgX Judge: đã sao chép kết quả vào clipboard.');
    }
  });
  context.subscriptions.push(
    output,
    statusItem,
    vscode.commands.registerCommand('drgxCp.judge', () => judge()),
    vscode.commands.registerCommand('drgxCp.judgePanel', () => judgeView.reveal()),
    vscode.commands.registerCommand('drgxCp.joinExam', joinExam),
    vscode.commands.registerCommand('drgxCp.createExam', createExam),
    vscode.commands.registerCommand('drgxCp.submit', () => submit()),
    vscode.commands.registerCommand('drgxCp.skin', chooseSkin),
    vscode.commands.registerCommand('drgxCp.learn', openLearnHub),
    vscode.commands.registerCommand('drgxCp.intro', () => openHome(context, true)),
    vscode.commands.registerCommand('drgxCp.home', () => openHome(context, false))
  );
  updateStatus();
  setTimeout(() => openHome(context, true), 600);
}

function deactivate() {}

module.exports = {
  activate,
  deactivate,
  runThemisAndStaticGuard,
  formatReceiptShort
};
