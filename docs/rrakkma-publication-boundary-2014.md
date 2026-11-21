# Rrakkma: собственный код и вводное приключение — #77 D05

21.11.2026. [Свидетельство](../catalog/rrakkma-publication-boundary-2014.json) продолжает первую доступную запись34 из текущего D05-триажа. [Первичный источник](https://www.dndbeyond.com/sources/dnd/ddia-mord) даёт собственный кодDDIA-MORD и называет приключение вводным к Mordenkainen’s Tome of Foes. [Статья издателя2018](https://www.dndbeyond.com/posts/222-rrakkma-is-an-adventure-league-gith-adventure-that) содержит одно связное заявление об исходной третьей редакции и переработке в пятую. Это не разрешение подставить старый3e-текст по совпадению названия.

Проверены ограниченный intro-blockquote и один редакционный абзац. Source235943байта/SHAef09e82c…, article353116/d4a29206…, обаHTTP200; полныеSHA/URL/время в JSON, HTML/проза внеGit. Ограниченныйscope/код не устанавливают полноту всего приключения, состав всех creature/statblock/предметов, точные версии или права публикации.

Libraryprovider34/5e/WotC/false-third-party сохранён. Вводимая книга — provider33, существующаяhistoricalсвязьdnd.su113 проверена по source-link-отчёту. Отношение **introductory-companion-for-book** не означает, что приключение напечатано внутри книги, является её алиасом или делит с ней все записи. ContainedInBook=not-established. GenericALsource169 не заполняется на основании одного кода. Numeric/canonical RrakkmaID не придуман, автоматическойатрибуции нет.

```sh
python scripts/audit-rrakkma-publication-2014.py <capture-folder> --output <report.json>
python -m unittest discover -s tests -p test_rrakkma_publication_2014.py
```

7Python PASS: код/книга в ограниченномintro, неmeta/nav, единый primaryeditionабзац, неcomments, отсутствиеложныхalias/containment/AL169. Реальный2HTMLотчёт воспроизведён, scoped-parser переиспользован с отдельнымSHA. Независимое read-only code/source ревью доmerge. Следующий шаг — добавить ограниченное свидетельство в текущий триаж после его ревью; следующий ещёнеразобранныйprovider37/Wayfinder’sGuide. Все исходные15/70, полные критерии иM0/этапы остаются открытыми, runtime/VPS/профили не менялись.

Рефлексия content: вводное приключение — другой тип связи, чем глава антологии. Предложениеplanner — не превращать рекламноеfor-book вcontained-in без прямого основания. Польза — нет ложного слияния/потери отдельныхcreatures, цена — один typedrelation; риск полного текста/версий/прав остаётся явным. Общиеинструкции/политика не менялись.
