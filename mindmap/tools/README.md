# tools/

Вспомогательные скрипты для разработки (в рантайме приложения не используются).

## gen-help.js

Генерирует контент панели «Справка» из `text.md` (корень репозитория) в
`mindmap/js/help.js` — заменяет массив `SECTIONS` между маркерами
`BEGIN GENERATED SECTIONS` … `END GENERATED SECTIONS`.

```
node mindmap/tools/gen-help.js
```

Правьте `text.md`, перезапускайте генератор, коммитьте обновлённый `help.js`.
Требуется только Node.js (без зависимостей).
