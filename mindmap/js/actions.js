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
 */
var Actions = [
  // ---- Действия ribbon-тулбара (перенесены из прежних литералов ribbonConfig.js) ----
  { id: 'scheme_import', name: 'Загрузить из файла', icon: 'assets/icons/arrow-up.svg', smallicon: 'assets/icons/small/import-json.svg' },
  { id: 'scheme_export', name: 'Сохранить в файл', icon: 'assets/icons/arrow-down.svg', smallicon: 'assets/icons/small/export-json.svg' },
  { id: 'scheme_clear', name: 'Очистить', icon: 'assets/icons/eracer.svg' },
  { id: 'node_add_text', name: 'Текст', icon: 'assets/icons/type.svg', iconNeutral: true },
  { id: 'node_add_test', name: 'Тест', icon: 'assets/icons/test.svg' },
  { id: 'node_add_link', name: 'Ссылка', icon: 'assets/icons/link.svg' },
  { id: 'node_mark', name: 'Отметить', icon: 'assets/icons/check.svg' },
  { id: 'node_remove', name: 'Удалить', icon: 'assets/icons/trash.svg', smallicon: 'assets/icons/small/trash.svg' },

  // ---- Цвет фона узла (группа "Цвета", вкладка УЗЛЫ) — см. Model.setColor/
  // Render.setNodeColor. Иконки — цветные квадраты-образцы (Figma: node-id
  // 405:2495), smallicon намеренно не задан: эти действия используются
  // ТОЛЬКО как smallbutton (24px), icon у них и есть нужный размер.
  { id: 'node_color_yellow', name: 'Желтый', icon: 'assets/icons/node-color-yellow.svg' },
  { id: 'node_color_gray', name: 'Серый', icon: 'assets/icons/node-color-gray.svg' },
  { id: 'node_color_green', name: 'Зелёный', icon: 'assets/icons/node-color-green.svg' },
  { id: 'node_color_pink', name: 'Розовый', icon: 'assets/icons/node-color-pink.svg' },
  { id: 'node_color_blue', name: 'Голубой', icon: 'assets/icons/node-color-blue.svg' },
  { id: 'node_color_reset', name: 'По умолчанию', icon: 'assets/icons/node-color-reset.svg' },
  { id: 'help_docs', name: 'Справка', icon: 'assets/icons/book.svg' },
  { id: 'notes_panel', name: 'Панель', icon: 'assets/icons/panel.svg' },
  { id: 'theme_toggle', name: 'Тема', icon: 'assets/icons/theme.svg', iconNeutral: true },

  // ---- Действия всплывающего меню карточки схемы (панель ФАЙЛ, см. popups.js) ----
  { id: 'file_delete', name: 'Удалить', icon: 'assets/icons/trash.svg', smallicon: 'assets/icons/small/trash.svg' },
  { id: 'file_import_json', name: 'Импорт JSON', icon: 'assets/icons/arrow-down.svg', smallicon: 'assets/icons/small/import-json.svg' },
  { id: 'file_import_md', name: 'Импорт MD', icon: 'assets/icons/import-md.svg', smallicon: 'assets/icons/small/import-md.svg' },

  // ---- Действия контекстного меню узла (правый клик, см. Popups.node) ----
  // Дублируют то, что уже есть в node__panel (render.js: editOrAddComment/
  // resetBtn/createNoteTestButton/deleteNode), но как Action — для меню.
  // node_open_test/node_reset_position — своей 48px-версии нет (вне
  // контекстного меню нигде не используются как большая кнопка), поэтому
  // сразу 24px-ассет в icon. node_comment/node_open_note теперь имеют обе
  // версии (Figma: Icons Grid 467:2611/471:2523).
  { id: 'node_comment', name: 'Комментарий', icon: 'assets/icons/comment.svg', smallicon: 'assets/icons/small/comment.svg' },
  { id: 'node_open_test', name: 'Открыть тест', icon: 'assets/icons/small/test.svg' },
  { id: 'node_open_note', name: 'Открыть заметку', icon: 'assets/icons/note.svg', smallicon: 'assets/icons/small/note.svg' },
  { id: 'node_reset_position', name: 'Сбросить позицию', icon: 'assets/icons/small/undo-2.svg' },

  // ---- Действия контекстного меню фона канвы (правый клик по пустому месту
  // #mindmap-root вне узлов, см. Popups.canvas/render.js). zoom_in/zoom_out
  // дублируют Zoom.zoomIn/zoomOut (колесо+Ctrl, Alt+"+"/"-") как пункты меню —
  // своей 48px-версии нет (нигде не используются как большая ribbon-кнопка),
  // поэтому сразу 24px-ассет в icon, как у node_comment/node_reset_position выше.
  { id: 'scheme_zoom_in', name: 'Увеличить', icon: 'assets/icons/small/zoom-in.svg' },
  { id: 'scheme_zoom_out', name: 'Уменьшить', icon: 'assets/icons/small/zoom-out.svg' },

  // ---- Действия панели ФАЙЛ (см. ButtonPanels.files/buttonPanel.js,
  // filesPanel.js) — ДРУГОЕ действие, чем file_import_json/scheme_import
  // выше: создаёт НОВУЮ схему из выбранного файла, а не перезаписывает
  // существующую (см. Storage.importAsNewScheme в filesPanel.js).
  { id: 'file_create_new', name: 'Создать новую схему', icon: 'assets/icons/small/plus.svg' },
  { id: 'file_import_new', name: 'Загрузить из файла', icon: 'assets/icons/arrow-down.svg' },

  // ---- Действия нижней панели кнопок прохождения теста (см.
  // ButtonPanels.testIntro/testQuestion/testResult, test.js). Стиль кнопок —
  // тот же, что в панели ФАЙЛ (см. .btn-panel в layout.css): primarybutton
  // без иконки (главное действие экрана), button — с иконкой, как у
  // file_import_new выше.
  { id: 'test_start', name: 'Начать тест' },
  { id: 'test_submit', name: 'Ответить' },
  { id: 'test_finish', name: 'Завершить тест', icon: 'assets/icons/small/cross.svg' },
  { id: 'test_return', name: 'Назад' },
  { id: 'test_retry', name: 'Пройти ещё раз', icon: 'assets/icons/small/redo.svg' }
];

// Быстрый поиск действия по id. Возвращает null, если действие не найдено —
// вызывающий код (ribbonRenderer.js/popupMenu.js) решает сам, что делать
// (пропустить элемент с предупреждением в консоль, а не падать всем приложением).
function getAction(id) {
  for (var i = 0; i < Actions.length; i++) {
    if (Actions[i].id === id) {
      return Actions[i];
    }
  }
  return null;
}
