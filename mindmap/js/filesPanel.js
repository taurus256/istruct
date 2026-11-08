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
  var actionsEl = null;    // #files-panel-actions — наполняется ButtonPanel.render(ButtonPanels.files)
  var createBtn = null;    // [data-action="file_create_new"] внутри actionsEl
  var importBtn = null;    // [data-action="file_import_new"] внутри actionsEl
  var importInput = null;  // #input-import-new-scheme
  var importIntoInput = null;   // #input-import-into-scheme (меню карточки, см. requestImportIntoScheme)
  var importIntoSchemeId = null; // id схемы — цель следующего выбора файла в importIntoInput
  var tabBtnEl = null;     // кнопка вкладки "ФАЙЛ" (передаётся из app.js)
  var active = false;

  /* ============================ Инициализация ============================ */

  function init(options) {
    panelEl = document.getElementById('files-panel');
    listEl = document.getElementById('files-panel-list');
    actionsEl = document.getElementById('files-panel-actions');
    if (actionsEl && typeof ButtonPanel !== 'undefined' && typeof ButtonPanels !== 'undefined') {
      actionsEl.appendChild(ButtonPanel.render(ButtonPanels.files));
      createBtn = actionsEl.querySelector('[data-action="file_create_new"]');
      importBtn = actionsEl.querySelector('[data-action="file_import_new"]');
    }
    importInput = document.getElementById('input-import-new-scheme');
    importIntoInput = document.getElementById('input-import-into-scheme');
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
    if (importIntoInput) {
      importIntoInput.addEventListener('change', onImportIntoFileChosen);
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
    // Восстанавливаем позицию панорамирования новой активной схемы (пер-схема,
    // хранится в её payload — см. Storage про version 9). Зум при переключении
    // схемы НЕ меняется (это UI-настройка всего приложения, не per-схема),
    // поэтому restore() можно вызвать сразу после renderAll().
    if (typeof Pan !== 'undefined' && typeof Pan.restore === 'function') {
      Pan.restore();
    }
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

  /* ===================== Действия меню карточки ("ещё действия") ===================
     Вызываются из ActionHandlers (app.js) — см. Popups.fileCard (popups.js):
     file_delete -> deleteScheme, file_import_json -> requestImportIntoScheme. */

  // Удаляет схему id. Если она была активной — переключается на следующую
  // оставшуюся (или создаёт новую, если схем больше не осталось) и закрывает
  // панель, как при обычном переключении (afterSchemeSwitch). Если НЕ была
  // активной — просто перестраивает список карточек, панель остаётся открытой.
  function deleteScheme(id) {
    var name = Storage.getSchemeName(id);
    var confirmed = window.confirm('Удалить схему «' + name + '»? Это необратимо.');
    if (!confirmed) {
      return;
    }

    var result = Storage.deleteScheme(id);
    if (!result.deleted) {
      return;
    }

    if (result.wasActive) {
      if (result.newActiveId) {
        Storage.loadScheme(result.newActiveId);
      } else {
        // Схем больше не осталось — создаём новую, как при полностью
        // пустом хранилище (см. Storage.load()).
        Model.initEmpty();
        Storage.createScheme();
      }
      afterSchemeSwitch();
    } else {
      refreshList();
    }
  }

  // Запрашивает у пользователя файл и перезаписывает им схему schemeId (НЕ
  // обязательно активную — см. Storage.importIntoScheme). Открытие file-picker'а
  // асинхронно, поэтому id цели запоминается в importIntoSchemeId до момента
  // выбора файла (onImportIntoFileChosen).
  function requestImportIntoScheme(schemeId) {
    if (!importIntoInput) {
      return;
    }
    importIntoSchemeId = schemeId;
    importIntoInput.click();
  }

  function onImportIntoFileChosen(e) {
    var file = e.target.files[0];
    var schemeId = importIntoSchemeId;
    importIntoSchemeId = null;
    importIntoInput.value = ''; // сброс, чтобы можно было повторно выбрать тот же файл

    if (!schemeId || !file) {
      return;
    }

    Storage.importIntoScheme(schemeId, file, function () {
      if (schemeId === Storage.getActiveId()) {
        Storage.loadScheme(schemeId);
        afterSchemeSwitch();
      } else {
        refreshList();
      }
    });
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

  // Кнопка-триггер "ещё действия" (стрелка вниз) у правого края карточки —
  // отдельный от самой карточки элемент (соседняя кнопка, не вложенная),
  // поэтому клик по ней НЕ всплывает в обработчик клика по карточке (им
  // незачем знать друг о друге). Открывает Popups.fileCard через
  // PopupMenu.open — см. actions.js/popups.js/popupMenu.js.
  function buildMoreButton(scheme) {
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'scheme-card__more';
    btn.title = 'Ещё действия';
    var img = document.createElement('img');
    img.src = 'assets/icons/small/chevron-down.svg';
    img.alt = '';
    btn.appendChild(img);

    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      if (typeof PopupMenu === 'undefined') {
        return;
      }
      btn.classList.add('scheme-card__more--open');
      PopupMenu.open('fileCard', btn, scheme.id, {
        onClose: function () {
          btn.classList.remove('scheme-card__more--open');
        }
      });
    });

    return btn;
  }

  function buildCard(scheme) {
    var card = document.createElement('button');
    card.type = 'button';
    // Рамка активной схемы рисуется на .scheme-card-row--active (см. CSS и
    // render() ниже) — охватывает и карточку, и кнопку-триггер как единое
    // целое, поэтому самой карточке класс "--active" не нужен.
    card.className = 'scheme-card';
    card.dataset.schemeId = scheme.id;

    // Иконка схемы — готовый ассет assets/icon.png (см. .scheme-card__icon
    // в layout.css: фон-картинка). Пустой <span> — просто площадка 48x48.
    var icon = document.createElement('span');
    icon.className = 'scheme-card__icon';
    card.appendChild(icon);

    var body = document.createElement('span');
    body.className = 'scheme-card__body';

    var name = document.createElement('span');
    name.className = 'scheme-card__name';
    name.textContent = scheme.name;
    body.appendChild(name);

    var modified = document.createElement('span');
    modified.className = 'scheme-card__meta';
    modified.textContent = 'Последнее изменение: ' + formatTimestamp(scheme.modifiedAt);
    body.appendChild(modified);

//    var saved = document.createElement('span');
//    saved.className = 'scheme-card__meta';
//    saved.textContent = 'Сохранено: ' + formatTimestamp(scheme.savedAt);
//    body.appendChild(saved);

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
    if (typeof PopupMenu !== 'undefined') {
      PopupMenu.close(); // список перестраивается — старые узлы-триггеры исчезнут
    }
    listEl.innerHTML = '';
    var schemes = Storage.listSchemes();
    schemes.forEach(function (scheme) {
      var row = document.createElement('div');
      // scheme-card-row--active нужен ОТДЕЛЬНО от scheme-card--active: оранжевая
      // рамка выделения должна охватывать карточку И кнопку-триггер как единое
      // целое (см. CSS), а card/more — несвязанные соседние элементы.
      row.className = 'scheme-card-row' + (scheme.isActive ? ' scheme-card-row--active' : '');
      row.appendChild(buildCard(scheme));
      row.appendChild(buildMoreButton(scheme));
      listEl.appendChild(row);
    });
  }

  // Перестроить список карточек НЕ закрывая панель — используется после
  // действий, которые не меняют активную схему (например, удаление
  // НЕактивной схемы через меню "ещё действия", см. ActionHandlers.file_delete
  // в app.js). Для действий, которые меняют активную схему, используется
  // afterSchemeSwitch() (закрывает панель, как и при обычном переключении).
  function refreshList() {
    if (active) {
      render();
    }
  }

  return {
    init: init,
    open: open,
    close: close,
    refreshList: refreshList,
    toggle: toggle,
    isActive: isActive,
    deleteScheme: deleteScheme,
    requestImportIntoScheme: requestImportIntoScheme
  };
})();
