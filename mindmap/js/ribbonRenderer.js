/*
 * ribbonRenderer.js — десктопный рендерер ribbon-тулбара по декларативному
 * описанию (см. ribbonConfig.js). Содержит ТОЛЬКО логику отображения — не знает
 * о конкретных кнопках/обработчиках/теме; просто строит DOM по переданной
 * структуре { tabs: [...] }.
 *
 * Каждая кнопка получает data-action = item.action — DOM id НЕ присваивается.
 * Клики рендерер передаёт в ActionManager.run одним делегированным
 * обработчиком (ActionManager.bindClicks).
 *
 * Режим «только для чтения»: кнопки с недоступными действиями скрывает
 * ActionManager.syncVisibility, а рендерер вслед за ним сворачивает
 * опустевшие колонки, группы, разделители и вкладки (collapseEmpty).
 *
 * Имя/иконка кнопки в самом конфиге не хранятся — они разрешаются из реестра
 * действий (actions.js) по item.action (см. resolveAction ниже). Если action не
 * найден — кнопка всё равно рендерится (чтобы не ломать весь ribbon
 * целиком из-за одной опечатки), но с пустыми именем/иконкой и предупреждением в консоль.
 */
var RibbonRenderer = (function () {
  'use strict';

  var SMALL_GROUP_SIZE = 3;

  // Активация вкладки и список переключаемых вкладок последнего init() — нужны
  // collapseEmpty()/ensureActiveTabVisible() при смене режима «только для чтения».
  var activateTabFn = null;
  var switchingTabs = []; // { index, button, content }

  // item.action -> Action (actions.js). Отсутствие действия — не фатально
  // для всего рендера (см. шапку файла), только для этой одной кнопки.
  function resolveAction(item) {
    var action = typeof getAction === 'function' ? getAction(item.action) : null;
    if (!action) {
      console.warn('RibbonRenderer: действие не найдено для кнопки — action:', item.action);
      return { name: '', icon: '', iconNeutral: false };
    }
    return action;
  }

  function createIconEl(action) {
    var icon = document.createElement('span');
    icon.className = 'ribbon-btn__icon' + (action.iconNeutral ? ' ribbon-btn__icon--neutral' : '');
    var img = document.createElement('img');
    img.src = action.icon;
    img.alt = '';
    icon.appendChild(img);
    return icon;
  }

  function createButton(item) {
    var action = resolveAction(item);
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'ribbon-btn';
    btn.dataset.action = item.action;
    btn.appendChild(createIconEl(action));
    var label = document.createElement('span');
    label.className = 'ribbon-btn__label';
    label.textContent = action.name;
    btn.appendChild(label);
    return btn;
  }

  function createSmallButton(item) {
    var action = resolveAction(item);
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'ribbon-small-btn';
    btn.dataset.action = item.action;
    var icon = document.createElement('span');
    icon.className = 'ribbon-small-btn__icon';
    var img = document.createElement('img');
    img.src = action.icon;
    img.alt = '';
    icon.appendChild(img);
    btn.appendChild(icon);
    var label = document.createElement('span');
    label.className = 'ribbon-small-btn__label';
    label.textContent = action.name;
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

    // Кнопки Undo/Redo — сразу справа от названий вкладок, в той же строке.
    // Это статичные элементы рендерера (не пункты RibbonConfig и не действия из
    // actions.js): у них своё собственное состояние (enabled + иконка вкл/выкл,
    // см. app.js:updateUndoRedoButtons), которое не описывается декларацией
    // тулбара. Поэтому здесь остаются их единственные DOM id (#btn-undo/#btn-redo).
    var undoRedoEl = document.createElement('div');
    undoRedoEl.className = 'ribbon-undo-redo';

    var undoBtn = document.createElement('button');
    undoBtn.type = 'button';
    undoBtn.id = 'btn-undo';
    undoBtn.dataset.action = 'edit_undo';
    undoBtn.className = 'ribbon-undo-redo__btn';
    undoBtn.title = 'Отменить (Ctrl+Z)';
    undoBtn.innerHTML = '<img src="assets/icons/small/undo_disable.svg" alt="">';
    undoRedoEl.appendChild(undoBtn);

    var redoBtn = document.createElement('button');
    redoBtn.type = 'button';
    redoBtn.id = 'btn-redo';
    redoBtn.dataset.action = 'edit_redo';
    redoBtn.className = 'ribbon-undo-redo__btn';
    redoBtn.title = 'Повторить (Ctrl+Y)';
    redoBtn.innerHTML = '<img src="assets/icons/small/redo_disable.svg" alt="">';
    undoRedoEl.appendChild(redoBtn);

    var tabButtons = [];
    // ВАЖНО: содержимое ВСЕХ вкладок рендерится СРАЗУ и остаётся в DOM постоянно
    // (переключение вкладки — чисто визуальное, через hidden, без пересоздания DOM).
    // Причина: синхронизация подсветки модальных кнопок и видимости в режиме
    // «только для чтения» ищут кнопки по [data-action] по ВСЕМУ документу
    // и должны видеть кнопки с любых вкладок, а не только с активной.
    var tabContents = [];

    function activateTab(index) {
      tabButtons.forEach(function (btn, i) {
        btn.classList.toggle('ribbon-tab--active', i === index);
      });
      tabContents.forEach(function (el, i) {
        el.hidden = (i !== index);
      });
    }
    activateTabFn = activateTab;
    switchingTabs = [];

    config.tabs.forEach(function (tab, index) {
      var tabBtn = document.createElement('button');
      tabBtn.type = 'button';
      tabBtn.className = 'ribbon-tab';
      tabBtn.textContent = tab.name;
      // data-tab-name — generic hook (не завязан на конкретное имя вкладки),
      // по которому внешний код (app.js) может найти свою кнопку вкладки,
      // не трогая внутренности рендерера (см. nonSwitching ниже).
      tabBtn.dataset.tabName = tab.name;
      if (tab.nonSwitching) {
        // Визуально такая вкладка — не "обычная" переключаемая (светлый
        // подсвет + подчёркивание при активности), а постоянно залитая
        // акцентным цветом кнопка-меню (как классическая "Файл" в Office) —
        // см. .ribbon-tab--menu в layout.css. Класс не снимается/не
        // переключается ribbon-tab--active, он есть ВСЕГДА у nonSwitching-вкладок.
        tabBtn.classList.add('ribbon-tab--menu');
        // Вкладка не переключает ribbon-контент (см. комментарий поля
        // nonSwitching в ribbonConfig.js) — вместо activateTab рассылаем
        // событие, на которое снаружи подписывается свой обработчик
        // (app.js/filesPanel.js). "Реальная" активная вкладка под ней
        // остаётся как была.
        tabBtn.addEventListener('click', function () {
          tabBtn.dispatchEvent(new CustomEvent('ribbon:nonswitching-tab-click', {
            bubbles: true,
            detail: { tabName: tab.name }
          }));
        });
      } else {
        tabBtn.addEventListener('click', function () {
          activateTab(index);
        });
      }
      tabButtons.push(tabBtn);
      tabsEl.appendChild(tabBtn);

      var contentEl = renderTabContent(tab);
      if (!tab.nonSwitching) {
        switchingTabs.push({ index: index, button: tabBtn, content: contentEl });
      }
      tabContents.push(contentEl);
    });

    tabsRowEl.appendChild(tabsEl);
    tabsRowEl.appendChild(undoRedoEl);
    containerEl.appendChild(tabsRowEl);
    tabContents.forEach(function (el) {
      containerEl.appendChild(el);
    });

    // По умолчанию активна первая "обычная" (не nonSwitching) вкладка —
    // nonSwitching-вкладки (ФАЙЛ) никогда не становятся вкладкой по
    // умолчанию, у них нет переключаемого контента.
    var defaultIndex = 0;
    for (var i = 0; i < config.tabs.length; i++) {
      if (!config.tabs[i].nonSwitching) {
        defaultIndex = i;
        break;
      }
    }
    activateTab(defaultIndex);

    ActionManager.bindClicks(containerEl);
    ActionManager.onLockChange(function () {
      collapseEmpty();
    });
  }

  function hasVisibleChild(el) {
    for (var i = 0; i < el.children.length; i++) {
      if (!el.children[i].hidden) {
        return true;
      }
    }
    return false;
  }

  // Скрывает колонки smallbutton, группы и вкладки, в которых не осталось
  // видимых кнопок (после ActionManager.syncVisibility), и расставляет
  // разделители только между видимыми группами.
  function collapseEmpty() {
    switchingTabs.forEach(function (tab) {
      var groups = tab.content.querySelectorAll('.ribbon-group');
      var visibleGroups = 0;
      for (var g = 0; g < groups.length; g++) {
        var cols = groups[g].querySelectorAll('.ribbon-col');
        for (var c = 0; c < cols.length; c++) {
          cols[c].hidden = !hasVisibleChild(cols[c]);
        }
        var row = groups[g].querySelector('.ribbon-group__row');
        groups[g].hidden = !hasVisibleChild(row);
        var divider = groups[g].previousElementSibling;
        if (divider) {
          divider.hidden = groups[g].hidden || visibleGroups === 0;
        }
        if (!groups[g].hidden) {
          visibleGroups += 1;
        }
      }
      tab.button.hidden = visibleGroups === 0;
    });
    ensureActiveTabVisible();
  }

  // Если активная вкладка стала невидимой (например в режиме «только
  // для чтения» в ней не осталось кнопок), активирует первую видимую.
  function ensureActiveTabVisible() {
    if (!activateTabFn) {
      return;
    }
    var active = switchingTabs.filter(function (t) {
      return t.button.classList.contains('ribbon-tab--active');
    })[0];
    if (active && !active.button.hidden) {
      return;
    }
    var firstVisible = switchingTabs.filter(function (t) {
      return !t.button.hidden;
    })[0];
    if (firstVisible) {
      activateTabFn(firstVisible.index);
    }
  }

  return {
    init: init
  };
})();
