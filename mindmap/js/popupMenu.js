/*
 * popupMenu.js — универсальный рендерер/контроллер всплывающих меню по
 * декларативному описанию (см. popups.js: menuitem/separator/submenu).
 * Пункты типа 'menuitem' резолвятся через getAction() (actions.js) —
 * имя/иконка берутся из реестра действий, а не хранятся в popups.js.
 *
 * Клик по пункту 'menuitem' вызывает ActionHandlers[action.id](context)
 * (см. app.js) и закрывает меню. ActionHandlers — ЕДИНСТВЕННОЕ место, где
 * этот модуль знает о поведении конкретных действий — сам popupMenu.js
 * ничего не знает о том, ЧТО делает, например, file_delete.
 *
 * Вложенность submenu — ОДИН уровень (submenu внутри submenu не
 * поддерживается: достаточно для текущих сценариев — см. popups.js).
 *
 * Условная видимость пункта — необязательное поле item.visibleWhen (строка-
 * ключ, например 'hasTest'): пункт рендерится, только если
 * options.visibility[ключ] истинно у ТЕКУЩЕГО open() (см. Popups.node и
 * render.js — вычисляет флаги под конкретный узел на момент правого клика).
 * Список пунктов остаётся декларативным (popups.js) — только ВИДИМОСТЬ
 * зависит от контекста, поведение/состав пунктов не генерируется в коде.
 *
 * Открыто единовременно не более одного меню (плюс не более одного
 * раскрытого вложенного submenu внутри него) — повторный вызов open()
 * сначала закрывает предыдущее.
 */
var PopupMenu = (function () {
  var rootEl = null;        // корневой контейнер меню, добавляется в body при open()
  var openSubmenuEl = null; // текущий раскрытый flyout submenu (или null)
  var currentContext = null;
  var onCloseCallback = null; // опциональный колбэк open(...,{onClose}) — см. close()
  // Карта флагов видимости для текущего открытия (options.visibility в open(),
  // см. ниже) — пункт с полем item.visibleWhen рендерится, только если
  // currentVisibility[item.visibleWhen] истинно. Используется, когда один и
  // тот же декларативный список пунктов (popups.js) должен по-разному
  // выглядеть в зависимости от состояния конкретного узла/контекста (есть ли
  // data.offset, data.test, data.note, корень ли это) — см. Popups.node.
  var currentVisibility = {};

  function iconSrc(action, small) {
    if (small && action.smallicon) {
      return action.smallicon;
    }
    return action.icon;
  }

  function makeIconEl(src) {
    var icon = document.createElement('span');
    icon.className = 'popup-menu__icon';
    var img = document.createElement('img');
    img.src = src;
    img.alt = '';
    icon.appendChild(img);
    return icon;
  }

  function makeChevronEl() {
    var chevron = document.createElement('span');
    chevron.className = 'popup-menu__chevron';
    chevron.innerHTML = '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">' +
      '<path d="M6 4L10 8L6 12" stroke="#8A8A8A" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    return chevron;
  }

  function makeMenuItemEl(item) {
    var action = typeof getAction === 'function' ? getAction(item.action) : null;
    var row = document.createElement('button');
    row.type = 'button';
    row.className = 'popup-menu__item';
    if (!action) {
      console.warn('PopupMenu: действие не найдено для пункта меню — action:', item.action);
      row.disabled = true;
      row.textContent = '?';
      return row;
    }
    row.appendChild(makeIconEl(iconSrc(action, true)));
    var label = document.createElement('span');
    label.className = 'popup-menu__label';
    label.textContent = action.name;
    row.appendChild(label);

    row.addEventListener('click', function (e) {
      e.stopPropagation();
      // ВАЖНО: контекст (например id схемы) захватываем ДО close() — close()
      // обнуляет currentContext, иначе обработчик всегда получал бы null.
      var context = currentContext;
      close();
      if (typeof ActionHandlers !== 'undefined' && typeof ActionHandlers[action.id] === 'function') {
        ActionHandlers[action.id](context);
      } else {
        console.warn('PopupMenu: нет обработчика ActionHandlers для действия', action.id);
      }
    });

    return row;
  }

  function makeSeparatorEl() {
    var sep = document.createElement('div');
    sep.className = 'popup-menu__separator';
    var line = document.createElement('div');
    line.className = 'popup-menu__separator-line';
    sep.appendChild(line);
    return sep;
  }

  function makeSubmenuTriggerEl(item) {
    var row = document.createElement('button');
    row.type = 'button';
    row.className = 'popup-menu__item';

    if (item.icon) {
      row.appendChild(makeIconEl(item.icon));
    }
    var label = document.createElement('span');
    label.className = 'popup-menu__label';
    label.textContent = item.name;
    row.appendChild(label);
    row.appendChild(makeChevronEl());

    var flyout = buildMenuEl(item.submenu);
    flyout.classList.add('popup-menu--flyout');
    flyout.hidden = true;
    document.body.appendChild(flyout);

    row.addEventListener('click', function (e) {
      e.stopPropagation();
      if (openSubmenuEl === flyout) {
        closeSubmenu();
        return;
      }
      closeSubmenu();
      positionFlyout(flyout, row);
      flyout.hidden = false;
      row.classList.add('popup-menu__item--open');
      openSubmenuEl = flyout;
      openSubmenuEl.triggerRow = row;
    });

    row.__flyoutEl = flyout;
    return row;
  }

  // Отфильтровывает пункты по visibleWhen (см. шапку файла), затем убирает
  // "осиротевшие" separator — в начале/конце списка или два подряд — которые
  // иначе получаются из-за скрытых соседних пунктов (пример: у корневого
  // узла 'node_remove' не виден — пункт 'separator' перед ним остаётся
  // одиноким последним элементом меню). Список остаётся декларативным
  // (popups.js) — это чисто визуальная уборка уже отфильтрованного результата.
  function filterVisibleItems(items) {
    var visible = items.filter(function (item) {
      return !item.visibleWhen || !!currentVisibility[item.visibleWhen];
    });
    var cleaned = [];
    visible.forEach(function (item) {
      var prevIsSeparator = cleaned.length > 0 && cleaned[cleaned.length - 1].type === 'separator';
      if (item.type === 'separator' && (cleaned.length === 0 || prevIsSeparator)) {
        return; // в начале списка или сразу после другого separator
      }
      cleaned.push(item);
    });
    if (cleaned.length > 0 && cleaned[cleaned.length - 1].type === 'separator') {
      cleaned.pop(); // в конце списка
    }
    return cleaned;
  }

  function buildMenuEl(items) {
    var menu = document.createElement('div');
    menu.className = 'popup-menu';
    filterVisibleItems(items).forEach(function (item) {
      if (item.type === 'separator') {
        menu.appendChild(makeSeparatorEl());
      } else if (item.type === 'submenu') {
        menu.appendChild(makeSubmenuTriggerEl(item));
      } else {
        menu.appendChild(makeMenuItemEl(item));
      }
    });
    return menu;
  }

  function closeSubmenu() {
    if (!openSubmenuEl) { return; }
    openSubmenuEl.hidden = true;
    if (openSubmenuEl.triggerRow) {
      openSubmenuEl.triggerRow.classList.remove('popup-menu__item--open');
    }
    openSubmenuEl = null;
  }

  // Позиционирует меню рядом с anchorEl: по умолчанию под левым краем
  // anchor'а, с переносом влево/вверх при нехватке места у края вьюпорта.
  function positionNear(menuEl, anchorEl) {
    var rect = anchorEl.getBoundingClientRect();
    menuEl.style.visibility = 'hidden';
    menuEl.hidden = false;
    document.body.appendChild(menuEl);
    var menuRect = menuEl.getBoundingClientRect();

    var left = rect.left;
    if (left + menuRect.width > window.innerWidth - 8) {
      left = Math.max(8, rect.right - menuRect.width);
    }
    var top = rect.bottom + 4;
    if (top + menuRect.height > window.innerHeight - 8) {
      top = Math.max(8, rect.top - menuRect.height - 4);
    }
    menuEl.style.left = left + 'px';
    menuEl.style.top = top + 'px';
    menuEl.style.visibility = '';
  }

  // Позиционирует меню так, чтобы его левый верхний угол оказался строго в
  // точке (x, y) — курсор мыши в момент правого клика (см. Popups.node /
  // render.js: options.atPoint). В отличие от positionNear — не привязано к
  // границам какого-либо элемента (узел, кнопка-триггер), поэтому и
  // перекрытие меню с попап-панелями самого узла — ожидаемое поведение, не
  // баг. Перенос влево/вверх при нехватке места у края вьюпорта — как и у
  // positionNear.
  function positionAtPoint(menuEl, x, y) {
    menuEl.style.visibility = 'hidden';
    menuEl.hidden = false;
    document.body.appendChild(menuEl);
    var menuRect = menuEl.getBoundingClientRect();

    var left = x;
    if (left + menuRect.width > window.innerWidth - 8) {
      left = Math.max(8, window.innerWidth - 8 - menuRect.width);
    }
    var top = y;
    if (top + menuRect.height > window.innerHeight - 8) {
      top = Math.max(8, window.innerHeight - 8 - menuRect.height);
    }
    menuEl.style.left = left + 'px';
    menuEl.style.top = top + 'px';
    menuEl.style.visibility = '';
  }

  // Позиционирует flyout submenu рядом со своей строкой-триггером: по
  // умолчанию справа от родительского меню, с переносом влево при нехватке
  // места у правого края вьюпорта (см. Figma-референс: флаут "наезжает"
  // на 2px поверх родителя для визуальной стыковки).
  function positionFlyout(flyoutEl, triggerRowEl) {
    var rowRect = triggerRowEl.getBoundingClientRect();
    var parentMenuEl = triggerRowEl.closest('.popup-menu');
    var parentRect = parentMenuEl.getBoundingClientRect();

    var left = parentRect.right - 2;
    var top = rowRect.top - 6;

    flyoutEl.style.left = left + 'px';
    flyoutEl.style.top = top + 'px';

    // Проверяем переполнение ПОСЛЕ простановки (нужны реальные размеры) —
    // hidden снимается самим вызывающим кодом сразу после этого вызова.
    flyoutEl.style.visibility = 'hidden';
    flyoutEl.hidden = false;
    var flyoutRect = flyoutEl.getBoundingClientRect();
    if (flyoutRect.right > window.innerWidth - 8) {
      flyoutEl.style.left = (parentRect.left - flyoutRect.width + 2) + 'px';
    }
    if (flyoutRect.bottom > window.innerHeight - 8) {
      flyoutEl.style.top = Math.max(8, window.innerHeight - flyoutRect.height - 8) + 'px';
    }
    flyoutEl.hidden = true;
    flyoutEl.style.visibility = '';
  }

  function onOutsideClick(e) {
    if (!rootEl) { return; }
    if (rootEl.contains(e.target)) { return; }
    if (openSubmenuEl && openSubmenuEl.contains(e.target)) { return; }
    close();
  }

  function onKeyDown(e) {
    if (rootEl && e.key === 'Escape') {
      close();
    }
  }

  // options.onClose — опциональный колбэк, вызывается при ЛЮБОМ закрытии
  // этого меню (клик по пункту, клик вне меню, Escape, повторный open())
  // — используется вызывающим кодом (filesPanel.js) только чтобы снять
  // визуальное "нажатое" состояние с кнопки-триггера, см. scheme_more.
  // options.visibility — опциональная карта { [visibleWhen]: boolean },
  // см. item.visibleWhen выше.
  // options.atPoint — опциональная { x, y } (координаты курсора в момент
  // правого клика, см. render.js) — если задана, меню ставится левым верхним
  // углом ровно в эту точку (positionAtPoint) ВМЕСТО привязки к anchorEl
  // (positionNear); anchorEl в этом случае может быть null.
  function open(popupKey, anchorEl, context, options) {
    close(); // не более одного открытого меню одновременно

    var popupDef = typeof Popups !== 'undefined' ? Popups[popupKey] : null;
    if (!popupDef) {
      console.warn('PopupMenu: определение меню не найдено — popupKey:', popupKey);
      return;
    }

    currentContext = context;
    currentVisibility = (options && options.visibility) || {};
    onCloseCallback = (options && typeof options.onClose === 'function') ? options.onClose : null;
    rootEl = buildMenuEl(popupDef.items);
    // Отличает корневое меню от flyout-ов (оба имеют класс .popup-menu —
    // flyout строится и добавляется в body РАНЬШЕ rootEl, см.
    // makeSubmenuTriggerEl, т.к. строится рекурсивно ВНУТРИ buildMenuEl ДО
    // того, как сам rootEl будет добавлен в DOM ниже через positionNear).
    // Без этого класса document.querySelector('.popup-menu') мог бы
    // вернуть flyout вместо rootEl.
    rootEl.classList.add('popup-menu--root');
    if (options && options.atPoint) {
      positionAtPoint(rootEl, options.atPoint.x, options.atPoint.y);
    } else {
      positionNear(rootEl, anchorEl);
    }

    document.addEventListener('click', onOutsideClick, true);
    document.addEventListener('keydown', onKeyDown, true);
  }

  function close() {
    closeSubmenu();
    var wasOpen = !!rootEl;
    if (rootEl) {
      // Удаляем все flyout-ы, созданные этим деревом меню (они добавлены
      // напрямую в body, не внутрь rootEl — см. makeSubmenuTriggerEl).
      document.querySelectorAll('.popup-menu--flyout').forEach(function (el) { el.remove(); });
      rootEl.remove();
      rootEl = null;
    }
    currentContext = null;
    currentVisibility = {};
    document.removeEventListener('click', onOutsideClick, true);
    document.removeEventListener('keydown', onKeyDown, true);
    if (wasOpen && onCloseCallback) {
      var cb = onCloseCallback;
      onCloseCallback = null;
      cb();
    } else {
      onCloseCallback = null;
    }
  }

  function isOpen() {
    return !!rootEl;
  }

  return { open: open, close: close, isOpen: isOpen };
})();
