/*
 * ribbonConfig.js — декларативное описание содержимого ribbon-тулбара:
 * вкладки, группы, кнопки. ЧИСТЫЕ ДАННЫЕ, без логики отображения (см.
 * ribbonRenderer.js — он рендерит DOM по этой структуре; десктопный
 * рендерер сейчас единственный, но формат данных не завязан на конкретный
 * способ отображения — в будущем по тому же RibbonConfig можно построить
 * и мобильный рендерер).
 *
 * Обычный <script> (НЕ fetch отдельного .json) — при открытии приложения
 * через file:// локальные JSON-файлы недоступны через сетевые запросы
 * (каждый file://-URL браузер трактует как отдельный origin).
 *
 * Поля элемента content:
 *   type   — 'button' (обычная ribbon-кнопка, 100x98px) или
 *            'smallbutton' (компактная кнопка 30px высотой; идущие подряд
 *            smallbutton внутри одной группы автоматически группируются
 *            рендерером в колонки максимум по 3 штуки).
 *   id     — DOM id создаваемой кнопки; ДОЛЖЕН совпадать с id, которые
 *            ожидает app.js (document.getElementById(id).addEventListener(...)) —
 *            это ключевой приём интеграции: вся существующая логика
 *            обработчиков продолжает работать без изменений, т.к. не знает,
 *            что кнопки теперь создаются динамически.
 *   name   — подпись кнопки.
 *   icon   — путь к SVG-иконке (относительно index.html).
 *   iconNeutral — (опционально, true) помечает "нейтральную" (не акцентно
 *            цветную) иконку, которая в тёмной теме инвертируется в белый
 *            цвет (см. .ribbon-btn__icon--neutral в layout.css).
 */
var RibbonConfig = {
  tabs: [
    {
       name: 'СХЕМА',
       groups: [
         {
           name: 'Схема',
           content: [
             { type: 'button', id: 'btn-import', name: 'Импорт JSON', icon: 'assets/icons/arrow-down.svg' },
             { type: 'button', id: 'btn-export', name: 'Экспорт JSON', icon: 'assets/icons/arrow-up.svg' },
             { type: 'button', id: 'btn-clear-scheme', name: 'Очистить', icon: 'assets/icons/eracer.svg' }
           ]
         }
       ]
     },
    {
      name: 'УЗЛЫ',
      groups: [
        {
          name: 'Добавить',
          content: [
            { type: 'button', id: 'btn-add-node', name: 'Текст', icon: 'assets/icons/type.svg', iconNeutral: true },
            { type: 'button', id: 'btn-add-test', name: 'Тест', icon: 'assets/icons/small/test.svg' },
            { type: 'button', id: 'btn-add-link', name: 'Ссылка', icon: 'assets/icons/link.svg' }
          ]
        },
         {
          name: 'Действия',
          content: [
            { type: 'button', id: 'btn-mark-node', name: 'Отметить', icon: 'assets/icons/check.svg' },
            { type: 'button', id: 'btn-remove-node', name: 'Удалить', icon: 'assets/icons/trash.svg' }
          ]
        }
      ]
    },
    {
      name: 'ВИД',
      groups: [
        {
          name: 'Показать',
          content: [
            { type: 'button', id: 'btn-help-docs', name: 'Справка', icon: 'assets/icons/book.svg' },
            { type: 'button', id: 'btn-notes', name: 'Панель', icon: 'assets/icons/panel.svg' },
          ]
        },
        {
          name: 'Инструменты',
          content: [
            { type: 'button', id: 'btn-theme', name: 'Тема', icon: 'assets/icons/theme.svg', iconNeutral: true }
          ]
        }
      ]
    },
    {
      name: 'ИНСТРУМЕНТЫ',
      groups: [
        {
          name: 'Инструменты',
          content: [
            { type: 'button', id: 'btn-theme', name: 'Тема', icon: 'assets/icons/theme.svg', iconNeutral: true }
          ]
        }
      ]
    }
  ]
};
