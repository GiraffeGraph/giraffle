export const EDITOR_HTML = `<!doctype html>
<html>
<head>
  <meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">
  <style>
    :root { color-scheme: light dark; }
    * { box-sizing: border-box; }
    html, body { min-height: 100%; margin: 0; background: transparent; }
    body {
      color: var(--ink);
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      font-size: 16px;
      line-height: 1.65;
      -webkit-text-size-adjust: 100%;
    }
    #editor {
      outline: none;
      min-height: 68vh;
      padding: 2px 0 180px;
      white-space: pre-wrap;
      overflow-wrap: anywhere;
      caret-color: var(--ink);
    }
    #editor:empty::before { content: 'Start writing…'; color: var(--muted); }
    #editor:focus { outline: none; }
    a { color: var(--link); }
  </style>
</head>
<body>
  <div id="editor" contenteditable="true" role="textbox" aria-label="Page content" aria-multiline="true"></div>
  <script>
    (function () {
      var editor = document.getElementById('editor');
      var currentDocument = { type: 'doc', content: [] };
      var initialized = false;

      function post(message) {
        window.ReactNativeWebView.postMessage(JSON.stringify(message));
      }

      function makeId() {
        if (window.crypto && typeof window.crypto.randomUUID === 'function') {
          return window.crypto.randomUUID();
        }
        return 'mobile-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 12);
      }

      function nodeText(node) {
        if (typeof node.text === 'string') return node.text;
        return (node.content || []).map(nodeText).join('');
      }

      function render(documentValue) {
        currentDocument = documentValue || { type: 'doc', content: [] };
        editor.innerText = (currentDocument.content || []).map(nodeText).join('\\n\\n');
      }

      function textContent(line, priorTextNode) {
        if (!line) return [];
        var next = { type: 'text', text: line };
        if (priorTextNode && priorTextNode.marks) next.marks = priorTextNode.marks;
        return [next];
      }

      function updateSimpleNode(prior, line, id) {
        if (!prior) {
          return { type: 'paragraph', attrs: { id: id }, content: textContent(line) };
        }
        if (line === nodeText(prior)) return prior;
        if (prior.type === 'paragraph' || prior.type === 'heading') {
          return Object.assign({}, prior, {
            attrs: Object.assign({}, prior.attrs || {}, { id: id }),
            content: textContent(line, prior.content && prior.content[0])
          });
        }
        if (prior.type === 'taskItem') {
          var priorParagraph = prior.content && prior.content[0];
          return Object.assign({}, prior, {
            attrs: Object.assign({}, prior.attrs || {}, { id: id }),
            content: [{
              type: 'paragraph',
              attrs: priorParagraph && priorParagraph.attrs,
              content: textContent(line, priorParagraph && priorParagraph.content && priorParagraph.content[0])
            }]
          });
        }
        return { type: 'paragraph', attrs: { id: id }, content: textContent(line) };
      }

      function readDocument() {
        var previous = currentDocument.content || [];
        var lines = editor.innerText.split(/\\n{2,}/);
        if (lines.length === 1 && lines[0] === '') lines = [''];
        return {
          type: 'doc',
          content: lines.map(function (line, index) {
            var prior = previous[index];
            var priorId = prior && prior.attrs && prior.attrs.id;
            return updateSimpleNode(prior, line, priorId || makeId());
          })
        };
      }

      function emitDocument() {
        if (!initialized) return;
        currentDocument = readDocument();
        post({
          type: 'document-change',
          bridgeVersion: 1,
          document: currentDocument
        });
      }

      editor.addEventListener('input', emitDocument);
      editor.addEventListener('blur', function () {
        emitDocument();
        post({ type: 'focus-change', bridgeVersion: 1, focused: false });
      });
      editor.addEventListener('focus', function () {
        post({ type: 'focus-change', bridgeVersion: 1, focused: true });
      });
      window.addEventListener('error', function (event) {
        post({
          type: 'bridge-error',
          bridgeVersion: 1,
          message: String(event.message || 'Editor error').slice(0, 300)
        });
      });

      window.GiraffleEditor = {
        init: function (payload) {
          document.documentElement.style.setProperty('--ink', payload.theme.text);
          document.documentElement.style.setProperty('--muted', payload.theme.muted);
          document.documentElement.style.setProperty('--link', payload.theme.link);
          render(payload.document);
          initialized = true;
        }
      };

      post({ type: 'ready', bridgeVersion: 1 });
    })();
  </script>
</body>
</html>`;
