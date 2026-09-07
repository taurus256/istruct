/*
 * help.js — встроенная справка приложения (панель #help-panel, СЛЕВА от диаграммы).
 *
 * Полностью самостоятельный независимый модуль: НЕ связан с координатором
 * общей боковой панели #side-panel (заметки/тест, см. app.js) — управляет
 * своей собственной левой панелью и своей кнопкой #btn-help-docs САМ, без
 * участия координатора. Обе панели (эта и #side-panel) могут быть открыты
 * одновременно и переключаются независимо.
 *
 * Контент разделов (массив SECTIONS: { id, title, bodyHtml }) СГЕНЕРИРОВАН из
 * text.md в корне репозитория скриптом mindmap/tools/gen-help.js. НЕ редактируйте
 * его здесь вручную — правьте text.md и перезапускайте `node mindmap/tools/gen-help.js`.
 * bodyHtml — уже готовый HTML (не Markdown), поэтому Markdown.toHtml не используется.
 *
 * Не использует ES-модули — открывается через file:// обычным <script>.
 */

var Help = (function () {
  var panelEl = null;   // #help-panel
  var btnEl = null;     // #btn-help-docs
  var active = false;
  var currentSection = null; // null = оглавление, иначе id раздела

  /* BEGIN GENERATED SECTIONS — сгенерировано mindmap/tools/gen-help.js из text.md.
     НЕ РЕДАКТИРОВАТЬ ВРУЧНУЮ: правьте text.md и перезапускайте генератор. */
  var SECTIONS = [
    {
      id: 'topic-1',
      title: 'Введение',
      bodyHtml: '<p>Это приложение предназначено для структурирования информации в виде mind map</p>\n<p>Среди особенностей - ориентация на использование mind maps для обучения и способность взаимодействовать с нейронными сетями (LLM).</p>\n<p>Это офлайн-приложение, написанное на Javascript. Данные сохраняются локально в кэше браузера, доступен импорт/экспорт данных в JSON-формате.</p>'
    },
    {
      id: 'topic-2',
      title: 'Работа со схемой',
      bodyHtml: '<p>Приложение позволяет организовывать информацию в виде иерархии узлов. Корневой узел один, дочерние "растут" от него в четырех направлениях.<br>Существует несколько типов узлов:</p>\n<ul><li><img class="help-article-icon" src="assets/icons/small/text.svg" alt="text.svg"> текстовый узел.  Используется чаще всего</li><li><img class="help-article-icon" src="assets/icons/small/link.svg" alt="link.svg"> ссылка. Хранит ссылку на страницу в Интернет</li><li><img class="help-article-icon" src="assets/icons/small/test.svg" alt="test.svg"> тест. Используется для хранения тестов.</li></ul>\n<p>Можно создавать узлы всех типов, редактировать - все, кроме тестового. "Наполнение" тестового узла данными производится с помощью LLM. </p>\n<p>Также к каждому узлу можно добавлять текстовый комментарий (<img class="help-article-icon" src="assets/icons/small/comment.svg" alt="comment.svg">)</p>\n<p class="help-article-figure"><img class="help-article-img" src="assets/images/help_node_popup.png" alt="help_node_popup.png"></p>\n<p>Панель, которая появляется при наведении мыши на узел, позволяет:</p>\n<ul><li>создать дочерний узел одного из трех типов</li><li>добавить комментарий</li><li>удалить текущий узел.</li></ul>\n<p>Также к узлам можно прикреплять заметки — для этого используется боковая панель.</p>'
    },
    {
      id: 'topic-3',
      title: 'Интерфейс системы',
      bodyHtml: '<p>На панели сверху расположены кнопки основных действий, объединенные в группы. Группа "Узлы" отвечает за работу с узлами схемы. Кнопки группы "Сведения" позволяют управлять отображением справки и боковой панели<br><img class="help-article-icon" src="assets/icons/book.svg" alt="book.svg"> (Показать/убрать справку)<br><img class="help-article-icon" src="assets/icons/panel.svg" alt="panel.svg"> (Показать/убрать боковую панель)<br>Кнопки группы "Схема" предназначены работы с данными схемы: загрузки, сохранения и очистки.<br><img class="help-article-icon" src="assets/icons/arrow-down.svg" alt="arrow-down.svg"> Загрузка данных в формате JSON<br><img class="help-article-icon" src="assets/icons/arrow-up.svg" alt="arrow-up.svg"> Выгрузка  данных в формате JSON в файл<br><img class="help-article-icon" src="assets/icons/eracer.svg" alt="eracer.svg"> Очистка данных схемы</p>\n<p>Кнопка "Тема" группы "Инструменты" позволяет переключаться между светлой и темной темами интерфейса<br><img class="help-article-icon" src="assets/icons/theme.svg" alt="theme.svg"> Переключить тему</p>'
    },
    {
      id: 'topic-4',
      title: 'Работа с LLM в режиме чата',
      bodyHtml: '<p>Самый простой способ начать работать с программой - использовать чат какой-либо нейронной сети. Нужно прикрепить к сообщению чата файл описания формата DATA_FORMAT.md, после чего "попросить" нейросеть создать схему с нужными вам данными. Например для создания схемы изучения регулярных выражений языка Python можно написать:</p>\n<pre class="help-article-pre">Я передаю тебе описание формата данных Mind Map. Реализуй схему для изучения регулярных выражений с примерами на языке Python 3. Проставь ссылки на источники. Не забудь тесты.</pre>\n<p>После чего дождаться завершения вывода нейросети, скопировать сгенерированные JSON-данные в файл и загрузить его с помощью кнопки<br><img class="help-article-icon" src="assets/icons/arrow-down.svg" alt="arrow-down.svg">"Импорт JSON".<br>Если всё прошло нормально, схема откроется для редактирования. Для запуска тестов (если такие есть), нужно выделить узел с тестом, открыть боковую панель, после чего нажать на кнопку "Начать тест". </p>\n<pre class="help-article-pre">Внимание!\nНейросети могут и любят галлюцинировать. Вполне вероятно, что созданная схема будет содержать ошибки. Используйте её как "отправную точку" для работы.</pre>'
    }
  ];
  /* END GENERATED SECTIONS */

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
    // Заголовок раздела показывает шапка панели (.side-view__title) — в теле
    // его не дублируем.
    panelEl.innerHTML =
      headerHtml(section.title, true) +
      '<div class="test-body">' +
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
    open: open,
    toggle: toggle,
    isActive: isActive
  };
})();
