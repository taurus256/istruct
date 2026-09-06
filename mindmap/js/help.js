/*
 * help.js — встроенная справка приложения (панель #help-panel, СЛЕВА от диаграммы).
 *
 * Полностью самостоятельный независимый модуль: НЕ связан с координатором
 * общей боковой панели #side-panel (заметки/тест, см. app.js) — управляет
 * своей собственной левой панелью и своей кнопкой #btn-help-docs САМ, без
 * участия координатора. Обе панели (эта и #side-panel) могут быть открыты
 * одновременно и переключаются независимо.
 *
 * Контент — статичный HTML (НЕ Markdown, поэтому Markdown.toHtml не используется),
 * хранится прямо здесь как массив разделов { id, title, bodyHtml }.
 *
 * Не использует ES-модули — открывается через file:// обычным <script>.
 */

var Help = (function () {
  var panelEl = null;   // #help-panel
  var btnEl = null;     // #btn-help-docs
  var active = false;
  var currentSection = null; // null = оглавление, иначе id раздела

  var SECTIONS = [
    {
      id: 'scheme',
      title: 'Работа со схемой',
      bodyHtml: '' +
        '<p>Три типа узла: <b>Узел</b> (обычный), <b>Тест</b> (к нему привязывается тест),' +
        ' <b>Ссылка</b> (URL хранится в комментарии узла; переход — Ctrl+клик по тексту).</p>' +
        '<p>Создание — кнопки группы «Узлы» на тулбаре: добавляют дочерний узел к выделенному' +
        ' (или к корню, если ничего не выделено). У корня узлы растут в 4 направления.</p>' +
        '<p>Редактирование текста — двойной клик по узлу. При наведении на узел появляется' +
        ' панель: добавить потомка, комментарий, удалить. Кнопка «Выполнен» отмечает узел' +
        ' зелёной рамкой, «Удалить» — удаляет узел (дети переходят к его родителю).</p>' +
        '<p>Перемещение — drag&amp;drop к другому узлу (смена родителя) или на свободное место' +
        ' холста (ручная позиция). Панорамирование — зажать ЛКМ на пустом фоне и потянуть.</p>' +
        '<p>Кнопка «Панель» открывает заметки (Markdown, с переключением' +
        ' исходник/визуальный режим) или, для узла типа «Тест», прохождение теста' +
        ' (порог прохождения в процентах, история хранит только последнюю попытку).</p>' +
        '<p>Диаграмма сохраняется автоматически в браузере; «Импорт/Экспорт JSON» — перенос' +
        ' между сессиями, «Очистить» — необратимый сброс к одному узлу, «Тема» — светлая/тёмная.</p>'
    },
    {
      id: 'chat-llm',
      title: 'Работа с LLM в режиме чата',
      bodyHtml: '' +
        '<p>Обычный чат с LLM (ChatGPT, Claude и т.п.) может сгенерировать готовый JSON для' +
        ' импорта — без каких-либо специальных инструментов у модели.</p>' +
        '<p>Приложите к сообщению файл <b>DATA_FORMAT.md</b> — он описывает JSON-формат' +
        ' диаграммы (структура узла, типы, заметки, тесты) — и сформулируйте запрос.</p>' +
        '<div class="help-callout">Пример: «Вот описание формата (DATA_FORMAT.md). Сгенерируй' +
        ' диаграмму по теме «Основы фотосинтеза»: корень + 4–6 подтем, у двух — короткие' +
        ' заметки, у одной — тест на 3 вопроса. Верни готовый JSON целиком».</div>' +
        '<p>Полученный JSON сохраните в файл и импортируйте кнопкой «Импорт JSON».</p>' +
        '<p><a class="help-inline-link" href="DATA_FORMAT.md" download>Скачать DATA_FORMAT.md</a></p>'
    },
    {
      id: 'agent-llm',
      title: 'Работа с агентской LLM',
      bodyHtml: '' +
        '<p>Агентский режим (agent-режимы в IDE/чатах, кастомные ассистенты с файлами) в' +
        ' отличие от простого чата систематически следует пошаговой инструкции — подходит' +
        ' для более сложных и многошаговых правок существующей схемы.</p>' +
        '<p>Приложите агенту файл <b>SKILL.md</b> — пошаговую инструкцию: типовые операции' +
        ' (добавление/удаление/перемещение узла, заметки, тесты) и чек-лист проверки перед' +
        ' выдачей результата.</p>' +
        '<div class="help-callout">Пример: приложите SKILL.md и текущий JSON схемы, попросите' +
        ' агента «Добавь к узлу «Введение» тест на 5 вопросов и заметку с планом раздела».' +
        ' Агент вернёт полный обновлённый JSON.</div>' +
        '<p>Агент работает только с тем, что вы ему передали текстом — результат нужно' +
        ' вручную импортировать обратно. Новые типы узлов агент создавать не может.</p>' +
        '<p><a class="help-inline-link" href="SKILL.md" download>Скачать SKILL.md</a></p>'
    }
  ];

  /* ============================ Инициализация ============================ */

  function init() {
    panelEl = document.getElementById('help-panel');
    btnEl = document.getElementById('btn-help-docs');

    if (panelEl) {
      panelEl.addEventListener('click', onPanelClick);
    }
  }

  /* ============================ Открытие/закрытие ========================= */

  function toggle() {
    if (active) {
      close();
    } else {
      open();
    }
  }

  function open() {
    if (active) {
      return;
    }
    active = true;
    currentSection = null; // всегда начинаем с оглавления
    if (panelEl) {
      panelEl.hidden = false;
    }
    if (btnEl) {
      btnEl.classList.add('ribbon-btn--selected');
    }
    renderIndex();
  }

  function close() {
    if (!active) {
      return;
    }
    active = false;
    if (panelEl) {
      panelEl.hidden = true;
    }
    if (btnEl) {
      btnEl.classList.remove('ribbon-btn--selected');
    }
  }

  function isActive() {
    return active;
  }

  /* ============================ Рендер ==================================== */

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function headerHtml(title, showBack) {
    // Кнопка ✕ и коробка кнопки «назад» — по эталону правой панели
    // (.notes-panel__close): иконка вместо текстового глифа, см. layout.css.
    var backBtn = showBack
      ? '<button type="button" class="help-panel__back" data-action="back" title="К оглавлению"><img src="assets/icons/small/chevron-left.svg" alt=""></button>'
      : '';
    return '' +
      '<div class="side-view__header">' +
        backBtn +
        '<span class="side-view__glyph"><img src="assets/icons/book.svg" alt=""></span>' +
        '<span class="side-view__title">' + esc(title) + '</span>' +
        '<button type="button" class="help-panel__close" data-action="close" title="Закрыть панель"><img src="assets/icons/notes-close.svg" alt=""></button>' +
      '</div>';
  }

  function renderIndex() {
    if (!panelEl) {
      return;
    }
    var cardsHtml = SECTIONS.map(function (s) {
      return '<button type="button" class="help-card" data-action="open-section" data-section="' + s.id + '">' +
        '<span class="help-card__title">' + esc(s.title) + '</span>' +
        '<span class="help-card__arrow"><img src="assets/icons/small/chevron-right.svg" alt=""></span>' +
      '</button>';
    }).join('');

    var filesHtml = '' +
      '<a class="help-file-card" href="DATA_FORMAT.md" download>' +
        '<svg class="help-file-card__icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">' +
          '<path d="M12 4.9992V19.0008M4.99921 12L12 19.0008L19.0008 12" stroke="currentColor" stroke-linecap="round"/>' +
        '</svg>' +
        '<span class="help-file-card__text">' +
          '<span class="help-file-card__title">DATA_FORMAT.md</span>' +
          '<span class="help-file-card__desc">Формат данных для чат-LLM</span>' +
        '</span>' +
      '</a>' +
      '<a class="help-file-card" href="SKILL.md" download>' +
        '<svg class="help-file-card__icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">' +
          '<path d="M12 4.9992V19.0008M4.99921 12L12 19.0008L19.0008 12" stroke="currentColor" stroke-linecap="round"/>' +
        '</svg>' +
        '<span class="help-file-card__text">' +
          '<span class="help-file-card__title">SKILL.md</span>' +
          '<span class="help-file-card__desc">Инструкция для агентской LLM</span>' +
        '</span>' +
      '</a>';

    panelEl.innerHTML =
      headerHtml('Справка', false) +
      '<div class="test-body">' +
        '<div class="help-card-list">' + cardsHtml + '</div>' +
        '<div class="help-card-list help-card-list--files">' + filesHtml + '</div>' +
      '</div>';
    currentSection = null;
  }

  function renderSection(id) {
    var section = SECTIONS.filter(function (s) { return s.id === id; })[0];
    if (!section) {
      renderIndex();
      return;
    }
    panelEl.innerHTML =
      headerHtml(section.title, true) +
      '<div class="test-body">' +
        '<div class="help-article-title">' + esc(section.title) + '</div>' +
        '<div class="test-divider"></div>' +
        '<div class="help-article-body">' + section.bodyHtml + '</div>' +
      '</div>';
    currentSection = id;
  }

  /* ============================ Клики ====================================== */

  function onPanelClick(e) {
    var actionEl = e.target.closest ? e.target.closest('[data-action]') : null;
    if (!actionEl) {
      return; // клики по <a download> и т.п. не перехватываем — работают штатно
    }
    var action = actionEl.getAttribute('data-action');
    if (action === 'close') {
      close();
    } else if (action === 'back') {
      renderIndex();
    } else if (action === 'open-section') {
      renderSection(actionEl.getAttribute('data-section'));
    }
  }

  return {
    init: init,
    toggle: toggle,
    isActive: isActive
  };
})();
