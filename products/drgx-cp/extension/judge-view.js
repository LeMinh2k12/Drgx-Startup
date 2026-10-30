const vscode = require('vscode');
const fs = require('fs');
const path = require('path');

let panel = null;
let handlers = {};
let extensionUri = null;
let state = emptyState();

function emptyState() {
  return {
    phase: 'idle',
    mode: 'local',
    source: '',
    sourcePath: '',
    examCode: '',
    startedAt: 0,
    finishedAt: 0,
    compile: { status: 'idle', message: '', ms: 0 },
    progress: { completed: 0, total: 0 },
    tests: [],
    summary: { verdict: '', ac: 0, total: 0, totalMs: 0 },
    message: ''
  };
}

function init(context, nextHandlers) {
  extensionUri = context.extensionUri;
  handlers = nextHandlers || {};
}

function buildHtml(webview) {
  const media = vscode.Uri.joinPath(extensionUri, 'media');
  const uri = file => webview.asWebviewUri(vscode.Uri.joinPath(media, file)).toString();
  const csp = [
    "default-src 'none'",
    `img-src ${webview.cspSource} data:`,
    `style-src ${webview.cspSource} 'unsafe-inline'`,
    `script-src ${webview.cspSource}`,
    `font-src ${webview.cspSource}`
  ].join('; ');
  const shell = fs.readFileSync(path.join(extensionUri.fsPath, 'media', 'judge.html'), 'utf8');
  return shell
    .replace(/\{\{csp\}\}/g, csp)
    .replace(/\{\{css\}\}/g, uri('judge.css'))
    .replace(/\{\{js\}\}/g, uri('judge.js'))
    .replace(/\{\{logo\}\}/g, uri('drgx-cp.png'));
}

function post() {
  if (!panel) return;
  panel.webview.postMessage({ type: 'state', state });
}

function ensurePanel() {
  if (panel) return panel;
  panel = vscode.window.createWebviewPanel(
    'drgxCp.judgeView',
    'DrgX Judge',
    vscode.ViewColumn.Beside,
    {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'media')]
    }
  );
  panel.webview.html = buildHtml(panel.webview);
  panel.webview.onDidReceiveMessage(message => {
    if (!message || typeof message !== 'object') return;
    if (message.type === 'ready') {
      post();
      return;
    }
    if (message.type !== 'command') return;
    if (message.command === 'rerun' && handlers.rerun) handlers.rerun();
    if (message.command === 'openLog' && handlers.openLog) handlers.openLog();
    if (message.command === 'copy' && handlers.copy) handlers.copy(state);
  });
  panel.onDidDispose(() => {
    panel = null;
  });
  return panel;
}

function show(next) {
  if (next) state = { ...state, ...next };
  const p = ensurePanel();
  p.reveal(p.viewColumn || vscode.ViewColumn.Beside, true);
  post();
}

function update(next) {
  state = { ...state, ...next };
  post();
}

function reveal() {
  if (!panel) {
    show();
    return;
  }
  panel.reveal(panel.viewColumn || vscode.ViewColumn.Beside, true);
  post();
}

function current() {
  return state;
}

exports.init = init;
exports.show = show;
exports.update = update;
exports.reveal = reveal;
exports.current = current;
exports.emptyState = emptyState;
