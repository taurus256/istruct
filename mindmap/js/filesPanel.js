/*
 * filesPanel.js — панель выбора схемы (#files-panel), открывается вкладкой
 * "ФАЙЛ" ribbon-тулбара (см. ribbonConfig.js: tab.nonSwitching — вкладка не
 * переключает ribbon-контент, вместо этого app.js подписывается на событие
 * 'ribbon:nonswitching-tab-click' и вызывает FilesPanel.toggle()).
 *
 * Самостоятельный модуль того же вида, что Help/Notes (init/open/close/
 * toggle/isActive), но, В ОТЛИЧИЕ от #help-panel/#side-panel (flex-соседи
 * внутри #work-area, сжимающие канву), #files-panel — ОВЕРЛЕЙ: позиционируется
 * fixed поверх ribbon-group и канвы (см. layout.css), не влияет на раскладку.
 *
 * Отвечает за: список сохранённых схем (карточки, см. Storage.listSchemes),
 * создание новой схемы, импорт схемы из файла КАК НОВОЙ (не путать с
 * "Импорт JSON" вкладки СХЕМА — та перезаписывает активную схему на месте),
 * переключение на другую схему по клику на карточку, закрытие по повторному
 * клику на вкладку ФАЙЛ / клику вне панели.
 */
var FilesPanel = (function () {
  var panelEl = null;      // #files-panel
  var listEl = null;       // #files-panel-list
  var createBtn = null;    // #btn-files-create
  var importBtn = null;    // #btn-files-import
  var importInput = null;  // #input-import-new-scheme
  var tabBtnEl = null;     // кнопка вкладки "ФАЙЛ" (передаётся из app.js)
  var active = false;

  /* ============================ Инициализация ============================ */

  function init(options) {
    panelEl = document.getElementById('files-panel');
    listEl = document.getElementById('files-panel-list');
    createBtn = document.getElementById('btn-files-create');
    importBtn = document.getElementById('btn-files-import');
    importInput = document.getElementById('input-import-new-scheme');
    tabBtnEl = options && options.tabBtnEl;

    if (!panelEl || !listEl) {
      return;
    }

    positionPanel();
    window.addEventListener('resize', positionPanel);

    if (createBtn) {
      createBtn.addEventListener('click', onCreateClick);
    }
    if (importBtn && importInput) {
      importBtn.addEventListener('click', function () {
        importInput.click();
      });
      importInput.addEventListener('change', onImportFileChosen);
    }

    // Закрытие по клику вне панели (и вне самой кнопки вкладки ФАЙЛ — её
    // собственный клик обрабатывается отдельно в app.js через toggle(),
    // здесь его нужно ИГНОРИРОВАТЬ, иначе toggle() и этот обработчик
    // погасят друг друга на одном и том же клике).
    document.addEventListener('click', onOutsideClick);
    document.addEventListener('keydown', onKeyDown);
  }

  // Панель должна начинаться СРАЗУ под строкой названий вкладок (.ribbon-tabs-row),
  // А НЕ под всем тулбаром целиком — т.е. она намеренно перекрывает собой
  // строку групп/кнопок активной вкладки ниже (см. Figma: node 451:2607
  // начинается на y=36, ровно на высоту .ribbon-tabs-row, поверх ribbon-group).
  // И заканчиваться ДО #status-bar снизу (а не bottom:0 до самого низа
  // вьюпорта, как было раньше — это перекрывало статус-бар: логотип и
  // начало строки подсказки оказывались НЕДОСТУПНЫ под панелью). Обе границы
  // не захардкожены — измеряем фактические высоты .ribbon-tabs-row/#status-bar,
  // чтобы не зависеть от метрик шрифта/ОС.
  function positionPanel() {
    if (!panelEl) {
      return;
    }
    var tabsRowEl = document.querySelector('.ribbon-tabs-row');
    var top = tabsRowEl ? tabsRowEl.getBoundingClientRect().bottom : 0;
    panelEl.style.top = top + 'px';

    var statusBarEl = document.getElementById('status-bar');
    var bottom = statusBarEl ? (window.innerHeight - statusBarEl.getBoundingClientRect().top) : 0;
    panelEl.style.bottom = bottom + 'px';
  }

  /* ============================ Открытие/закрытие ========================= */

  function open() {
    if (active || !panelEl) {
      return;
    }
    active = true;
    positionPanel();
    panelEl.hidden = false;
    // ribbon-tab--menu (ФАЙЛ) уже залита акцентным цветом ВСЕГДА (см.
    // layout.css) — это НЕ обычная активная вкладка, поэтому НЕ трогаем
    // ribbon-tab--active, а добавляем свой модификатор "нажатого" состояния.
    if (tabBtnEl) {
      tabBtnEl.classList.add('ribbon-tab--menu-open');
    }
    render();
  }

  function close() {
    if (!active || !panelEl) {
      return;
    }
    active = false;
    panelEl.hidden = true;
    if (tabBtnEl) {
      tabBtnEl.classList.remove('ribbon-tab--menu-open');
    }
  }

  function toggle() {
    if (active) {
      close();
    } else {
      open();
    }
  }

  function isActive() {
    return active;
  }

  function onOutsideClick(e) {
    if (!active) {
      return;
    }
    if (panelEl.contains(e.target) || e.target === tabBtnEl) {
      return;
    }
    close();
  }

  function onKeyDown(e) {
    if (active && e.key === 'Escape') {
      close();
    }
  }

  /* ================================ Действия =============================== */

  function afterSchemeSwitch() {
    Undo.reset();
    Render.selectNode(null);
    Render.renderAll();
    close();
  }

  function onCreateClick() {
    Model.initEmpty();
    Storage.createScheme();
    afterSchemeSwitch();
  }

  function onImportFileChosen(e) {
    var file = e.target.files[0];
    Storage.importAsNewScheme(file, function (newId) {
      Storage.loadScheme(newId);
      afterSchemeSwitch();
    });
    importInput.value = ''; // сброс, чтобы можно было повторно выбрать тот же файл
  }

  function onCardClick(id) {
    if (id === Storage.getActiveId()) {
      close(); // клик по уже активной схеме — просто закрыть панель
      return;
    }
    Storage.switchScheme(id);
    afterSchemeSwitch();
  }

  /* ================================ Рендер =================================== */

  function pad2(n) {
    return n < 10 ? '0' + n : String(n);
  }

  // Формат фиксирован (ДД.ММ.ГГГГ, ЧЧ:ММ) независимо от локали браузера —
  // toLocaleString() даёт разный порядок/разделители в разных локалях.
  function formatTimestamp(ms) {
    if (!ms) {
      return '—';
    }
    var d = new Date(ms);
    return pad2(d.getDate()) + '.' + pad2(d.getMonth() + 1) + '.' + d.getFullYear() +
      ', ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes());
  }

  function buildCard(scheme) {
    var card = document.createElement('button');
    card.type = 'button';
    card.className = 'scheme-card' + (scheme.isActive ? ' scheme-card--active' : '');
    card.dataset.schemeId = scheme.id;

    var icon = document.createElement('span');
    icon.className = 'scheme-card__icon';
    icon.textContent = 'iS';
    card.appendChild(icon);

    var body = document.createElement('span');
    body.className = 'scheme-card__body';

    var name = document.createElement('span');
    name.className = 'scheme-card__name';
    name.textContent = scheme.name;
    body.appendChild(name);

    var modified = document.createElement('span');
    modified.className = 'scheme-card__meta';
    modified.textContent = 'Изменено: ' + formatTimestamp(scheme.modifiedAt);
    body.appendChild(modified);

    var saved = document.createElement('span');
    saved.className = 'scheme-card__meta';
    saved.textContent = 'Сохранено: ' + formatTimestamp(scheme.savedAt);
    body.appendChild(saved);

    card.appendChild(body);

    card.addEventListener('click', function () {
      onCardClick(scheme.id);
    });

    return card;
  }

  function render() {
    if (!listEl) {
      return;
    }
    listEl.innerHTML = '';
    var schemes = Storage.listSchemes();
    schemes.forEach(function (scheme) {
      listEl.appendChild(buildCard(scheme));
    });
  }

  return {
    init: init,
    open: open,
    close: close,
    toggle: toggle,
    isActive: isActive
  };
})();
