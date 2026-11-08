/*
 * buttonPanel.js — рендерер декларативных панелей кнопок-действий (см.
 * buttonPanels.js) по тому же принципу, что ribbonRenderer.js/popupMenu.js:
 * ТОЛЬКО отображение (строит DOM по описанию), без логики обработчиков и
 * без вложенности (в отличие от popupMenu.js — здесь нет submenu).
 *
 * Клик НЕ обрабатывается этим модулем — каждая кнопка получает
 * data-action = item.action (как кнопки ribbonRenderer.js), а вызывающий
 * код сам решает, как реагировать: делегированием по [data-action] на
 * контейнере (см. test.js: onViewClick) либо прямой выборкой конкретной
 * кнопки по [data-action="..."] (см. filesPanel.js).
 */
var ButtonPanel = (function () {
  function resolveAction(item) {
    var action = typeof getAction === 'function' ? getAction(item.action) : null;
    if (!action) {
      console.warn('ButtonPanel: действие не найдено для кнопки — action:', item.action);
      return { name: '', icon: '' };
    }
    return action;
  }

  function makeIconEl(src) {
    var icon = document.createElement('span');
    icon.className = 'btn-panel__icon';
    var img = document.createElement('img');
    img.src = src;
    img.alt = '';
    icon.appendChild(img);
    return icon;
  }

  function makeButtonEl(item) {
    var action = resolveAction(item);
    var modifier = (item.type === 'primarybutton') ? 'primary' : 'secondary';
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn-panel__btn btn-panel__btn--' + modifier;
    btn.dataset.action = item.action;
    // Иконка — только у primarybutton и только если у действия она задана.
    // Кнопки типа 'button' рендерятся без иконки (чисто текстовые).
    if (item.type === 'primarybutton' && action.icon) {
      btn.appendChild(makeIconEl(action.icon));
    }
    var label = document.createElement('span');
    label.className = 'btn-panel__label';
    label.textContent = action.name;
    btn.appendChild(label);
    return btn;
  }

  // Строит DOM-фрагмент панели (.btn-panel) по описанию panelDef (см.
  // buttonPanels.js: { items: [...] }). Чистая функция — не трогает DOM
  // вызывающей стороны, caller сам решает, куда вставить результат.
  function render(panelDef) {
    var panel = document.createElement('div');
    panel.className = 'btn-panel';
    var items = (panelDef && panelDef.items) || [];
    items.forEach(function (item) {
      panel.appendChild(makeButtonEl(item));
    });
    return panel;
  }

  return { render: render };
})();
