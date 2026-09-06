#!/usr/bin/env node
/*
 * gen-help.js — генератор контента панели «Справка».
 *
 * Источник истины — text.md в корне репозитория. Скрипт разбивает его на разделы
 * по заголовкам `# ...`, конвертирует тело каждого раздела из Markdown в HTML и
 * вставляет получившийся массив SECTIONS в mindmap/js/help.js между маркерами
 *   BEGIN GENERATED SECTIONS ... END GENERATED SECTIONS
 *
 * Запуск (из любого каталога):  node mindmap/tools/gen-help.js
 * После правки text.md — перезапустить и закоммитить обновлённый help.js.
 *
 * Зависимостей нет. Поддерживаемое подмножество Markdown соответствует тому, что
 * реально встречается в text.md: абзацы с жёсткими переносами (обратный слэш в
 * конце строки), списки "- ", инлайновые и блочные картинки, ссылки, полужирный
 * и курсив, ограждённые блоки кода (три обратных апострофа).
 */

'use strict';

var fs = require('fs');
var path = require('path');

var ROOT = path.join(__dirname, '..', '..');
var SRC = path.join(ROOT, 'text.md');
var HELP = path.join(__dirname, '..', 'js', 'help.js');

var BEGIN = '/* BEGIN GENERATED SECTIONS';
var END = '/* END GENERATED SECTIONS */';

/* ---------- Markdown → HTML ---------- */

function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Путь картинки в text.md дан от корня репозитория (mindmap/assets/...),
// а help.js исполняется из mindmap/index.html — убираем ведущий mindmap/.
function fixUrl(url) {
  return url.trim().replace(/^mindmap\//, '');
}

// Инлайновая разметка внутри строки. Сначала экранируем спецсимволы, затем
// восстанавливаем картинки/ссылки/эмфазу.
function inline(text) {
  var s = escapeHtml(text);

  s = s.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, function (m, alt, url) {
    return '<img class="help-article-icon" src="' + fixUrl(url) + '" alt="' + escapeHtml(alt) + '">';
  });
  s = s.replace(/\[([^\]]*)\]\(([^)]+)\)/g, function (m, txt, url) {
    return '<a class="help-inline-link" href="' + fixUrl(url) + '" target="_blank" rel="noopener">' + txt + '</a>';
  });

  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/__([^_]+)__/g, '<strong>$1</strong>');
  s = s.replace(/\*([^*]+)\*/g, '<em>$1</em>');

  // Пустые «()» — незавершённый артефакт в тексте, убираем вместе с пробелом.
  s = s.replace(/\s*\(\)/g, '');

  return s;
}

var RE_LI = /^\s*-\s+(.*)$/;
var RE_FENCE = /^\s*```/;
var RE_IMG_ONLY = /^!\[([^\]]*)\]\(([^)]+)\)\\?\s*$/;

function stripBreak(line) {
  return line.replace(/\\\s*$/, '');
}
function hasBreak(line) {
  return /\\\s*$/.test(line);
}

// Тело раздела (массив строк) → HTML.
function bodyToHtml(lines) {
  var out = [];
  var para = [];

  function flushPara() {
    if (!para.length) { return; }
    var parts = para.map(function (ln, idx) {
      var t = inline(stripBreak(ln));
      if (idx === para.length - 1) { return t; }
      return t + (hasBreak(ln) ? '<br>' : ' ');
    });
    out.push('<p>' + parts.join('') + '</p>');
    para = [];
  }

  var i = 0;
  while (i < lines.length) {
    var line = lines[i];

    if (RE_FENCE.test(line)) {
      flushPara();
      var buf = [];
      i++;
      while (i < lines.length && !RE_FENCE.test(lines[i])) { buf.push(lines[i]); i++; }
      i++; // закрывающий ```
      out.push('<pre class="help-article-pre">' + escapeHtml(buf.join('\n')) + '</pre>');
      continue;
    }

    if (RE_LI.test(line)) {
      flushPara();
      var items = [];
      while (i < lines.length && RE_LI.test(lines[i])) {
        items.push('<li>' + inline(stripBreak(RE_LI.exec(lines[i])[1])) + '</li>');
        i++;
      }
      out.push('<ul>' + items.join('') + '</ul>');
      continue;
    }

    if (line.trim() === '') { flushPara(); i++; continue; }

    var imgOnly = RE_IMG_ONLY.exec(line.trim());
    if (imgOnly) {
      flushPara();
      out.push(
        '<p class="help-article-figure">' +
          '<img class="help-article-img" src="' + fixUrl(imgOnly[2]) + '" alt="' + escapeHtml(imgOnly[1]) + '">' +
        '</p>'
      );
      i++;
      continue;
    }

    para.push(line);
    i++;
  }
  flushPara();

  return out.join('\n');
}

/* ---------- Разбор text.md на разделы ---------- */

function parseTopics(md) {
  var lines = md.replace(/\r\n/g, '\n').split('\n');
  var topics = [];
  var cur = null;
  lines.forEach(function (line) {
    var h = /^#\s+(.+?)\s*$/.exec(line);
    if (h) {
      cur = { title: h[1], body: [] };
      topics.push(cur);
    } else if (cur) {
      cur.body.push(line);
    }
    // строки до первого заголовка игнорируем
  });
  return topics;
}

/* ---------- Сериализация в JS-литерал ---------- */

function jsString(s) {
  return "'" + String(s)
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\r/g, '')
    .replace(/\n/g, '\\n') + "'";
}

function buildSectionsLiteral(topics) {
  var entries = topics.map(function (t, idx) {
    var id = 'topic-' + (idx + 1);
    var bodyHtml = bodyToHtml(t.body);
    return '' +
      '    {\n' +
      '      id: ' + jsString(id) + ',\n' +
      '      title: ' + jsString(t.title) + ',\n' +
      '      bodyHtml: ' + jsString(bodyHtml) + '\n' +
      '    }';
  });
  return '[\n' + entries.join(',\n') + '\n  ]';
}

/* ---------- Точка входа ---------- */

function main() {
  var md = fs.readFileSync(SRC, 'utf8');
  var topics = parseTopics(md);
  if (!topics.length) {
    throw new Error('gen-help: в ' + SRC + ' не найдено ни одного заголовка «# ...»');
  }

  var help = fs.readFileSync(HELP, 'utf8');
  var bi = help.indexOf(BEGIN);
  var ei = help.indexOf(END);
  if (bi < 0 || ei < 0 || ei < bi) {
    throw new Error('gen-help: в ' + HELP + ' не найдены маркеры BEGIN/END GENERATED SECTIONS');
  }

  // Сохраняем стиль переноса строк, уже принятый в файле (help.js — CRLF).
  var eol = help.indexOf('\r\n') >= 0 ? '\r\n' : '\n';

  var block = (
    BEGIN + ' — сгенерировано mindmap/tools/gen-help.js из text.md.\n' +
    '     НЕ РЕДАКТИРОВАТЬ ВРУЧНУЮ: правьте text.md и перезапускайте генератор. */\n' +
    '  var SECTIONS = ' + buildSectionsLiteral(topics) + ';\n' +
    '  ' + END
  ).replace(/\n/g, eol);

  var next = help.slice(0, bi) + block + help.slice(ei + END.length);
  if (next === help) {
    console.log('gen-help: без изменений (' + topics.length + ' разделов).');
    return;
  }
  fs.writeFileSync(HELP, next);

  console.log('gen-help: записано ' + topics.length + ' разделов в ' + path.relative(ROOT, HELP) + ':');
  topics.forEach(function (t, idx) {
    console.log('  ' + (idx + 1) + '. ' + t.title);
  });
}

main();
