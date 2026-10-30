(function () {
  var REPLACEMENTS = [
    ["Visual Studio Code", "DrgX IDE"],
    ["Visual Studio", "DrgX"],
    ["Editing evolved", "Lập trình đã tiến hóa"],
    ["VS Code", "DrgX"],
    // Không gán tên DrgX cho sản phẩm bên thứ ba; chỉ trung hòa nhãn gốc.
    ["Microsoft Corporation", "Nhà phát triển gốc"],
    ["Microsoft", "Bên thứ ba"],
    ["Code - OSS", "DrgX IDE"]
  ];
  function hasMatch(s) {
    for (var i = 0; i < REPLACEMENTS.length; i++) {
      if (s.indexOf(REPLACEMENTS[i][0]) !== -1) return true;
    }
    return false;
  }
  function scrubString(s) {
    for (var i = 0; i < REPLACEMENTS.length; i++) {
      s = s.split(REPLACEMENTS[i][0]).join(REPLACEMENTS[i][1]);
    }
    return s;
  }
  function isProtected(node) {
    var p = node.parentElement;
    if (!p) return true;
    return !!p.closest(
      ".monaco-editor, .xterm, .terminal, .chat-codeblock, input, textarea, .native-edit-context"
    );
  }
  function scrubSubtree(node) {
    if (node.nodeType === 3) {
      if (node.nodeValue && hasMatch(node.nodeValue) && !isProtected(node)) {
        node.nodeValue = scrubString(node.nodeValue);
      }
      return;
    }
    if (node.nodeType !== 1) return;
    var walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT, null);
    var n;
    while ((n = walker.nextNode())) {
      if (n.nodeValue && hasMatch(n.nodeValue) && !isProtected(n)) {
        n.nodeValue = scrubString(n.nodeValue);
      }
    }
  }
  function scrubTitle() {
    if (document.title && hasMatch(document.title)) {
      document.title = scrubString(document.title);
    }
  }
  var queue = [];
  var scheduled = false;
  function flush() {
    scheduled = false;
    scrubTitle();
    var items = queue;
    queue = [];
    for (var i = 0; i < items.length; i++) scrubSubtree(items[i]);
  }
  function schedule(node) {
    queue.push(node);
    if (!scheduled) {
      scheduled = true;
      setTimeout(flush, 250);
    }
  }
  var observer = new MutationObserver(function (muts) {
    for (var i = 0; i < muts.length; i++) {
      var m = muts[i];
      if (m.type === "characterData") {
        schedule(m.target);
      } else {
        for (var j = 0; j < m.addedNodes.length; j++) schedule(m.addedNodes[j]);
      }
    }
  });
  function boot() {
    scrubTitle();
    if (document.body) {
      scrubSubtree(document.body);
      observer.observe(document.body, {
        childList: true, subtree: true, characterData: true
      });
    }
    setInterval(scrubTitle, 1000);
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
