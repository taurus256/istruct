/*
 * markdown.js — компактный конвертер Markdown → HTML (без внешних библиотек),
 * общий для панели заметок (частично) и панели тестов.
 *
 * Модуль намеренно поддерживает ровно тот же ограниченный набор конструкций,
 * что и редактор заметок:
 *   - заголовки  #.. (h1..h6)
 *   - списки     - / *  (маркированный),  N.  (нумерованный)
 *   - инлайн     **bold** / __bold__,  *italic* / _italic_,  <u>underline</u>,
 *                [текст](url),  ![alt](url)
 *   - абзацы     прочие непустые строки
 *
 * Экранирование HTML-спецсимволов (&<>) выполняется для «сырого» текста, поэтому
 * произвольный HTML из данных не попадает в разметку (кроме разрешённого <u>).
 *
 * Не использует ES-модули — открывается через file:// обычным <script>.
 */

var Markdown = (function () {

  // Экранирование HTML-спецсимволов для «сырого» текста.
  function escapeHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // Инлайновые Markdown-конструкции внутри одной строки → HTML.
  // Порядок важен: сначала экранируем спецсимволы, затем восстанавливаем
  // разрешённый <u>, затем изображения/ссылки, затем bold/italic.
  function inline(text) {
    var s = escapeHtml(text);

    // Разрешённый inline-HTML <u>...</u> (в escapeHtml он стал &lt;u&gt;).
    s = s.replace(/&lt;u&gt;/g, '<u>').replace(/&lt;\/u&gt;/g, '</u>');

    // Изображения ![alt](url) — раньше ссылок, т.к. синтаксис пересекается.
    s = s.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, function (m, alt, url) {
      return '<img src="' + url + '" alt="' + alt + '">';
    });
    // Ссылки [text](url)
    s = s.replace(/\[([^\]]*)\]\(([^)]+)\)/g, function (m, txt, url) {
      return '<a href="' + url + '" target="_blank" rel="noopener">' + txt + '</a>';
    });

    // Полужирный **x** или __x__
    s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    s = s.replace(/__([^_]+)__/g, '<strong>$1</strong>');
    // Курсив *x* или _x_
    s = s.replace(/\*([^*]+)\*/g, '<em>$1</em>');
    s = s.replace(/_([^_]+)_/g, '<em>$1</em>');

    return s;
  }

  // Markdown → HTML. Построчно: заголовки, списки в <ul>/<ol>, прочие
  // непустые строки — в <p>. Пустые строки разделяют блоки.
  function toHtml(md) {
    var lines = String(md == null ? '' : md).replace(/\r\n/g, '\n').split('\n');
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
        html.push('<h' + level + '>' + inline(headingMatch[2]) + '</h' + level + '>');
      } else if (ulMatch) {
        if (listType !== 'ul') { closeList(); html.push('<ul>'); listType = 'ul'; }
        html.push('<li>' + inline(ulMatch[1]) + '</li>');
      } else if (olMatch) {
        if (listType !== 'ol') { closeList(); html.push('<ol>'); listType = 'ol'; }
        html.push('<li>' + inline(olMatch[1]) + '</li>');
      } else if (line.trim() === '') {
        closeList();
      } else {
        closeList();
        html.push('<p>' + inline(line) + '</p>');
      }
    });
    closeList();

    return html.join('');
  }

  // Markdown → простой текст (для компактного отображения, напр. в блоке
  // «Wrong Answers»): снимаем разметку, оставляя человекочитаемый текст.
  function toPlainText(md) {
    var s = String(md == null ? '' : md).replace(/\r\n/g, '\n');
    s = s.replace(/^\s*#{1,6}\s+/gm, '');          // заголовки
    s = s.replace(/^\s*[-*]\s+/gm, '');            // маркеры списков
    s = s.replace(/^\s*\d+\.\s+/gm, '');           // нумерация списков
    s = s.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '$1'); // изображения → alt
    s = s.replace(/\[([^\]]*)\]\(([^)]+)\)/g, '$1');  // ссылки → текст
    s = s.replace(/<\/?u>/g, '');                  // <u>
    s = s.replace(/\*\*([^*]+)\*\*/g, '$1').replace(/__([^_]+)__/g, '$1'); // bold
    s = s.replace(/\*([^*]+)\*/g, '$1').replace(/_([^_]+)_/g, '$1');       // italic
    s = s.replace(/\n+/g, ' ').trim();
    return s;
  }

  return {
    toHtml: toHtml,
    toPlainText: toPlainText
  };
})();
