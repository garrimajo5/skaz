# #77 D02 — двухпубликационные группы бестиария Volo/MotM

20.11.2026, content. Исследовательский слой, не выпуск полных записей. Выбраны все114групп effective-m0-review, содержащие ровно2наблюдения бестиария с отдельными sourceIds111 и158. Сохранены228ID/названий/sourceIds. Два первичных оглавления дают210точных публикационных свидетельств:103полные пары/206предложений версионных единиц,11групп unresolved. Accepted/completefalse,approvedDenominatornull,acceptedCanonicalUnits0. Другие категории и сложные группы не решены этим пакетом.

## Первичные основания

[Оглавление Volo](https://www.dndbeyond.com/sources/dnd/vgtm) и [оглавление MotM](https://www.dndbeyond.com/sources/dnd/motm) открыты напрямую. Сохранены только выбранные заголовки/ссылки/метаданные и SHA исходногоHTML; полные statblocks, изображения и переводы не копировались. HTML временные внеGit. Поддержка точнойpublication title и допустимого пути bestiary/NPC/beasts обязательна; ссылки на race-раздел, другую книгу, другой домен, query или безfragment не принимаются.

SHA HTML Volo:afaee9930e46efe51e83bf9e55c786979e3d8dc32d1ee1a34de39811bfcd6ab1. MotM:14d4d5bf4bfd41a2f75a5341b4acd57a597715bc8fbc4cc4a9887698762ede7e. Numeric policy111/158 и точные её заголовки проверяются отдельно. Это подтверждает присутствие заголовка в конкретной публикации, но не идентичность/различие механик, точную эррату, полноту statblock или права перевода. Старые профили и runtime не меняются.

## Неопределённые группы

| Группа | Что подтверждено | Что остаётся |
|---|---|---|
| Black/Blue/Green/Red/White Guard Drake | Точных цветовых заголовков в выбранных оглавлениях нет | 5пар удержаны; общийGuardDrake не подставлять за вариант |
| Deep Rothe | Точного написания безакцента нет | Не превращать Rothé в алиас автоматически |
| Nilbog,goblin гоблин | Составное исходное имя не совпало с точным заголовком | Сохранить наблюдения, отдельно проверить алиас/типстраницы |
| Firenewt Warrior | Заголовок найден уMotM | Voloне подтверждён этим индексом |
| Ox,Stench Kow | По одному заголовкуMotM | Voloне подтверждён; umbrellaCattle не назначать автоматически |
| Shadow Mastiff Alpha | Заголовок найден уMotM | ВариантVolo требует отдельного основания |

Отсутствие точного заголовка не доказывает отсутствие существа/варианта в полном тексте. Прежние свидетельства вариативности дракончиков относятся к отдельному измерениюD03 и не дают автоматического решения по версиям/правамD02.

## Дополнительные ссылки для 11 неполных пар

23.11.2026 повторно сверены только целевые заголовки двух оглавлений. SHA обоих HTML совпали с указанными выше. [Отчёт](../catalog/volo-motm-residual-locators-2014.json) сохраняет 22 наблюдения. В обоих оглавлениях найден Nilbog, а исходные составные имена остаются кандидатами на сопоставление. В MotM видна точная подпись Deep Rothé с акцентом. Volo даёт более широкий указатель Rothé (Cow). Ox и Stench Kow показаны в индексе Volo отдельными подписями, ведущими в общий раздел Cow. [Volo](https://www.dndbeyond.com/sources/dnd/vgtm), [MotM](https://www.dndbeyond.com/sources/dnd/motm).

Для Nilbog цифровая выдача подтверждает отдельные карточки 17292 с пометкой Legacy и 2560889 с подписью MotM. Первая перенаправляет на Legacy, вторая — в магазин MotM. Исходные статблоки не прочитаны. [Цифровой индекс](https://www.dndbeyond.com/monsters?filter-cr-min=3&filter-environment=9&filter-search=&filter-type=0&page=19).

Firenewt и Shadow Mastiff в Volo ведут к более широким разделам. Один заголовок Guard Drake относится к контексту всех пяти цветовых наблюдений. Для версий и алиасов всё ещё нужен подходящий первичный фрагмент. При публичной проверке ссылки на разделы Volo перенаправили на страницу Legacy. [Раздел зверей Volo](https://www.dndbeyond.com/sources/vgtm/appendix-a-assorted-beasts).

Извлечение воспроизводится командой `python scripts/review-volo-motm-residual-locators-2014.py --directory <HTML> --output <JSON>`, где в каталоге лежат `volo.html` и `motm.html`. Три проверки отчёта находятся в `tests/volo-motm-residual-locators.test.mjs`.


## Цифровые карточки Firenewt Warrior и Shadow Mastiff Alpha

23.11.2026 проверены четыре именованных фильтра издателя. Для каждой пары отдельно сохранены оба наблюдения dnd.su и карточки D&D Beyond. В Volo прежние родительские заголовки Firenewt и Shadow Mastiff остаются ссылками на книгу. [Машиночитаемый отчёт](../catalog/volo-motm-warrior-alpha-index-2014.json).

| Пара | Volo | MotM | Различие в цифровом указателе |
| --- | --- | --- | --- |
| Firenewt Warrior | `594/111`, [17246](https://www.dndbeyond.com/monsters/17246-firenewt-warrior) | `6749/158`, [2560812](https://www.dndbeyond.com/monsters/2560812-firenewt-warrior) | Humanoid (firenewt) → Elemental. CR 1/2 в обоих указателях. |
| Shadow Mastiff Alpha | `5678/111`, [17347](https://www.dndbeyond.com/monsters/17347-shadow-mastiff-alpha) | `6936/158`, [2560912](https://www.dndbeyond.com/monsters/2560912-shadow-mastiff-alpha) | CR 2 → 3. Тип Monstrosity в обоих указателях. |

В отчёте также сохранены подписи мировоззрения, SHA четырёх исходных HTML и фактически выбранные фильтры 15/Volo и 85/MotM. Числовые коды фильтров принадлежат издателю. Сопоставление полного текста, точная печатная версия, разрешение на перевод и каноничность ещё требуют своего основания. Решения по алиасам, знаменателю и данным приложения остаются открытыми.

Воспроизведение использует сохранённые анонимные HTML вне Git. Адреса фильтров перечислены в отчёте. Имена файлов имеют вид `firenewt-warrior-vgtm.html`, `firenewt-warrior-motm.html`, `shadow-mastiff-alpha-vgtm.html`, `shadow-mastiff-alpha-motm.html`.

```sh
python scripts/review-volo-motm-warrior-alpha-index-2014.py --directory <папка-HTML> --output <отчёт-JSON>
python -m unittest discover -s tests -p test_volo_motm_warrior_alpha_index.py
```

## Цифровые карточки Ox и Stench Kow

23.11.2026 проверены четыре строки именованных фильтров Volo и MotM. Сопоставлены отдельные карточки и прежние наблюдения. Заголовок `Cattle` в книге Volo остаётся указателем на контекст вариантов. [Машиночитаемая сверка](../catalog/volo-motm-ox-kow-index-2014.json).

| Запись | Volo | MotM | Различие в цифровом указателе |
| --- | --- | --- | --- |
| Ox | `644/111`, [24001](https://www.dndbeyond.com/monsters/24001-ox) | `6490/158`, [2560899](https://www.dndbeyond.com/monsters/2560899-ox) | Beast → Beast (Cattle). CR 1/4 в обеих строках. |
| Stench Kow | `645/111`, [24007](https://www.dndbeyond.com/monsters/24007-stench-kow) | `6491/158`, [2560929](https://www.dndbeyond.com/monsters/2560929-stench-kow) | Beast → Fiend (Cattle), CR 1/4 → 1/2. |

Названия, URL, источник и SHA исходного HTML зафиксированы отдельно у каждой записи. Цифровое поле `Cattle` оставлено как издательская метка. Точная печатная версия, полный текст, алиасы, разрешение на перевод и применение в расчётах остаются открытыми.

Для повторения используй четыре исходных файла `ox-vgtm.html`, `ox-motm.html`, `stench-kow-vgtm.html`, `stench-kow-motm.html`. Пути запросов есть в отчёте.

```sh
python scripts/review-volo-motm-warrior-alpha-index-2014.py --batch ox-kow --directory <папка-HTML> --output <отчёт-JSON>
```

## Цветовые карточки Guard Drake в цифровом указателе

В двух страницах издательского списка от 23.11.2026 найдены десять отдельных цветовых карточек, по пять у Volo и MotM. Общие карточки `17265` и `2560843` сохранены как указатели на контекст семейства. [Первая страница D&D Beyond](https://www.dndbeyond.com/monsters?filter-armor-class-max=&filter-armor-class-min=&filter-average-hp-max=&filter-average-hp-min=&filter-cr-max=&filter-cr-min=&filter-has-lair=&filter-is-legendary=&filter-search=drake&filter-type=0) · [Вторая страница D&D Beyond](https://www.dndbeyond.com/monsters?filter-search=drake&filter-type=0&page=2).

| Вариант | Карточка Volo | Карточка MotM |
| --- | --- | --- |
| Black Guard Drake | [dndsu:bestiary:5671](https://www.dndbeyond.com/monsters/17266-black-guard-drake) | [dndsu:bestiary:6792](https://www.dndbeyond.com/monsters/2560740-black-guard-drake) |
| Blue Guard Drake | [dndsu:bestiary:5672](https://www.dndbeyond.com/monsters/17267-blue-guard-drake) | [dndsu:bestiary:6791](https://www.dndbeyond.com/monsters/2560743-blue-guard-drake) |
| Green Guard Drake | [dndsu:bestiary:5675](https://www.dndbeyond.com/monsters/17268-green-guard-drake) | [dndsu:bestiary:6789](https://www.dndbeyond.com/monsters/2560839-green-guard-drake) |
| Red Guard Drake | [dndsu:bestiary:5676](https://www.dndbeyond.com/monsters/17269-red-guard-drake) | [dndsu:bestiary:6790](https://www.dndbeyond.com/monsters/2560903-red-guard-drake) |
| White Guard Drake | [dndsu:bestiary:5677](https://www.dndbeyond.com/monsters/17270-white-guard-drake) | [dndsu:bestiary:6788](https://www.dndbeyond.com/monsters/2560960-white-guard-drake) |

[Реестр цифровых ссылок](../catalog/guard-drake-publisher-locators-2014.json) сохраняет прежние ID и источники. Публичное открытие отдельных карточек перенаправляет на книгу/Legacy или возвращает cache miss. Подтверждение ограничено строками цифрового указателя. Версии печатных фрагментов, механика цвета, алиасы, права и знаменатель остаются открытыми.

## Артефакты и проверки

- `catalog/monster-version-publication-evidence-2014.json`:114имён,2публикации,210заголовков/ссылок и18missing-отметок по источникам.
- `catalog/monster-version-unit-proposals-2014.json`:228наблюдений без удаления/слияния,103пары и11неполных групп; ссылки на первичные метаданные и статусы полного текста/эрраты/прав.
- Экстрактор переиспользует HTMLParser существующегоraceTOC; вывод не содержит тела правил. JS-builder повторно проверяетbook/name/URL, полнуюотчётностьmissing, типгруппы и уникальностьID.

```sh
python scripts/extract-monster-version-evidence.py --directory <vgtm-и-motm-HTML> --output <новый-JSON>
node scripts/review-monster-version-units-2014.mjs
node --test tests/monster-version-units.test.mjs tests/catalog-input-hashes.test.mjs
python -m unittest discover -s tests -p test_monster_version_evidence.py
node scripts/verify-catalog-input-hashes.mjs
```

10/10Node (6новых+4общих),5/5Python;313JSON/184SHA-связи,0расхождений. Негативы: удалениеучёта/heading, чужаякнига/2024/domain/query/раздел, подменаимени/политики, дублинаблюдений/свидетельств, изменившийсявыборгрупп. Один отрицательный тест сначала поместил queryпослеfragment, где это частьfragment; исправлен вход теста, логикаURLне ослаблялась.

## Передача и рефлексия

Независимые content/QA проверяют воспроизводимость210свидетельств по исходнымHTML и ограничения11групп. Геймдизайнер проверяет выбор публикационной версии без принудительной миграции. Полные правила/эррата/права/канонический знаменатель не приняты. Приложение/браузер/Android/выпуск к этому слою неприменимы; #77/M0 открыты.

Следующий исполнимый шаг — другие D02-книги/сложные группы либо отдельные первичные основания11неполных пар; не повторять эти114групп как новый этап. Рефлексия: два общих оглавления позволили обработать весь подходящий пакет вместо одиночныхимён. Предложение планировщику — испытать то же ограниченное сопоставление на следующей точной паре публикаций; польза — меньше сетевыхзапросов, затраты — проверкадоступногоиндекса, риск — принять umbrella/похожееимя заstatblock, поэтому нет автоматическихалиасов. Решение планировщика ещё не принято.
