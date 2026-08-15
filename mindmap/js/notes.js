/*
 * notes.js — боковая панель «Заметки».
 *
 * Кнопка #btn-notes в тулбаре — МОДАЛЬНЫЙ переключатель: пока режим активен,
 * панель видна и всегда отражает ТЕКУЩИЙ выделенный узел (Render.getSelectedId()).
 * Заметка хранится как атрибут узла node.data.note (Markdown-строка), см. model.js.
 *
 * Два режима редактирования:
 *   - 'source'  — правка Markdown-исходника в <textarea id="notes-source">;
 *   - 'visual'  — визуальная правка в <div id="notes-visual" contenteditable>.
 * Кнопка #notes-mode-toggle переключает режим и конвертирует содержимое через
 * пару компактных конвертеров mdToHtml()/htmlToMd() (без внешних библиотек).
 *
 * Модуль не использует ES-модули — открывается через file:// обычным <script>.
 */

var Notes = (function () {
  var active = false;
  var mode = 'source'; // 'source' | 'visual'
  var currentNodeId = null;
  var saveTimer = null;
  var SAVE_DEBOUNCE_MS = 350;

  // DOM-ссылки (заполняются в init()).
  var panelEl = null;
  var toolbarEl = null;
  var sourceEl = null;    // <textarea>
  var visualEl = null;    // contenteditable <div>
  var btnNotes = null;    // ribbon-кнопка #btn-notes
  var modeToggleEl = null;

  /* ============================ Инициализация ============================ */

  function init() {
    panelEl = document.getElementById('notes-panel');
    toolbarEl = document.getElementById('notes-toolbar');
    sourceEl = document.getElementById('notes-source');
    visualEl = document.getElementById('notes-visual');
    btnNotes = document.getElementById('btn-notes');
    modeToggleEl = document.getElementById('notes-mode-toggle');

    if (!panelEl) {
      return; // разметки нет — модуль неактивен
    }

    // Кнопка закрытия в шапке панели — эквивалент выключения режима.
    var closeBtn = document.getElementById('notes-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', function () {
        setActive(false);
      });
    }

    // Кнопки форматирования (data-cmd), кроме кнопки переключения режима.
    if (toolbarEl) {
      toolbarEl.addEventListener('click', function (e) {
        var btn = e.target.closest ? e.target.closest('button[data-cmd]') : null;
        if (!btn) {
          return;
        }
        applyFormat(btn.getAttribute('data-cmd'));
      });
    }

    if (modeToggleEl) {
      modeToggleEl.addEventListener('click', toggleMode);
    }

    // Ввод в любом из редакторов — отложенное сохранение.
    if (sourceEl) {
      sourceEl.addEventListener('input', scheduleSave);
    }
    if (visualEl) {
      visualEl.addEventListener('input', scheduleSave);
      // Плейсхолдер через CSS :empty; убеждаемся, что пустой редактор реально
      // пуст (без <br>), чтобы :empty срабатывал.
      visualEl.addEventListener('blur', normalizeVisualIfEmpty);
    }

    updateModeClass();
  }

  /* ========================= Модальный переключатель ===================== */

  function toggle() {
    setActive(!active);
  }

  function setActive(next) {
    if (active === next) {
      return;
    }
    if (!next) {
      // Перед закрытием сохраняем текущую заметку.
      saveCurrent();
    }
    active = next;

    if (panelEl) {
      panelEl.hidden = !active;
    }
    if (btnNotes) {
      btnNotes.classList.toggle('ribbon-btn--selected', active);
    }

    if (active) {
      loadNode(Render.getSelectedId());
    } else {
      currentNodeId = null;
    }
  }

  function isActive() {
    return active;
  }

  /* ===================== Реакция на смену выделения ====================== */

  // Вызывается из app.js (через Render.setOnSelectionChange). Сохраняет заметку
  // предыдущего узла и загружает заметку нового.
  function onSelectionChanged(id) {
    if (!active) {
      return;
    }
    if (id === currentNodeId) {
      return;
    }
    saveCurrent();
    loadNode(id);
  }

  // Загружает заметку узла id в редактор (в текущем режиме).
  function loadNode(id) {
    currentNodeId = (id != null) ? id : null;

    var md = '';
    if (currentNodeId != null) {
      var stored = Model.getNote(currentNodeId);
      md = (stored !== undefined && stored !== null) ? String(stored) : '';
    }

    var editable = currentNodeId != null;
    if (sourceEl) {
      sourceEl.value = md;
      sourceEl.disabled = !editable;
    }
    if (visualEl) {
      visualEl.innerHTML = md ? mdToHtml(md) : '';
      visualEl.setAttribute('contenteditable', editable ? 'true' : 'false');
    }
  }

  /* ============================ Сохранение ============================== */

  function scheduleSave() {
    if (saveTimer) {
      clearTimeout(saveTimer);
    }
    saveTimer = setTimeout(saveCurrent, SAVE_DEBOUNCE_MS);
  }

  // Сериализует текущее содержимое редактора в Markdown и пишет в модель.
  function saveCurrent() {
    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = null;
    }
    if (currentNodeId == null || !Model.getNode(currentNodeId)) {
      return;
    }
    var md = getEditorMarkdown();
    if (md.trim() === '') {
      Model.clearNote(currentNodeId);
    } else {
      Model.setNote(currentNodeId, md);
    }
    Storage.save();
  }

  // Возвращает текущее содержимое активного редактора как Markdown.
  function getEditorMarkdown() {
    if (mode === 'visual') {
      return visualEl ? htmlToMd(visualEl.innerHTML) : '';
    }
    return sourceEl ? sourceEl.value : '';
  }

  /* ======================= Переключение режимов ========================= */

  function toggleMode() {
    // Конвертируем содержимое из текущего режима в другой.
    if (mode === 'source') {
      var md = sourceEl ? sourceEl.value : '';
      if (visualEl) {
        visualEl.innerHTML = md ? mdToHtml(md) : '';
      }
      mode = 'visual';
    } else {
      var html = visualEl ? visualEl.innerHTML : '';
      if (sourceEl) {
        sourceEl.value = htmlToMd(html);
      }
      mode = 'source';
    }
    updateModeClass();
  }

  function updateModeClass() {
    if (panelEl) {
      panelEl.classList.toggle('notes-panel--visual', mode === 'visual');
      panelEl.classList.toggle('notes-panel--source', mode === 'source');
    }
    if (modeToggleEl) {
      // В визуальном режиме кнопка предлагает уйти в исходник и наоборот.
      modeToggleEl.textContent = (mode === 'visual') ? '</>' : 'Aa';
      modeToggleEl.title = (mode === 'visual')
        ? 'Показать Markdown-исходник'
        : 'Показать визуальный редактор';
    }
  }

  /* ========================= Форматирование ============================= */

  function applyFormat(cmd) {
    if (currentNodeId == null) {
      return; // нет узла — форматировать нечего
    }
    if (mode === 'visual') {
      applyVisualFormat(cmd);
    } else {
      applySourceFormat(cmd);
    }
    scheduleSave();
  }

  // Визуальный режим: используем execCommand над contenteditable.
  function applyVisualFormat(cmd) {
    if (!visualEl) {
      return;
    }
    visualEl.focus();
    switch (cmd) {
      case 'bold':
        document.execCommand('bold', false, null);
        break;
      case 'italic':
        document.execCommand('italic', false, null);
        break;
      case 'underline':
        document.execCommand('underline', false, null);
        break;
      case 'heading':
        // Тогл заголовка: если текущий блок уже h1..h6 — возвращаем в абзац,
        // иначе делаем h1. queryCommandValue('formatBlock') возвращает имя
        // блочного тега активной строки.
        var block = '';
        try { block = document.queryCommandValue('formatBlock') || ''; } catch (e) { block = ''; }
        var isHeading = /^h[1-6]$/.test(String(block).toLowerCase());
        document.execCommand('formatBlock', false, isHeading ? 'P' : 'H1');
        break;
      case 'ul':
        document.execCommand('insertUnorderedList', false, null);
        break;
      case 'ol':
        document.execCommand('insertOrderedList', false, null);
        break;
      case 'link':
        var url = window.prompt('URL ссылки:', 'https://');
        if (url) {
          document.execCommand('createLink', false, url);
        }
        break;
      case 'image':
        var src = window.prompt('URL изображения:', 'https://');
        if (src) {
          document.execCommand('insertImage', false, src);
        }
        break;
      default:
        break;
    }
  }

  // Markdown-режим: модифицируем выделение в <textarea> вручную.
  function applySourceFormat(cmd) {
    if (!sourceEl) {
      return;
    }
    sourceEl.focus();
    var start = sourceEl.selectionStart;
    var end = sourceEl.selectionEnd;
    var value = sourceEl.value;
    var sel = value.slice(start, end);

    var replacement = sel;
    var newStart = start;
    var newEnd = end;

    switch (cmd) {
      case 'bold':
        replacement = '**' + sel + '**';
        newStart = start + 2;
        newEnd = newStart + sel.length;
        break;
      case 'italic':
        replacement = '*' + sel + '*';
        newStart = start + 1;
        newEnd = newStart + sel.length;
        break;
      case 'underline':
        replacement = '<u>' + sel + '</u>';
        newStart = start + 3;
        newEnd = newStart + sel.length;
        break;
      case 'heading':
        // Заголовок работает построчно — расширяем выделение до границ строк,
        // чтобы тоглить префикс "# " целиком у каждой затронутой строки.
        var lineStart = value.lastIndexOf('\n', start - 1) + 1;
        var lineEndIdx = value.indexOf('\n', end);
        if (lineEndIdx === -1) { lineEndIdx = value.length; }
        var block = value.slice(lineStart, lineEndIdx);
        // Если все непустые строки уже заголовки — снимаем, иначе добавляем.
        var blockLines = block.split('\n');
        var allHeadings = blockLines.every(function (l) {
          return l.trim() === '' || /^#{1,6}\s+/.test(l);
        });
        var toggled = blockLines.map(function (l) {
          if (l.trim() === '') { return l; }
          return allHeadings ? l.replace(/^#{1,6}\s+/, '') : ('# ' + l);
        }).join('\n');
        sourceEl.value = value.slice(0, lineStart) + toggled + value.slice(lineEndIdx);
        sourceEl.setSelectionRange(lineStart, lineStart + toggled.length);
        return;
      case 'ul':
        replacement = prefixLines(sel || '', function () { return '- '; });
        newEnd = start + replacement.length;
        newStart = start;
        break;
      case 'ol':
        replacement = prefixLines(sel || '', function (i) { return (i + 1) + '. '; });
        newEnd = start + replacement.length;
        newStart = start;
        break;
      case 'link':
        var url = window.prompt('URL ссылки:', 'https://');
        if (!url) { return; }
        replacement = '[' + (sel || 'ссылка') + '](' + url + ')';
        newStart = start;
        newEnd = start + replacement.length;
        break;
      case 'image':
        var src = window.prompt('URL изображения:', 'https://');
        if (!src) { return; }
        replacement = '![' + (sel || 'изображение') + '](' + src + ')';
        newStart = start;
        newEnd = start + replacement.length;
        break;
      default:
        return;
    }

    sourceEl.value = value.slice(0, start) + replacement + value.slice(end);
    sourceEl.setSelectionRange(newStart, newEnd);
  }

  // Добавляет к каждой строке текста префикс, вычисляемый функцией makePrefix(index).
  function prefixLines(text, makePrefix) {
    var lines = (text === '') ? [''] : text.split('\n');
    return lines.map(function (line, i) {
      return makePrefix(i) + line;
    }).join('\n');
  }

  /* ===================== Конвертеры Markdown <-> HTML =================== */

  // Экранирование HTML-спецсимволов для «сырого» текста.
  function escapeHtml(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // Инлайновые Markdown-конструкции внутри одной строки → HTML.
  // Порядок важен: сначала экранируем спецсимволы, затем восстанавливаем
  // разрешённый <u>, затем изображения/ссылки, затем bold/italic.
  function inlineMdToHtml(text) {
    var s = escapeHtml(text);

    // Разрешённый inline-HTML <u>...</u> (в escapeHtml он стал &lt;u&gt;).
    s = s.replace(/&lt;u&gt;/g, '<u>').replace(/&lt;\/u&gt;/g, '</u>');

    // Изображения ![alt](url) — раньше ссылок, т.к. синтаксис пересекается.
    s = s.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, function (m, alt, url) {
      return '<img src="' + url + '" alt="' + alt + '">';
    });
    // Ссылки [text](url)
    s = s.replace(/\[([^\]]*)\]\(([^)]+)\)/g, function (m, txt, url) {
      return '<a href="' + url + '">' + txt + '</a>';
    });

    // Полужирный **x** или __x__
    s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    s = s.replace(/__([^_]+)__/g, '<strong>$1</strong>');
    // Курсив *x* или _x_
    s = s.replace(/\*([^*]+)\*/g, '<em>$1</em>');
    s = s.replace(/_([^_]+)_/g, '<em>$1</em>');

    return s;
  }

  // Markdown → HTML (для визуального редактора). Построчно: списки в <ul>/<ol>,
  // прочие непустые строки — в <p>. Пустые строки разделяют блоки.
  function mdToHtml(md) {
    var lines = String(md).replace(/\r\n/g, '\n').split('\n');
    var html = [];
    var listType = null; // 'ul' | 'ol' | null

    function closeList() {
      if (listType) {
        html.push('</' + listType + '>');
        listType = null;
      }
    }

    lines.forEach(function (line) {
      var headingMatch = /^\s*(#{1,6})\s+(.*)$/.exec(line);
      var ulMatch = /^\s*[-*]\s+(.*)$/.exec(line);
      var olMatch = /^\s*\d+\.\s+(.*)$/.exec(line);

      if (headingMatch) {
        closeList();
        var level = headingMatch[1].length; // количество '#' = уровень h1..h6
        html.push('<h' + level + '>' + inlineMdToHtml(headingMatch[2]) + '</h' + level + '>');
      } else if (ulMatch) {
        if (listType !== 'ul') { closeList(); html.push('<ul>'); listType = 'ul'; }
        html.push('<li>' + inlineMdToHtml(ulMatch[1]) + '</li>');
      } else if (olMatch) {
        if (listType !== 'ol') { closeList(); html.push('<ol>'); listType = 'ol'; }
        html.push('<li>' + inlineMdToHtml(olMatch[1]) + '</li>');
      } else if (line.trim() === '') {
        closeList();
      } else {
        closeList();
        html.push('<p>' + inlineMdToHtml(line) + '</p>');
      }
    });
    closeList();

    return html.join('');
  }

  // HTML → Markdown (сериализация визуального редактора). Обходим DOM-дерево
  // рекурсивно, покрывая наш набор тегов.
  function htmlToMd(html) {
    var container = document.createElement('div');
    container.innerHTML = html;

    var blocks = [];

    function inline(node) {
      var out = '';
      node.childNodes.forEach(function (child) {
        out += serializeInline(child);
      });
      return out;
    }

    function serializeInline(node) {
      if (node.nodeType === 3) { // текст
        return node.nodeValue;
      }
      if (node.nodeType !== 1) {
        return '';
      }
      var tag = node.tagName.toLowerCase();
      switch (tag) {
        case 'b':
        case 'strong':
          return '**' + inline(node) + '**';
        case 'i':
        case 'em':
          return '*' + inline(node) + '*';
        case 'u':
          return '<u>' + inline(node) + '</u>';
        case 'a':
          return '[' + inline(node) + '](' + (node.getAttribute('href') || '') + ')';
        case 'img':
          return '![' + (node.getAttribute('alt') || '') + '](' + (node.getAttribute('src') || '') + ')';
        case 'br':
          return '\n';
        default:
          return inline(node);
      }
    }

    // Обход блоков верхнего уровня.
    function walkBlock(node) {
      if (node.nodeType === 3) {
        var t = node.nodeValue.trim();
        if (t !== '') {
          blocks.push(inlineText(node.nodeValue));
        }
        return;
      }
      if (node.nodeType !== 1) {
        return;
      }
      var tag = node.tagName.toLowerCase();
      if (tag === 'ul' || tag === 'ol') {
        var idx = 0;
        node.childNodes.forEach(function (li) {
          if (li.nodeType === 1 && li.tagName.toLowerCase() === 'li') {
            idx += 1;
            var prefix = (tag === 'ul') ? '- ' : (idx + '. ');
            blocks.push(prefix + inline(li));
          }
        });
      } else if (/^h[1-6]$/.test(tag)) {
        // Заголовок hN → префикс из N решёток. В нашем редакторе
        // генерируется только h1, но поддерживаем любой уровень.
        var hInner = inline(node);
        if (hInner.trim() !== '') {
          blocks.push(new Array(parseInt(tag.slice(1), 10) + 1).join('#') + ' ' + hInner);
        }
      } else if (tag === 'p' || tag === 'div') {
        var inner = inline(node);
        if (inner.trim() !== '' || inner === '') {
          if (inner.trim() !== '') {
            blocks.push(inner);
          }
        }
      } else if (tag === 'br') {
        blocks.push('');
      } else {
        var s = serializeInline(node);
        if (s.trim() !== '') {
          blocks.push(s);
        }
      }
    }

    function inlineText(text) {
      return text.replace(/\s+/g, ' ').trim();
    }

    container.childNodes.forEach(walkBlock);

    return blocks.join('\n');
  }

  /* ============================ Вспомогательное ========================= */

  // Если в contenteditable остался «мусорный» <br>/пустой узел — очищаем,
  // чтобы CSS :empty корректно показал плейсхолдер.
  function normalizeVisualIfEmpty() {
    if (visualEl && visualEl.textContent.trim() === '' && !visualEl.querySelector('img')) {
      visualEl.innerHTML = '';
    }
  }

  return {
    init: init,
    toggle: toggle,
    isActive: isActive,
    onSelectionChanged: onSelectionChanged
  };
})();
