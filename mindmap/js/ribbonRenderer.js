/*
 * ribbonRenderer.js — десктопный рендерер ribbon-тулбара по декларативному
 * описанию (см. ribbonConfig.js). Содержит ТОЛЬКО логику отображения —
 * не знает о конкретных кнопках/обработчиках/теме; просто строит DOM по
 * переданной структуре { tabs: [...] }. app.js затем находит созданные
 * кнопки по id и навешивает обработчики — ribbonRenderer в это не
 * вмешивается.
 */
var RibbonRenderer = (function () {
  'use strict';

  var SMALL_GROUP_SIZE = 3;

  function createIconEl(item) {
    var icon = document.createElement('span');
    icon.className = 'ribbon-btn__icon' + (item.iconNeutral ? ' ribbon-btn__icon--neutral' : '');
    var img = document.createElement('img');
    img.src = item.icon;
    img.alt = '';
    icon.appendChild(img);
    return icon;
  }

  function createButton(item) {
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.id = item.id;
    btn.className = 'ribbon-btn';
    btn.appendChild(createIconEl(item));
    var label = document.createElement('span');
    label.className = 'ribbon-btn__label';
    label.textContent = item.name;
    btn.appendChild(label);
    return btn;
  }

  function createSmallButton(item) {
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.id = item.id;
    btn.className = 'ribbon-small-btn';
    var icon = document.createElement('span');
    icon.className = 'ribbon-small-btn__icon';
    var img = document.createElement('img');
    img.src = item.icon;
    img.alt = '';
    icon.appendChild(img);
    btn.appendChild(icon);
    var label = document.createElement('span');
    label.className = 'ribbon-small-btn__label';
    label.textContent = item.name;
    btn.appendChild(label);
    return btn;
  }

  // Оборачивает до SMALL_GROUP_SIZE подряд идущих smallbutton в одну
  // колонку .ribbon-col; колонки — обычные элементы ribbon-group__row
  // наравне с обычными .ribbon-btn.
  function createColumn(items) {
    var col = document.createElement('div');
    col.className = 'ribbon-col';
    items.forEach(function (item) {
      col.appendChild(createSmallButton(item));
    });
    return col;
  }

  function renderGroupRow(content) {
    var row = document.createElement('div');
    row.className = 'ribbon-group__row';

    var i = 0;
    while (i < content.length) {
      var item = content[i];
      if (item.type === 'smallbutton') {
        var batch = [];
        while (i < content.length && content[i].type === 'smallbutton' && batch.length < SMALL_GROUP_SIZE) {
          batch.push(content[i]);
          i += 1;
        }
        row.appendChild(createColumn(batch));
      } else {
        row.appendChild(createButton(item));
        i += 1;
      }
    }
    return row;
  }

  function renderGroup(group) {
    var wrap = document.createElement('div');
    wrap.className = 'ribbon-group';

    var inner = document.createElement('div');
    inner.className = 'ribbon-group__content';
    inner.appendChild(renderGroupRow(group.content));

    wrap.appendChild(inner);
    return wrap;
  }

  function renderTabContent(tab) {
    var contentEl = document.createElement('div');
    contentEl.className = 'ribbon-tab-content';
    tab.groups.forEach(function (group, index) {
      contentEl.appendChild(renderGroup(group));
      if (index < tab.groups.length - 1) {
        var divider = document.createElement('span');
        divider.className = 'ribbon-divider';
        contentEl.appendChild(divider);
      }
    });
    return contentEl;
  }

  function init(containerEl, config) {
    if (!containerEl || !config || !config.tabs || !config.tabs.length) {
      return;
    }
    containerEl.innerHTML = '';
    containerEl.classList.add('ribbon-toolbar');

    var tabsRowEl = document.createElement('div');
    tabsRowEl.className = 'ribbon-tabs-row';

    var tabsEl = document.createElement('div');
    tabsEl.className = 'ribbon-tabs';

    // Кнопки Undo/Redo — справа от названий вкладок, в той же строке. Сам
    // ribbonRenderer ничего не знает про Undo — только создаёт кнопки с фиксированными
    // id (как и все остальные кнопки ribbon) — логику (состояние/клик)
    // навешивает app.js.
    var undoRedoEl = document.createElement('div');
    undoRedoEl.className = 'ribbon-undo-redo';

    var undoBtn = document.createElement('button');
    undoBtn.type = 'button';
    undoBtn.id = 'btn-undo';
    undoBtn.className = 'ribbon-undo-redo__btn';
    undoBtn.title = 'Отменить (Ctrl+Z)';
    undoBtn.innerHTML = '<img src="assets/icons/small/undo_disable.svg" alt="">';
    undoRedoEl.appendChild(undoBtn);

    var redoBtn = document.createElement('button');
    redoBtn.type = 'button';
    redoBtn.id = 'btn-redo';
    redoBtn.className = 'ribbon-undo-redo__btn';
    redoBtn.title = 'Повторить (Ctrl+Y)';
    redoBtn.innerHTML = '<img src="assets/icons/small/redo_disable.svg" alt="">';
    undoRedoEl.appendChild(redoBtn);

    var tabButtons = [];
    // ВАЖНО: содержимое ВСЕХ вкладок рендерится СРАЗУ и остаётся в DOM постоянно
    // (переключение вкладки — чисто визуальное, через hidden, без пересоздания DOM).
    // Причина: app.js ищет ВСЕ кнопки по id СРАЗУ при инициализации (document.getElementById),
    // в т.ч. кнопки с других вкладок (Импорт/Экспорт/Очистить/Справка/Панель/Тема) —
    // если рендерить только активную вкладку, остальные кнопки будут null в момент
    // инициализации и обработчики сломаются.
    var tabContents = [];

    function activateTab(index) {
      tabButtons.forEach(function (btn, i) {
        btn.classList.toggle('ribbon-tab--active', i === index);
      });
      tabContents.forEach(function (el, i) {
        el.hidden = (i !== index);
      });
    }

    config.tabs.forEach(function (tab, index) {
      var tabBtn = document.createElement('button');
      tabBtn.type = 'button';
      tabBtn.className = 'ribbon-tab';
      tabBtn.textContent = tab.name;
      tabBtn.addEventListener('click', function () {
        activateTab(index);
      });
      tabButtons.push(tabBtn);
      tabsEl.appendChild(tabBtn);

      tabContents.push(renderTabContent(tab));
    });

    tabsRowEl.appendChild(tabsEl);
    tabsRowEl.appendChild(undoRedoEl);
    containerEl.appendChild(tabsRowEl);
    tabContents.forEach(function (el) {
      containerEl.appendChild(el);
    });

    activateTab(0);
  }

  return {
    init: init
  };
})();
