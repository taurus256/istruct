/*
 * popups.js — декларативные описания всплывающих меню. ЧИСТЫЕ ДАННЫЕ (как
 * ribbonConfig.js/actions.js), без логики отображения — см. popupMenu.js, он
 * рендерит DOM по этой структуре и резолвит action-ссылки через
 * getAction() (actions.js). Намеренно отдельный файл от ribbonConfig.js —
 * ribbon и всплывающие меню описывают разные поверхности интерфейса и
 * читаются отдельно, но оба ссылаются на общий реестр действий.
 *
 * Элементы items:
 *   { type: 'menuitem', action: <id действия из actions.js> }
 *     — имя/иконка пункта меню берутся из действия.
 *   { type: 'separator' }
 *     — тонкий разделитель между группами пунктов.
 *   { type: 'submenu', name, icon?, submenu: [...items] }
 *     — пункт-триггер вложенного меню (раскрывается по клику). icon
 *       необязателен (может быть пунктом без иконки, просто name + стрелка).
 *       Вложенность — один уровень (submenu внутри submenu не ожидается
 *       текущим popupMenu.js, см. его комментарий).
 *   visibleWhen: <ключ>
 *     — необязательное поле у 'menuitem' (действует и у верхнего уровня, и
 *       внутри submenu): пункт рендерится, только если options.visibility
 *       переданного в PopupMenu.open() объекта содержит этот ключ со
 *       значением true — см. popupMenu.js и render.js (Popups.node ниже:
 *       состав пунктов один и тот же для любого узла, но часть из них имеет
 *       смысл только при определённом состоянии узла).
 */
var Popups = {
  // Меню "⋯" у карточки схемы в панели ФАЙЛ (см. filesPanel.js).
  fileCard: {
    items: [
      { type: 'menuitem', action: 'file_delete' },
      { type: 'separator' },
      {
        type: 'submenu',
        name: 'Импорт',
        icon: 'assets/icons/arrow-down.svg',
        submenu: [
          { type: 'menuitem', action: 'file_import_json' },
          { type: 'menuitem', action: 'file_import_md' }
        ]
      }
    ]
  },

  // Контекстное меню узла (правый клик по узлу на холсте — см. render.js:
  // contextmenu-обработчик в renderNodeBox). Дублирует набор действий,
  // доступных через node__panel (панель редактирования при наведении/
  // выделении узла — см. buildEditPanel/createNoteTestButton) плюс кнопки
  // добавления дочерних узлов (makeAddButtons), сгруппированные здесь под
  // одним пунктом "Создать" с подменю — вместо ряда отдельных кнопок.
  node: {
    items: [
      {
        type: 'submenu',
        name: 'Создать',
        icon: 'assets/icons/small/create-node.svg',
        submenu: [
          { type: 'menuitem', action: 'node_add_text' },
          { type: 'menuitem', action: 'node_add_test' },
          { type: 'menuitem', action: 'node_add_link' }
        ]
      },
      { type: 'separator' },
      { type: 'menuitem', action: 'node_comment' },
      { type: 'menuitem', action: 'node_open_test', visibleWhen: 'hasTest' },
      { type: 'menuitem', action: 'node_open_note', visibleWhen: 'hasNote' },
      { type: 'menuitem', action: 'node_reset_position', visibleWhen: 'hasOffset' },
      { type: 'separator' },
      { type: 'menuitem', action: 'node_remove', visibleWhen: 'notRoot' }
    ]
  }
};
