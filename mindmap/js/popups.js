/*
 * popups.js — декларативные описания всплывающих меню. ЧИСТЫЕ ДАННЫЕ (как
 * uiConfig.js/actions.js), без логики отображения — см. popupMenu.js, он
 * рендерит DOM по этой структуре и резолвит action-ссылки через
 * getAction() (actions.js). Намеренно отдельный файл от uiConfig.js —
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
  }
};
