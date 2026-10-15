# Сборка PDF-версии лекции

Конвейер «Markdown → HTML → Chromium (print) → пост-обработка», которым собран файл
[`../Лекция_ХДН.pdf`](../Лекция_ХДН.pdf) (A4, ≈370 страниц).

## Что делает сборка

| Этап | Инструмент | Результат |
|---|---|---|
| `build.js` | markdown-it, KaTeX (серверный рендер формул), cheerio | Один HTML-файл: обложка, страница «Как пользоваться лекцией», оглавление, титулы разделов, главы; служебные блоки (📌 ❗ 💡 🔬 📝 ❓ 🎮 ⚠) превращены в цветные врезки; русские переносы (`hyphen/ru`, мягкие переносы); якоря `⟦N⟧` в заголовках для двухпроходной сборки оглавления |
| `print.js` | puppeteer-core + headless Chromium | Mermaid v12 рендерится в браузере (тема `base`, классический вид); крупные схемы автоматически выносятся на отдельную страницу — альбомную (широкие) или портретную без полей (высокие); печать в PDF с CSS `@page` |
| `post.py extract` | PyMuPDF | карта «заголовок → страница» (`pages.json`) |
| `build.js` + `print.js` (проход 2) | — | тот же HTML с настоящими номерами страниц в оглавлении (якоря скрыты, вёрстка не меняется) |
| `post.py finalize` | pikepdf, PyMuPDF | удаление мягких переносов из текстового слоя (чтобы поиск и копирование работали), колонтитулы (название лекции / текущая глава), номера страниц, закладки (outline) по всем заголовкам, метаданные |

Для печати ромбы решений в Mermaid-схемах заменяются шестиугольниками (`{...}` → `{{...}}`):
Mermaid рисует ромб примерно вдвое больше текста, и схемы переставали помещаться на страницу A4
читаемым кеглем. Отключается переменной окружения `HEX=0`.

## Как собрать

Требования: Node.js ≥ 20, Python ≥ 3.10, Chromium/Chrome ≥ 120.

```bash
cd lecture/pdf-build
PUPPETEER_SKIP_DOWNLOAD=1 npm install          # markdown-it, katex, mermaid, cheerio, hyphen, шрифты (@fontsource)
pip install pymupdf pikepdf
export CHROME_PATH=/usr/bin/chromium            # любой Chromium; по умолчанию ищется ./chrome/chromium
./build.sh ../Лекция_ХДН.pdf                    # ≈1 мин
```

Без системного браузера можно распаковать `@sparticuz/chromium` (`npm pack @sparticuz/chromium`,
затем brotli-распаковка `bin/chromium.br`, `bin/al2023.tar.br` → `./chrome/`) — так был собран исходный файл.

## Файлы

- `build.js` — сборка HTML (аргументы: `out.html [pages.json]`);
- `style.css` — печатные стили (A4, поля 18 мм, PT Serif/PT Sans, именованные страницы `landscape`/`figure`);
- `print.js` — печать HTML в PDF через Chromium (`html pdf`);
- `post.py` — `extract` / `finalize`;
- `fonts/PT_Sans-Web-*.ttf` — PT Sans (SIL OFL 1.1, ParaType) для колонтитулов, рисуемых PyMuPDF.
