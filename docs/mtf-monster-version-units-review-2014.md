# #77 D02 — MToF/MotM и явные варианты написания

20.11.2026,content. Пакет покрывает все112простых групп бестиария с2наблюдениями и отдельными sourceIds113/158. Сохранены224исходныхID/названия/sourceIds.221точное первичное свидетельство даёт110пар/220предложений версионныхединиц;2группы остаютсяunresolved. Это публикационныепредложения, не полныеstatblocks. Accepted/completefalse,approvedDenominatornull,acceptedCanonicalUnits0; runtime и профили не меняются.

## Источники и категория

[Оглавление Mordenkainen’s Tome of Foes](https://www.dndbeyond.com/sources/dnd/mtof), SHA HTML34eaccf9676ce15d54631f8ad72849baafa88fc186de05cf40f9db21ae01c064. Повторно использован ранее сохранённый [MotM](https://www.dndbeyond.com/sources/dnd/motm), SHA14d4d5bf4bfd41a2f75a5341b4acd57a597715bc8fbc4cc4a9887698762ede7e. Оба заголовка/книги и numeric-policy113/158 проверяются. Копировались только выбранные названия/ссылки/метаданные; исходныеHTML внеGit. Полныеправила, эррата, перевод и права использования не установлены.

Tortle встречается уMotM дважды: вfantastical-races-continued иbestiary-su. Для наблюденияbestiary выбран только допустимый bestiary-путь. Это разделение категорий, не догадка по одинаковомуимени. Ссылка на расу сама по себе не доказывает существованиеstatblock; если подходящегоbestiary-пути нет, extractor отказывает. Два подходящихbestiary-заголовка остаются ambiguous. Чужаякнига/domain/query/отсутствующийfragment не принимаются.

Общий extractor/builder получил ровно2явноразрешённых режима: прежнийvolo-motm поумолчанию и новыйmtof-motm. Неизвестный/пустойрежим отказывает. Старый Volo-отчёт и повторное извлечение исходногоVolo/MotMHTML воспроизводятся без изменений. Наблюдения двух выборок не пересекаются. Необработанные сложные/многопубликационные группы не решены этим пакетом.

## Две неопределённости и отдельные предложения написания

- Githyanki Kith'rak в наблюдениях использует прямойапостроф, первичные дваоглавления — типографскийU+2019. В базовом отчёте точное сопоставление остаётсяunresolved.
- Sacred Statue подтверждена оглавлением MToF. Для MotM см. отдельную проверку цифрового указателя ниже, исходный результат сверки оглавлений сохранён.

Отдельный `catalog/bestiary-spelling-alias-proposals-2014.json` предлагает буквально2проверяемые связи: апостроф уGithyanki Kith'rak и диакритика уDeep Rothe. Сохранены4наблюдения и3первичныхсвидетельства. ДляGith подтвержденыобаисточника; уDeep Rothé естьтолькоMotM, Volo-основание не найдено и незаимствуется из другойкниги. Итог1полное предложениесвязи и1неполное,0принятыхалиасов. Это отдельный слой: базовыеотчёты и ихсчётчики не переписаны, общая нормализация/транслитерация/автомиграция не вводятся. Идентичность механик не предполагается.

## Проверки

```sh
python scripts/extract-monster-version-evidence.py --pair mtof-motm --directory <три-HTML> --output <новый-JSON>
node scripts/review-monster-version-units-2014.mjs --pair=mtof-motm
python scripts/review-bestiary-spelling-aliases.py --directory <vgtm/mtof/motm-HTML> --output <новый-JSON>
node --test tests/mtf-monster-version-units.test.mjs tests/monster-version-units.test.mjs tests/catalog-input-hashes.test.mjs
python -m unittest discover -s tests -p test_monster_version_evidence.py
python -m unittest discover -s tests -p test_bestiary_spelling_aliases.py
node scripts/verify-catalog-input-hashes.mjs
```

16/16Node,8/8PythonдляTOC и5/5дляявныхнаписаний;316JSON/189SHA-связей,0расхождений. Негативы: race вместоmonster, двеbestiary-ссылки, чужойисточник/URL/политика, лишённыйучёта heading, неправильныйpair, изменившиесяID/имя/набористочников, исчезнувшее первичноенаписание. Синтетическиетесты не сохраняют полныетексты и не меняют входы. Предыдущие114Voloпар воспроизведены, не реализованы заново.

## Передача и рефлексия

Независимые content/QA должны воспроизвести221метаданных из2HTML и3свидетельства написаний из3HTML; геймдизайнер рассматривает публикационные варианты/буквальныеалиасы отдельно от полной игровоймеханики. Это не принятие всегоD02/M0 или знаменателя. Выпуск приложения/браузер/Android неприменимы к чисто исследовательскомуслою.

Следующий шаг#77 — сложные/другиекнижныеD02группы, гранулярностьGenasi или отдельное полноеоснованиеSacredStatue/DeepRotheVolo. Рефлексияcontent: повторноеиспользованиеMotM и строгоекатегорийное разделение сняли ложнуюнеопределённостьTortle. Предложение планировщику — при совпаденииимени сначала проверять категорию/главу, затем буквальныйалиас, не общий нормализатор. Польза — меньше ложныхдублей; затраты — явный allowlist/негативы; риск — выдатькатегорийныйиндексзаполныемеханики, поэтому статусыразделены. Решениепланировщикаещёне принято.

## Sacred Statue в цифровом указателе издателя

23.11.2026 проверены два именованных фильтра D&D Beyond. Каждый показывает ровно одну строку Sacred Statue со своим источником и карточкой. [Отчёт с SHA HTML](../catalog/sacred-statue-publication-evidence-2014.json).

| Наблюдение | Книга | Карточка издателя | CR в цифровом указателе |
| --- | --- | --- | --- |
| `dndsu:bestiary:4893`, источник `113` | MToF, [фильтр 33](https://www.dndbeyond.com/monsters?filter-search=Sacred+Statue&filter-source=33) | [96536](https://www.dndbeyond.com/monsters/96536-sacred-statue) | `0` |
| `dndsu:bestiary:6720`, источник `158` | MotM, [фильтр 85](https://www.dndbeyond.com/monsters?filter-search=Sacred+Statue&filter-source=85) | [2560907](https://www.dndbeyond.com/monsters/2560907-sacred-statue) | Пусто |

Поле CR сохранено в том виде, в котором его показывает цифровой указатель. Печатный CR обеих версий требует проверки. Без входа первая карточка перенаправила на [Legacy](https://www.dndbeyond.com/legacy), вторая — на [страницу книги в магазине](https://marketplace.dndbeyond.com/category/mordenkainen-presents-monsters-of-the-multiverse).

В [Six Faces of Death](https://media.wizards.com/2018/dnd/dragon/21/DRA21_sixfacesdeath.pdf), область 6.38, Eidolon оживляет Sacred Statue. Приключение отсылает к MToF за обоими записями. Это пример использования и ссылка на книгу. В общем оглавлении MotM найден [раздел Eidolon](https://www.dndbeyond.com/sources/motm/bestiary-ek#Eidolon), а точное название Sacred Statue появилось в цифровом указателе. Чтобы установить место статуи в печатном MotM и связь с родительским разделом, нужен доступ к странице самой книги. Обе исходные записи, базовый отчёт и открытые критерии версии и прав сохранены.

Для воспроизведения сохранить HTML двух именованных фильтров вне репозитория как `sacred-statue-mtof.html` и `sacred-statue-motm.html`, затем запустить:

```sh
python scripts/review-sacred-statue-publication-2014.py --directory <папка-HTML> --output <отчёт-JSON>
python -m unittest discover -s tests -p test_sacred_statue_publication.py
node scripts/verify-catalog-input-hashes.mjs
```

Следующее условие по этой паре — первичные страницы обеих книг, точный контекст статуи в MotM и проверка CR по печатному тексту. По #77 можно независимо брать другие открытые группы D06/D07.

## Tortle и Tortle Druid в публичном бестиарии

Четыре строки индекса издателя от 28.11.2026 сверены по точному slug.
The Tortle Package и Monsters of the Multiverse показывают одинаковые CR
у соответствующих одноимённых существ. Отличаются показанный подтип и
мировоззрение. [Публичный бестиарий](https://www.dndbeyond.com/monsters?filter-search=tortle).

| Существо | The Tortle Package | Monsters of the Multiverse |
| --- | --- | --- |
| Tortle, CR 1/4 | [36902](https://www.dndbeyond.com/monsters/36902-tortle) · Humanoid (tortle), законно-доброе | [2560942](https://www.dndbeyond.com/monsters/2560942-tortle) · Humanoid, любое |
| Tortle Druid, CR 2 | [36903](https://www.dndbeyond.com/monsters/36903-tortle-druid) · Humanoid (tortle), законно-нейтральное | [2560941](https://www.dndbeyond.com/monsters/2560941-tortle-druid) · Humanoid, любое |

У dnd.su 7048/7049 указан исходный MotM (источник 158). Наблюдения
4906/4907 относятся к Mordenkainen’s Tome of Foes (113). Они остаются
отдельными от цифровых карточек The Tortle Package, пока не установлена
точная связь публикаций. В индексе слово Tortle также встречается в
материалах создания персонажа. Путь /monsters и собственное издание
позволяют разделить категории. [Срез метаданных](../catalog/tortle-bestiary-preview-2014.json).

Ссылки конкретных карточек в проверенном доступе ведут в магазин. Полные
статблоки, версии печати и права на текст ждут отдельной проверки.
Этот срез не меняет число записей и не предлагает автоматическое слияние.
