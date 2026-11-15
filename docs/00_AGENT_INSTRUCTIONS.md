# Инструкция агента — «Приложение СИГНАЛЫ» (signaly-app)

> Создана 15.11.2026, сессия П1. Копия этого файла лежит в проекте «Сигналы» как `app/00_AGENT_INSTRUCTIONS.md`; на конец сессии они совпадают.

## Кто ты
Разработчик приложения игрока для Android и редактора пакетов к LARP «СИГНАЛЫ». Автор не программист: отвечай по-русски, коротко, о результате говори простыми словами. Код и подробности оставляй в репозитории.

## Главные правила
1. **Репозиторий открытый.** Тексты игры, коды, имена персонажей и тайны сюжета сюда не попадают. Наполнение живёт только в пакетах `.sgpack` у автора. Тестовые данные в `tests/` вымышленные и нейтральные.
2. **Решения автора** записываются в `docs/05_DECISIONS.md` (номер, дата, вопрос, решение) и в проект, файл `claude/13_ПРИЛОЖЕНИЕ.md`. Возможность, о которой автор не просил, сначала задаётся ему вопросом.
3. **Вопросы задаются порциями по 5–7.** К каждому: что это даёт в игре, твоя рекомендация, варианты ответа.
4. **Формат пакета `.sgpack`** (`game.json` + `media/`) должен оставаться обратно совместимым. Старый пакет обязан открываться в новом редакторе и приложении. Новые поля получают значения по умолчанию в `SG.normalize`. Если меняется смысл поля, увеличь `FORMAT` и добавь перенос.
5. **Проверяй сам**: `npm run build` и `node tests/e2e.mjs playwright <снимки>` (40+ проверок: редактор → JPG QR → пакет → приложение, сканер через поддельную камеру). Каждую новую возможность добавляй в `e2e.mjs`. Снимки смотри глазами.
6. **Маленькие шаги.** Работа идёт в ветке `session-NN`: Actions проверяет её и собирает APK без релиза. В конце `git merge --ff-only` в `main`, пуш, и автор получает релиз `build-N` (APK + редактор).

## Устройство
| Файл | Что внутри |
|---|---|
| `src/common/logic.js` | Общее для плеера и редактора: `normalize`, `visibleBlocks`, `resolveCode` (master / login / chapter / open / denied / already / early / wrong), `problems`, `markup` (`#`, `**`, `_`, `~~`, `---`), `themeCss`, `readPack`/`writePack` (JSZip; медиа без сжатия) |
| `src/player/` | Приложение игрока: `index.html`, `player.css`, `player.js`. Состояние в IndexedDB (`pack` — файл пакета, `state` — `{account, chapter, byAccount: {id: {unlocked, seen}}}`). Предпросмотр: `window.name === 'sg-preview'` или `#preview`, пакет приходит через `postMessage({type: 'sg-pack', data, account, chapter, unlockAll})`, ничего не сохраняется |
| `src/editor/` | Редактор: `editor.html`, `editor.css`, `editor.js` (`h()` — построение элементов; `twoCol` — список и форма; `itemsEditor` — текст, картинка, звук; черновик в IndexedDB `signaly-editor`). QR: `qrCanvas` (qrcode-generator, схемы `gb`/`bg`/`bw`/`custom`), JPG через `canvas.toBlob`, архив через JSZip |
| `tools/build.mjs` | Собирает однофайловые `dist/editor.html` (с плеером внутри для предпросмотра) и `dist/www/index.html`. Подставляет `SG_APP_VERSION` |
| `tools/make-icons.py` | Иконка и заставка Android (PIL) |
| `android/` | Проект Capacitor 8. Правки: `AndroidManifest.xml` (CAMERA, VIBRATE, портрет), `app/build.gradle` (версия из `SG_VERSION_CODE`/`SG_VERSION_NAME`, подпись из `SG_KEYSTORE_*`) |
| `.github/workflows/build.yml` | Сборка, проверка, APK, релиз из `main` |

## Технические заметки
- Сканер — `getUserMedia` + jsQR (`inversionAttempts: 'attemptBoth'`, поэтому светлый QR на тёмном фоне тоже читается), кадр уменьшается до 640 точек, проверка раз в 150 мс. QR может содержать `SG:` в начале, он отбрасывается.
- В WebView Capacitor камеру разрешает `BridgeWebChromeClient.onPermissionRequest`, выбор файла — `onShowFileChooser`; ничего дописывать не нужно.
- Кнопку «назад» Android обрабатывает плагин `@capacitor/app`: закрывает верхнее окно, на главном экране ничего не делает. В браузере окна живут в `history.pushState`.
- Редактор открыт из файла (file://): в Chrome это безопасный контекст, `showSaveFilePicker` работает. Запасной путь — скачивание; на file:// имя файла при скачивании может теряться.
- Playwright: `setInputFiles` с **путём** на кириллице молча не срабатывает. Передавай `{name, mimeType, buffer}`.
- Поддельная камера Chromium: `--use-file-for-fake-video-capture=<.y4m>`; видео собирается ffmpeg из JPG, который сохранил редактор.
- Эффект перехода (`#glitch`) снимается таймером: `forwards` у анимации со `steps` оставлял полосы на экране.
- Секреты Actions через прокси сессии не задаются (403). Поэтому есть общий ключ `android/keystore/signaly-public.jks`, пароль к нему лежит в workflow.
- Android SDK в песочнице нет: APK собирается только в Actions. Проверить сборку — `gh run list -R smanager7777777/signaly-app`, `gh run watch <id> --exit-status`.
