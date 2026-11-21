# Wizard: список и выбранные классовые условия — #77/D05

21.11.2026, content. Ограниченная сверка источников, не полный класс, не автоматизация/выпуск и не канонический знаменатель. [Текущий контекст](wizard-artificer-current-evidence-2014.md) сохраняет исходные130ID/23Artificer headings/source claims. Права/версии полного PHB/TCE и M0 остаются открытыми.

## Список заклинаний

[Отчёт](../catalog/wizard-spell-list-reference-2014.json): retained SRD5.1 PDF111–113, ровно204названия/круга, counts0–9:14/27/31/28/23/23/19/15/12/12. PDF111начинает с конца Warlock-списка, он исключён; PDF114уже Spell Descriptions/Acid Arrow. Единственная явно исправленная раскладка PDF113: Control Weathe + r → Control Weather, проверена изображением; сырой SHA не менялся.

Сохранённая ссылка Wizard19 — `/spells/?search=&class=21`. Это provider filter21 (Волшебник), не class-level21 и не sourceId. Получены14страниц, все HTTP200/байты/SHA/время удержаны внеGit. Реальные количества карточек:25/25/23/24/24/24/24/24/24/23/24/25/25/19, всего333. Не подставлять25накаждуюстраницу и не выдавать прохождение пагинации за полную выдачу класса.

198SRDимён/кругов сопоставлены в этой пагинации, в том числе17ручных именных соответствий (например Black Tentacles ↔ Evard’s Black Tentacles). Это name-only связи, не равенство полного текста/версии и не автоматические canonical aliases. Неудачное имя/круг и неоднозначный английский дубликат требуют отдельной проверки.

Шесть оставшихся названий найдены **адресным поиском с тем же class21**: Find Familiar248, Blur295, Invisibility183, Circle of Death136, True Seeing126, Plane Shift95. Удержаны отдельные6квитанций. Поиск возвращает и другие совпадения по тексту/названию, поэтому выбирается ровно одно полное английское имя и тот же круг. Это доказывает наблюдение204/204выбранныхSRDимён через разные выдачи, **не** полноту общего Wizard-каталога и **не** причину дыр в пагинации. Пропуски пагинации не объявлены отсутствующими записями.

По каждой карточке сохранены исходные sourceObservationId, URL, RU/EN title, круг, bodySHA, все legacy book plaques в исходном порядке и отдельные ссылки других версий (включая PH24). Несколько SCAG/TCE или XGE/POA плашек не сведены к одному изданию; source IDs/права не назначены по плашке автоматически. Старые записи каталога не переписаны.135других наблюдений пагинации — не «лишние/ошибочные» заклинания: SRD не охватывает весь официальный2014каталог.

TCE связывается с конкретным классом в строке, не всей карточкой. У Antipathy/Sympathy TCEпри Bard не становится пометкой Wizard. В333карточках четыре Wizard-TCE пометки: Augury40, Divination266, Speak with Dead293, Enhance Ability103. Дополнительная пара HTTP200для Augury показывает PH14плашку и Wizard-TCE: при `disableTasha=1` цель не возвращается. Это наблюдение поведения вторичного фильтра, не принятие полного TCE-правила или исключение всех текстов книги TCE. Сохранены22новыеHTTPквитанции, все без автоматических повторов; старые primaryPDF/класс повторно не скачивались.

## Магическая традиция и ASI

[Отчёт](../catalog/wizard-core-choices-2014.json): целиком выбранные Wizard30/32 —6абзацев, из них2level labels и4rule prose. SRD53Arcane Tradition и отдельный полный Feats-ввод SRD75 проверены; primary ASI53 переиспользует прежний `wizard-asi-levels`, не заявлен как повторное открытие.

- Tradition: entry2 и progression2/6/10/14 совпадают; primary eight-school/Evocation формулировка не повторена буквально, русский текст даёт навигацию в конец класса. Этот конец содержит разные source-группы и не принят как весь официальный каталог подклассов.
- ASI: Wizard-level4/8/12/16/19, одна характеристика+2 либо две разные+1; cap20относится к этому умению. Не суммарный уровень мультикласса, не глобальный запрет эффектов/ручных исключений и не повторное начисление уже импортированного ASI.
- Русский optional-feat абзац — отдельная вставка относительно primary class-ASI: черта вместо ASI по опциональному правилу, не сверх него. SRD75проверен до настоящего заголовка Grappler/Prerequisite; одноимённый пример внутри вводного текста не обрезает scope. Полный Feats-ввод не объявлен переведённым одним русским абзацем; все черты/Grappler benefits не принимаются.

Соседнее Cantrip Formulas31/TCE не наследует доказательство; нужен точный полный primaryTCE/version. Синтетические случаи в отчёте сохраняют выбор и ручное предупреждение без обязательной отметки мастера; runtime-команды не реализованы этим сравнением.

## Хиты, владения и новый класс

[Отчёт](../catalog/wizard-entry-boundaries-2014.json): полные Wizard16/17 —8абзацев; из Wizard13 выбран **только** paragraph2 о владениях, остальные3абзаца не приняты. SRD52HP/proficiencies и выбранный SRD57multiclass-контекст проверены. Skillsнабор совпадает, RU/ENпорядок сохранён отдельно.

- d6, первый уровень персонажа6+Con и последующие Wizard gains1d6или4+Con разделены. Первый Wizard-level при добавлении нового класса не получает автоматически первый-character-level максимум6+Con. Разные HitDice сохраняются отдельными типами; текущие HP не выводятся из максимума.
- Начальные Wizard saving throwsInt/Wis и выбор2из6skills не превращаются в multiclass grants: выбранная Wizard-строка multiclass-таблицы — dash/no proficiencies. Остальные11строк не приняты как новые классовые правила.
- Общий multiclass Class Features-параграф не даёт повторно начальное снаряжение. Возможные особые grants класса/Spellbook не решаются автоматически этим общим ограничением.
- Классовый абзац SRD52 не содержит явного minimum1; русский абзац содержит, Basic2018PDF12 ставит `(minimum of 1)` в предложение о сумме броска сCon. Разная буквальная позиция и границы носителей удержаны, SRD молча не исправлен; универсального runtime-clamp этот отчёт не вводит. Basic12абзац о ретроактивномCon исключён из выбранного scope.

**Следующий исполнимый content-шаг:** оставшиеся multiclass13 paragraphs0/1/3 (paragraph2сравнен). [Equipment18](wizard-equipment-2014.md) уже сопоставлен отдельным выбранным scope; его прежняя локальная hold-строка в entry-report относится только к границе того отчёта. Полные классы/TCE/Artificer/11general-body/5media и права остаются отдельно.

## Проверка и воспроизведение

Сырые HTML/PDF и изображения находятся внеGit; вGit метаданные/ограниченные факты/генераторы/тесты. CLI принимают явные файлы, не скачивают источники и не обходят доступ:

```sh
python scripts/audit-wizard-spell-list-reference-2014.py --srd <srd.pdf> --class-html <class-105.html> --secondary-dir <retained-directory-with22-receipts> --rendered-primary-pages-checked --output <list-report.json>
python scripts/audit-wizard-core-choices-2014.py --srd <srd.pdf> --class-html <class-105.html> --rendered-primary-pages-checked --output <core-report.json>
python scripts/audit-wizard-entry-boundaries-2014.py --srd <srd.pdf> --basic <basic.pdf> --class-html <class-105.html> --rendered-primary-pages-checked --output <entry-report.json>
python -m unittest discover -s tests -p test_wizard_spell_list_reference_2014.py
python -m unittest discover -s tests -p test_wizard_core_choices_2014.py
python -m unittest discover -s tests -p test_wizard_entry_boundaries_2014.py
```

21list/11core/9entry +8Equipment/33current-context/21triage =103проверки Python подтверждены текущим и переиспользуемым неизменённым пакетом. Негативные проверки: продолжения/terminal boundary, ControlWeather split, duplicateEnglish/круг, changed filter/foreignpagination/namespace, class-boundTCE, multiplebookplaques/PH24, unknownsourceSHA, full-class/runtime promotion, importedASIиmulticlass saves. Первичные PDF111–114/53/75/52/57 иBasic12 просмотрены изображениями. Изменений UI/runtime нет: браузер/Android/длительная игра здесь неприменимы; приложение/VPS/реальные профили не меняются, этапы открыты. Независимое read-only ревью exacthead нужно перед merge; это не собственная приёмка.

Рефлексия content: parser-настройка выявила несколько bookplaques и непостоянный размер страниц, поэтому догадка о25карточках отклонена; исключения не скрыты. Найдены реальные различия выдач и carrier minimum1, а не новые «дыры каталога». Предложение planner: сохранить targeted exact-name controls при остатках пагинации и привязывать optional markers к отдельному классу. Критерий пользы — ни одного ложного missing/full-class/автоматического grant; цена — адресныеcaptures/negativechecks, риск новой версии явно ограниченSHA. Общие инструкции/доступ не меняются.
