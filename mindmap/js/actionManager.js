/*
 * actionManager.js — единая точка запуска действий (Action, см. actions.js).
 *
 * Любая кнопка/пункт меню/горячая клавиша передаёт сюда только id действия
 * (и при необходимости контекст), а ActionManager:
 *   • проверяет доступность действия (режим «только для чтения» — поле
 *     lockedAvailable действия, см. actions.js);
 *   • подставляет контекст по полю target действия, если вызывающий его не
 *     передал (ribbon, горячие клавиши) — id выделенного узла или корня;
 *   • вызывает обработчик, зарегистрированный модулем-владельцем через
 *     register()/registerAll(). Поэтому обработчики живут рядом со своей
 *     логикой (app.js, filesPanel.js, test.js), а не в одном глобальном объекте.
 *
 * Видимость в режиме «только для чтения» выводится из той же доступности:
 *   • элементы, создаваемые заново (меню, панели кнопок, кнопки узла), сами
 *     спрашивают isAvailable(id) при построении;
 *   • постоянные элементы с [data-action] при смене режима (notifyLockChanged)
 *     получают hidden через syncVisibility, после чего подписчики
 *     onLockChange сворачивают опустевшие контейнеры (см. ribbonRenderer.js).
 */
var ActionManager = (function () {
  var handlers = {};
  var lockListeners = [];

  function register(id, handler) {
    if (!getAction(id)) {
      console.warn('ActionManager: регистрация обработчика неизвестного действия', id);
    }
    if (handlers[id]) {
      console.warn('ActionManager: обработчик действия переопределён', id);
    }
    handlers[id] = handler;
  }

  function registerAll(map) {
    Object.keys(map).forEach(function (id) {
      register(id, map[id]);
    });
  }

  function isLocked() {
    return typeof Model !== 'undefined' && Model.isLocked();
  }

  function isAvailable(id) {
    var action = getAction(id);
    if (!action) {
      return false;
    }
    return !isLocked() || action.lockedAvailable === true;
  }

  // Контекст по умолчанию для действий с полем target (см. actions.js).
  function resolveTarget(action) {
    var selectedId = Render.getSelectedId() || null;
    if (action.target === 'nodeOrRoot') {
      return selectedId || Model.getState().rootId;
    }
    return selectedId;
  }

  // Возвращает true, если обработчик действия был вызван.
  function run(id, context, options) {
    var action = getAction(id);
    if (!action) {
      console.warn('ActionManager: действие не найдено', id);
      return false;
    }
    if (!isAvailable(id)) {
      return false;
    }
    var handler = handlers[id];
    if (typeof handler !== 'function') {
      console.warn('ActionManager: нет обработчика для действия', id);
      return false;
    }
    if (action.target && (context === undefined || context === null)) {
      context = resolveTarget(action);
      if (context === null || context === undefined) {
        return false; // действию нужен узел, а выделения нет
      }
    }
    handler(context, options);
    return true;
  }

  // Делегированный клик по [data-action] внутри контейнера → run(id).
  function bindClicks(containerEl) {
    containerEl.addEventListener('click', function (e) {
      var el = e.target.closest ? e.target.closest('[data-action]') : null;
      if (!el || !containerEl.contains(el) || el.disabled) {
        return;
      }
      run(el.dataset.action);
    });
  }

  // Скрывает элементы [data-action] с недоступными действиями. Значения
  // data-action, которых нет в реестре Actions (внутренние команды вью
  // вроде 'close'/'prev' в test.js/help.js), не трогаются.
  function syncVisibility(rootEl) {
    var els = rootEl.querySelectorAll('[data-action]');
    for (var i = 0; i < els.length; i++) {
      var id = els[i].dataset.action;
      if (getAction(id)) {
        els[i].hidden = !isAvailable(id);
      }
    }
  }

  function onLockChange(fn) {
    lockListeners.push(fn);
  }

  // Вызывается после загрузки/импорта/смены схемы — режим мог измениться.
  function notifyLockChanged() {
    var locked = isLocked();
    syncVisibility(document);
    lockListeners.forEach(function (fn) {
      fn(locked);
    });
  }

  return {
    register: register,
    registerAll: registerAll,
    isAvailable: isAvailable,
    run: run,
    bindClicks: bindClicks,
    syncVisibility: syncVisibility,
    onLockChange: onLockChange,
    notifyLockChanged: notifyLockChanged
  };
})();
