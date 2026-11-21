# D05: текущая сверка публикаций — #77

21.11.2026. [Воспроизводимый отчёт](../catalog/d05-current-publication-triage-2014.json) сохраняет все исходные 15 provider-ссылок, порядок 70 исторических sourceId и семь исторических строк без связи. Это очередь работы, а не знаменатель полноты каталога.

## Проверенные ограниченные свидетельства

| Provider | Подтверждённая граница | Что ещё требуется |
| --- | --- | --- |
|1 Basic Rules | [Три носителя/TOC](basic-rules-publication-boundary-2014.md); [один полный Arcane Recovery](wizard-recovery-source-comparison-2014.md) | Выбор версий/единиц, остальные правила и права; один unit не весь класс |
|34 Rrakkma | [Собственный DDIA-MORD, вводное for-MToF](rrakkma-publication-boundary-2014.md), 5e rewrite старого 3e | Полные записи, версии, права; не alias/contained-in/genericAL169 |
|37 Wayfinder | [Прототип и граница старых/обновлённых механик](wayfinder-version-boundary-2014.md), AL guide18 | Официальность конкретной версии и полный текст; AL не запрещает обычные действия профиля |
|53 Sage Advice | [Библиография/authority первой страницы](sage-advice-publication-boundary-2014.md), v2.7 | Все ответы, версии, единицы правил и права |
|62 Frozen Sick | [Отношение к Wildemount](frozen-sick-publication-component-2014.md), отдельный public canonical/h1 | Полный child scope/version, сравнение с parent, единицы и права |
|92 Radiant Citadel | [Первый setting hub chapter, отдельная раздача](radiant-citadel-chapter-boundary-2014.md), ended claim notice | Полная глава, версии и записи; не вся антология, не доказательство нулевого числа правил |
|93 Spelljammer Academy | [Четыре части, подготовка к Light of Xaryxis](spelljammer-academy-series-boundary-2014.md), AL48 | Полные приключения/creature units, версии и права; лимит до завершения не глобальный cap |
|94 Dragons of Stormwreck Isle | [Самостоятельная ссылка на полное приключение и один TOC](stormwreck-publication-pair-boundary-2014.md) | Полный текст и происхождение записей; исторический ID неизвестен |
|105 Prisoner13 | [Компонент Keys, отдельно от одноимённого statblock](prisoner13-publication-component-2014.md) | Законный доступ к standalone, сравнение текста/версий, adventure/creature units и права |
|116 Domains of Delight | [Официальный Dungeoncraft PDF/reference](domains-delight-reference-boundary-2014.md), отдельный продукт371449 | Полный supplement/version/правила/права; marketplace body не прочитан |
|122 Gazetteer | [Отдельная выдача Gazetteer-раздела/Backgrounds](gazetteer-component-boundary-2014.md), исторический AL25 | Полные фоны, версии и права; реклама всей книги37/12 не относится к child |
|126 Lightning Keep | [Использование монстров другого сборника](adventure-relationships-2014.md), related115/historical199 | Полные adventure/creatures, версии/происхождение; не alias/все статблоки |
|128 Intro to Stormwreck Isle | [Два encounter, один явно взят из первой главы](stormwreck-publication-pair-boundary-2014.md) | Текст Intro не прочитан; происхождение Voyage и полная эквивалентность не установлены |
|129 Heroes’ Feast | [Вдохновение рецептом из поваренной книги](adventure-relationships-2014.md) | Полное приключение/правила/версии/права; cookbook не rulebook |
|135 Vecna prequel | [Приквел135 к132/historical214/SKU134](adventure-relationships-2014.md) | Полные правила/версии/права; решение DM по3→10, не автоматическое повышение |


94 и128 используют один документ, но сохраняют две самостоятельные provider-идентичности и разные виды публикаций. У двух сохранённых тел Stormwreck не удержаны HTTP status/final URL; они не выдуманы задним числом. Intro завершился тайм-аутом чтения25 секунд, без повтора. Это ограничение происхождения отражено непосредственно в обеих строках текущего отчёта.

Все свидетельства имеют accepted/complete=false и denominator=null. Каждое привязано к точным SHA отчёта, PR head и независимому review comment. Изменение данных не наследует прежнюю проверку. Триаж не меняет canonical IDs, происхождение записей, политику официальных WotC2014 источников или ручные исключения профиля.

## Первичный проход завершён, критерии каталога остаются

Все15 исходных provider-ссылок имеют ограниченное kind-свидетельство. `primaryKindWorkQueue=[]`, `nextUntriagedProviderSourceId=null`: этот результат не означает исчерпанную очередь проекта или полный каталог. В `remainingCriteriaWorkQueue` сохранены15строк с критериями полного текста, версий, происхождения, прав и канонических единиц. Два полных выбранных Wizard-компонента (Arcane Recovery/Ritual Casting) и локальный class-reference crosswalk учитываются отдельно, не как новые публикации или автоматизация класса.

**Следующий исполнимый шаг content/D05:** Полные duration/concentration/targets противSRD102; [13casting-scopes/32p](general-casting-clauses-2014.md) уже сопоставлены с отдельнойcantriperrata/focusomission; [reference48heading/2selectedscopes](spellcasting-reference-scopes-2014.md) уже проверен в указанной границе, вся mixedстраница не принята; [таблица20/220 и вводный19](wizard-table-concordance-2014.md) уже сопоставлены с4literal дельтами и2отдельнымиTCEопциями. [Concordance8/19/19](wizard-candidate-clause-concordance-2014.md) выполнена; DMG-вставка и два пропуска learning сохранены. Точная TCE/Artificer версия — отдельный hold. Не повторять проверенные scopes; historical/retainedSHA раздельны.

Прежние crosswalk иArcane/Ritual остаются закреплёнными в этомпубликационномтриаже; его selected-counts не выдаются за глобальное число source-сравнений. Классовойдетализации соответствует отдельныйcurrent-context вход, без принятия canonical/прав/автоматизации.

У Domains116 сохранён только официальный PDF-reference/page1; marketplace body не удержан. У Feast129/Vecna135 статьи сохранены, source-body не прочитан. Ограничения не превращены в постоянный отказ доступа или полные правила. Исходные15/70/7 не изменились, права/канонические единицы не приняты.

## Проверки и передача

```sh
python scripts/review-d05-current-triage-2014.py --output <report.json>
python -m unittest discover -s tests -p test_d05_current_triage_2014.py
```

19 уникальных входных JSON (14 kind-свидетельств, два прямо закреплённых selected-rule сравнения, class-reference crosswalk, publication context и current class context), без нового HTTP. 21 Python PASS: сохранность15/70/7, пустая первичная очередь и15 оставшихся критериев, точные review pins, запрет чужого namespace/автоматической атрибуции, отдельные94/128 и явные ограничения HTTP provenance. Это проверка слоя текущей работы, а не повтор всех полных source-аудитов.

Рефлексия content: повторно скачивать уже рассмотренные источники не требуется; текущий триаж хранит точный scope, ограничения и следующий критерий. Реальные captures этого блока сохранили успешные PDF/HTML при отказах соседей; автоматических повторов0. Обнаруженный IndexError на пустой первичной очереди воспроизведён, исправлен и защищён переходом к remainingCriteria. Предложениеplanner — учесть результат испытания отдельных квитанций и явных фаз; решение не подменяет общие инструкции/доступ.

Приложение, настоящие профили, VPS, HTTPS и вход не менялись; выпуск неприменим. Своих стендов/браузерных вкладок/ADB нет. #77/M0 и этапы остаются открытыми для владельца.

Решение planner21.11: одобрить применение уже принятого capture-helper в #77 с прежними ограничениями. В12явных запросах helper сохранил все7успешных артефактов при5отказах соседей,0автоповторов; успешныеPDF не перекачивались. Сохранять отдельные стадии kind/reference-integrity/full-subsection/full-class, чтобы счётчики не заменяли scope. Это решение по методу текущей задачи, без новых общих инструкций, разрешений или расширения allowlist.
