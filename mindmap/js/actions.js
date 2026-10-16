/*
 * actions.js — реестр "действий" (Action): операция как таковая — системный
 * идентификатор, подпись для пользователя, обычная и малая иконки.
 * ЧИСТЫЕ ДАННЫЕ, без логики (как и uiConfig.js/popups.js). Один Action может
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
  { id: 'scheme_import', name: 'Импорт JSON', icon: 'assets/icons/arrow-down.svg' },
  { id: 'scheme_export', name: 'Экспорт JSON', icon: 'assets/icons/arrow-up.svg' },
  { id: 'scheme_clear', name: 'Очистить', icon: 'assets/icons/eracer.svg' },
  { id: 'node_add_text', name: 'Текст', icon: 'assets/icons/type.svg', iconNeutral: true },
  { id: 'node_add_test', name: 'Тест', icon: 'assets/icons/test.svg' },
  { id: 'node_add_link', name: 'Ссылка', icon: 'assets/icons/link.svg' },
  { id: 'node_mark', name: 'Отметить', icon: 'assets/icons/check.svg' },
  { id: 'node_remove', name: 'Удалить', icon: 'assets/icons/trash.svg' },
  { id: 'help_docs', name: 'Справка', icon: 'assets/icons/book.svg' },
  { id: 'notes_panel', name: 'Панель', icon: 'assets/icons/panel.svg' },
  { id: 'theme_toggle', name: 'Тема', icon: 'assets/icons/theme.svg', iconNeutral: true },

  // ---- Действия всплывающего меню карточки схемы (панель ФАЙЛ, см. popups.js) ----
  { id: 'file_delete', name: 'Удалить', icon: 'assets/icons/trash.svg' },
  { id: 'file_import_json', name: 'Импорт JSON', icon: 'assets/icons/arrow-down.svg' },
  { id: 'file_import_md', name: 'Импорт MD', icon: 'assets/icons/arrow-down.svg' }
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
