/*
 * actions.js — реестр "действий" (Action): операция как таковая — системный
 * идентификатор, подпись для пользователя, обычная и малая иконки.
 * ЧИСТЫЕ ДАННЫЕ, без логики (как и ribbonConfig.js/popups.js). Один Action может
 * переиспользоваться в нескольких местах интерфейса (ribbon-кнопка И пункт
 * всплывающего меню и т.д.) — тогда имя/иконка редактируются один раз.
 *
 * Поля действия:
 *   id          — системный идентификатор действия (НЕ DOM id — на одно и то
 *                 же действие в разных вкладках/меню может приходиться
 *                 несколько разных DOM-элементов, см. theme_toggle ниже).
 *   name        — подпись, показываемая пользователю.
 *   icon        — путь к обычной (48px) SVG-иконке, относительно index.html.
 *   smallicon   — (опционально) путь к малой (24px) SVG-иконке. Если не
 *                 задана — используется icon, но отрисовывается в меньшем
 *                 размере (см. вызывающий код: ribbonRenderer.js для
 *                 smallbutton, popupMenu.js для пунктов меню).
 *   iconNeutral — (опционально, true) "нейтральная" (не акцентно цветная)
 *                 иконка — в тёмной теме инвертируется в белый цвет (см.
 *                 .ribbon-btn__icon--neutral в layout.css).
*   lockedAvailable — (опционально, true) действие доступно в режиме «только
 *                 для чтения» (схема курса, Model.isLocked()). Без флага
 *                 ActionManager его не запускает, а все кнопки/пункты меню с
 *                 ним скрываются; вкладки/группы/подменю, в которых не
 *                 осталось видимых элементов, скрываются следом.
 *   target      — (опционально) действие работает с узлом: если вызывающий не
 *                 передал контекст (ribbon, горячие клавиши), ActionManager
 *                 подставляет выделенный узел ('node'; без выделения действие
 *                 не выполняется) или выделенный узел либо корень ('nodeOrRoot').
 * Обработчики регистрируют модули-владельцы через ActionManager.register.
 */
var Actions = [
  // ---- Действия ribbon-тулбара (перенесены из прежних литералов ribbonConfig.js) ----
  { id: 'scheme_import', name: 'Загрузить из файла', icon: 'assets/icons/arrow-down.svg', smallicon: 'assets/icons/small/import-json.svg', lockedAvailable: true },
  { id: 'scheme_export', name: 'Сохранить в файл', icon: 'assets/icons/arrow-up.svg', smallicon: 'assets/icons/small/export-json.svg' },
  { id: 'scheme_export_locked', name: 'Экспортировать курс', icon: 'assets/icons/export_locked.svg', smallicon: 'assets/icons/small/export_locked.svg', lockedAvailable: true },
  { id: 'scheme_clear', name: 'Очистить', icon: 'assets/icons/eracer.svg' },
  { id: 'node_add_text', name: 'Текст', icon: 'assets/icons/type.svg', iconNeutral: true, target: 'nodeOrRoot' },
  { id: 'node_add_test', name: 'Тест', icon: 'assets/icons/test.svg', target: 'nodeOrRoot' },
  { id: 'node_add_link', name: 'Ссылка', icon: 'assets/icons/link.svg', target: 'nodeOrRoot' },
  { id: 'node_mark', name: 'Отметить', icon: 'assets/icons/check.svg', target: 'node', lockedAvailable: true },
  { id: 'node_remove', name: 'Удалить', icon: 'assets/icons/trash.svg', smallicon: 'assets/icons/small/trash.svg', target: 'node' },
  // Без кнопок: вызываются горячими клавишами (Enter, Ctrl+Z/Ctrl+Y) и кнопками
  // Undo/Redo рядом с вкладками ribbon (ribbonRenderer.js).
  { id: 'node_edit', name: 'Редактировать текст', target: 'node' },
  { id: 'edit_undo', name: 'Отменить', icon: 'assets/icons/small/undo.svg', lockedAvailable: true },
  { id: 'edit_redo', name: 'Повторить', icon: 'assets/icons/small/redo.svg', lockedAvailable: true },

  // ---- Цвет фона узла (группа "Цвета", вкладка УЗЛЫ) — см. Model.setColor/
  // Render.setNodeColor. Иконки — цветные квадраты-образцы (Figma: node-id
  // 405:2495), smallicon намеренно не задан: эти действия используются
  // ТОЛЬКО как smallbutton (24px), icon у них и есть нужный размер.
  { id: 'node_color_yellow', name: 'Желтый', icon: 'assets/icons/node-color-yellow.svg', target: 'node', lockedAvailable: true  },
  { id: 'node_color_gray', name: 'Серый', icon: 'assets/icons/node-color-gray.svg', target: 'node', lockedAvailable: true  },
  { id: 'node_color_green', name: 'Зелёный', icon: 'assets/icons/node-color-green.svg', target: 'node', lockedAvailable: true  },
  { id: 'node_color_pink', name: 'Розовый', icon: 'assets/icons/node-color-pink.svg', target: 'node', lockedAvailable: true  },
  { id: 'node_color_blue', name: 'Голубой', icon: 'assets/icons/node-color-blue.svg', target: 'node', lockedAvailable: true  },
  { id: 'node_color_reset', name: 'По умолчанию', icon: 'assets/icons/node-color-reset.svg', target: 'node', lockedAvailable: true  },
  { id: 'help_docs', name: 'Справка', icon: 'assets/icons/book.svg', lockedAvailable: true },
  { id: 'notes_panel', name: 'Панель', icon: 'assets/icons/panel.svg', lockedAvailable: true },
  { id: 'theme_toggle', name: 'Тема', icon: 'assets/icons/theme.svg', iconNeutral: true, lockedAvailable: true },
  // Вкладка ФАЙЛ ribbon (nonSwitching) и Alt+3 — открыть/закрыть панель схем.
  { id: 'files_panel', name: 'Файл', lockedAvailable: true },

  // ---- Действия всплывающего меню карточки схемы (панель ФАЙЛ, см. popups.js) ----
  { id: 'file_delete', name: 'Удалить', icon: 'assets/icons/trash.svg', smallicon: 'assets/icons/small/trash.svg', lockedAvailable: true },
  { id: 'file_import_json', name: 'Импорт JSON', icon: 'assets/icons/arrow-down.svg', smallicon: 'assets/icons/small/import-json.svg' },
  { id: 'file_import_md', name: 'Импорт MD', icon: 'assets/icons/import-md.svg', smallicon: 'assets/icons/small/import-md.svg' },

  // ---- Действия контекстного меню узла (правый клик, см. Popups.node) ----
  // Дублируют то, что уже есть в node__panel (render.js: editOrAddComment/
  // resetBtn/createNoteTestButton/deleteNode), но как Action — для меню.
  // node_open_test/node_reset_position — своей 48px-версии нет (вне
  // контекстного меню нигде не используются как большая кнопка), поэтому
  // сразу 24px-ассет в icon. node_comment/node_open_note теперь имеют обе
  // версии (Figma: Icons Grid 467:2611/471:2523).
  { id: 'node_comment', name: 'Комментарий', icon: 'assets/icons/comment.svg', smallicon: 'assets/icons/small/comment.svg', target: 'node' },
  { id: 'node_open_test', name: 'Открыть тест', icon: 'assets/icons/small/test.svg', target: 'node', lockedAvailable: true },
  { id: 'node_open_note', name: 'Открыть заметку', icon: 'assets/icons/note.svg', smallicon: 'assets/icons/small/note.svg', target: 'node', lockedAvailable: true },
  { id: 'node_reset_position', name: 'Сбросить позицию', icon: 'assets/icons/small/undo-2.svg', target: 'node' },

  // ---- Действия контекстного меню фона канвы (правый клик по пустому месту
  // #mindmap-root вне узлов, см. Popups.canvas/render.js). zoom_in/zoom_out
  // дублируют Zoom.zoomIn/zoomOut (колесо+Ctrl, Alt+"+"/"-") как пункты меню —
  // своей 48px-версии нет (нигде не используются как большая ribbon-кнопка),
  // поэтому сразу 24px-ассет в icon, как у node_comment/node_reset_position выше.
  { id: 'scheme_zoom_in', name: 'Увеличить', icon: 'assets/icons/small/zoom-in.svg', lockedAvailable: true },
  { id: 'scheme_zoom_out', name: 'Уменьшить', icon: 'assets/icons/small/zoom-out.svg', lockedAvailable: true },
  // Кнопка «Вернуть» в статус-баре и Alt+0.
  { id: 'scheme_zoom_reset', name: 'Вернуть', lockedAvailable: true },

  // ---- Действия панели ФАЙЛ (см. ButtonPanels.files/buttonPanel.js,
  // filesPanel.js) — ДРУГОЕ действие, чем file_import_json/scheme_import
  // выше: создаёт НОВУЮ схему из выбранного файла, а не перезаписывает
  // существующую (см. Storage.importAsNewScheme в filesPanel.js).
  { id: 'file_create_new', name: 'Создать новую схему', icon: 'assets/icons/small/plus.svg', lockedAvailable: true },
  { id: 'file_import_new', name: 'Загрузить из файла', icon: 'assets/icons/small/import-json.svg', lockedAvailable: true },

  // ---- Действия нижней панели кнопок прохождения теста (см.
  // ButtonPanels.testIntro/testQuestion/testResult, test.js). Стиль кнопок —
  // тот же, что в панели ФАЙЛ (см. .btn-panel в layout.css). Прохождение
  // теста не меняет схему — доступно и в режиме «только для чтения».
  { id: 'test_start', name: 'Начать тест', lockedAvailable: true },
  { id: 'test_submit', name: 'Ответить', lockedAvailable: true },
  { id: 'test_finish', name: 'Завершить тест', icon: 'assets/icons/small/cross.svg', lockedAvailable: true },
  { id: 'test_return', name: 'Назад', lockedAvailable: true },
  { id: 'test_retry', name: 'Пройти ещё раз', icon: 'assets/icons/small/redo.svg', lockedAvailable: true }
];

// Быстрый поиск действия по id. Возвращает null, если действие не найдено —
// вызывающий код (ribbonRenderer.js/popupMenu.js/ActionManager) решает сам, что делать
// (пропустить элемент с предупреждением в консоль, а не падать всем приложением).
function getAction(id) {
  for (var i = 0; i < Actions.length; i++) {
    if (Actions[i].id === id) {
      return Actions[i];
    }
  }
  return null;
}
