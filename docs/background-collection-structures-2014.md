# D04: пять страниц адаптаций предысторий

Refs #77,content. [Новый аудит](../catalog/background-collection-structures-2014.json) воспроизводит пять точных вторичных карточек/23заголовка:URL/og:url/data-id/область статьи/SHA. [Выборка](../catalog/background-collection-structure-selection-2014.json) сохраняет заранее рассмотренные признаки; число заголовков само по себе не классифицирует любой документ.

| ID | Предложенный тип страницы | Что не считать автоматически |
|---|---|---|
|845 VRGR|Сборник заменяемых особенностей|Одну самостоятельную предысторию|
|846 OTA|Альтернативные особенности/привязанности приключения|Обязательные бонусы каждому герою|
|847 HDQ|Альтернативные особенности/привязанности приключения|Новую полную предысторию|
|848 EGW|Адаптации существующих предысторий сеттинга|Пять новых принятых правил по пяти заголовкам|
|856 SDQ|Кампанийные бонусы/выборы по уровням|Автоматическую выдачу черт всем профилям|

Аудит подтверждает структуру именно reference-страниц; семантическое решение теперь отдельно принято после независимого обзора вступлений и структуры. Старые page-kind proposals, sourceIds, ID и пустые английские имена сохранены. Пять сборников не выданы за пять принятых canonical backgrounds. Полные первичные разделы по прежним ссылкам остаются непрочитанными; publisher contents не заменяют их текст. Пользовательский ручной выбор и исключения не блокируются классификацией справочника.

Восемь новых Python-тестов и два существующих Node-теста классификации: навигация/script/comments исключены, точный ID обязателен, redirect/SHA/подмена источника/потеря заголовка/английское имя/автоматическая выдача отвергаются. Реальные пятьHTTP200 воспроизводят JSON. Три входа закреплены SHA. Скрипт audit-background-collection-structures-2014.py читает только локальные безопасные цифровые имена HTML; источник не перезаписывается.

accepted/complete:false,denominator:null,0canonical/standalone accepted. Runtime/профили/production не меняются, выпуск приложения/browser/Android неприменимы. После read-only ревью — отдельные решения о типе reference-страницы; компоненты/полные правила/права не принимаются этим пакетом. Оставшиеся пять алфавитных диагностик D04 рассматриваются отдельно, автоматическая транслитерация запрещена.

Рефлексия: generic params на реальной странице может охватывать почти весь материал; вывод полного текста оказался лишним. Свидетельство ограничено metadata/заголовками точной карточки и исключает комментарии. Предложение — выводить только локаторы/счётчики до изучения тела; польза меньше шума/повторных чтений, затраты малы, риск пропуска семантики покрывает отдельный содержательный обзор. Общие инструкции не меняются.

## Ограниченное решение после независимого ревью

[Решения](../catalog/background-reference-kind-decisions-2014.json) принимают только пять типов reference-страниц, с reviewedHead/публичной ссылкой на независимое заключение и пятью точными HTML-SHA. Первичный структурный отчёт остаётся историческим состоянием до этого решения. `verify-background-reference-kinds-2014.mjs` не позволяет перенести решение на изменившиеся байты/тип/источник. Шесть Node-тестов отвергают изменение полноты, знаменателя, состава, full rules, авто-бонусов и ограничений ручного выбора. Этапы не закрываются; fullPrimaryRulesAccepted и acceptedComponentUnits равны0.

## Особенности Ravenloft 2021 и одноимённые предыстории

Для наблюдения 845 оглавление Van Richten’s Guide to Ravenloft помещает General Background Features в главу создания персонажа рядом с отдельными Haunted One и Investigator. В сообщении №94 от 20 мая 2021 сотрудник D&D Beyond Halfwing поясняет, что пять новых особенностей можно использовать как замену особенности выбранной предыстории. Он описывает ограничение тогдашнего конструктора, который не умел предлагать только особенность. [Оглавление 2021](https://www.dndbeyond.com/sources/dnd/vrgtr) · [Сообщение №94](https://www.dndbeyond.com/forums/d-d-beyond-general/release-issues-support/108683-van-richtens-guide-to-ravenloft-issues-and-support?page=5).

| Заголовок в наблюдении 845 | Совпадение имени в указателе издателя | Следствие для сверки |
| --- | --- | --- |
| Странник тумана | Mist Wanderer в Ravenloft: The Horrors Within (2026) | Предыстория другой публикации. |
| Духовный медиум | Spirit Medium в Ravenloft: The Horrors Within (2026) | Предыстория другой публикации. |
| Наследник | Inheritor, цифровая карточка 26 из Sword Coast Adventurer’s Guide (2015) | Та же эпоха и имя требуют проверки связи с особенностью из сборника 2021. |

Две записи 2026 издатель прямо называет предысториями. В текущем индексе рядом с ними указан именно Ravenloft: The Horrors Within. Старую карточку Inheritor индекс относит к SCAG, её прямой URL ведёт на страницу покупки. Эррата SCAG фиксирует изменение снаряжения для Inheritor на с. 150. Эта поправка привязана к карточке SCAG. [Эррата SCAG](https://www.dndbeyond.com/sources/dnd/sae/sword-coast-adventurers-guide). Обе главы Ravenloft также потребовали доступ к книгам. Полные тексты, соответствие отдельных правил и права ещё требуют проверки. [Оглавление 2026](https://www.dndbeyond.com/sources/dnd/rthw) · [Разбор издателя](https://www.dndbeyond.com/posts/2169-everything-you-need-to-know-about-ravenloft-the?page=2) · [Указатель предысторий](https://www.dndbeyond.com/backgrounds).

[Три именованных кандидата](../catalog/background-ravenloft-source-witness-2014.json) привязаны к исходным заголовкам. Сопоставление по имени оставляет версии и типы отдельными. Следующий шаг — получить разрешённый первичный раздел 2021 и проверить состав пяти самостоятельных особенностей и их границы. Рабочий каталог и ранее принятый тип страницы 845 сохраняют текущий статус.

## Варианты приключений, Wildemount и кампанийные черты

[#77 D04](https://github.com/garrimajo5/skaz/issues/77). Четыре исходных наблюдения связаны с разделами издателя. [Реестр свидетельств](../catalog/background-adventure-source-witnesses-2014.json).

| Наблюдение | Что подтвердил издатель | Что ещё сверять |
| --- | --- | --- |
| 846, Out of the Abyss | В Appendix A отдельно указаны Substitute Features и Substitute Bonds. [Оглавление](https://www.dndbeyond.com/sources/dnd/oota). | Две особенности и привязанности по полному тексту. Ссылка на приложение открывает магазин. |
| 847, Hoard of the Dragon Queen | Оригинал и Tyranny of Dragons имеют Appendix A: Backgrounds. В январе 2023 D&D Beyond описал объединение Hoard и Rise с правками. [Оригинал](https://www.dndbeyond.com/sources/dnd/hotdq) · [объединённая книга](https://www.dndbeyond.com/sources/dnd/tod) · [запись от 17.01.2023](https://www.dndbeyond.com/changelog). | Тождество формулировок требует обоих приложений. Ссылка оригинала ответила 404, объединённая ведёт в магазин. |
| 848, Explorer’s Guide to Wildemount | В Ch. 4 есть раздел Adapting Backgrounds рядом с Grinner и Volstrucker Agent. [Оглавление](https://www.dndbeyond.com/sources/dnd/egtw). | Состав пяти адаптаций и отличия от базовых предысторий. Полный раздел ведёт в магазин. |
| 856, Dragonlance: Shadow of the Dragon Queen | В главе создания есть отдельные блоки Backgrounds и Feats. В открытом материале Knight of Solamnia даёт Squire of Solamnia, Mage of High Sorcery даёт Initiate of High Sorcery. [Оглавление](https://www.dndbeyond.com/sources/dnd/sotdq) · [материал издателя](https://www.dndbeyond.com/posts/1364-dragonlance-backgrounds-and-feats-answer-the-call). | Полные условия и варианты бонусных черт на 1-м и 4-м уровнях. Глава требует доступ к книге. |

### Граница правил Dragonlance и Adventurers League

В историческом Player’s Guide v14.0 на с. 1 общие правила создания персонажа предлагают Skilled или Tough при предыстории без черты. В отдельном разделе Dragonlance на с. 4 разрешено использовать книгу кампании. Упоминания Magic Initiate на этой странице принадлежат другим разделам. Из соседнего Planescape эта опция в Dragonlance не переносится. [AL Player’s Guide v14.0](https://media.dndbeyond.com/compendium-images/ddal/reference-docs/03-2024/d%26d-adventurers-league-player%27s-guide-v14.0.pdf).

На с. 16 Adaptation Guides v2.4 раздел создания персонажа для Dragonlance отсылает к Player’s Guide. С. 40 относит Out of the Abyss к кампании Forgotten Realms, с. 56 там же рассматривает Hoard и Rise под Tyranny of Dragons. Эти сведения относятся к организованной игре. Правила домашних кампаний и бонусная черта на 4-м уровне остаются на отдельной сверке. [AL Adaptation Guides v2.4](https://media.dndbeyond.com/compendium-images/ddal/reference-docs/03-2024/d%26d-adventurers-league-adaptation-guides-v2.4.pdf).

Эррата Dragonlance 2022 меняет Lunar Boons на с. 34 в той же главе. Эррата Tyranny of Dragons 2023 содержит, в частности, поправку Guard Drake в приложении D. Ни одна из просмотренных правок не устанавливает содержание нужных вариантов предысторий. [Эррата Dragonlance](https://media.dndbeyond.com/compendium-images/errata/DSotDQ/DSotDQ-errata.pdf) · [эррата Tyranny of Dragons](https://media.dndbeyond.com/compendium-images/errata/ToD/ToD-Errata.pdf).

### Проверки и передача

`python scripts/audit-d04-background-adventure-sources-2014.py --directory <снимки>` проверяет SHA и число страниц четырёх PDF, затем сверяет семь выбранных областей. Имя каждого файла, источник и SHA указаны в реестре. Визуально сверены с. 1 и 4 Player’s Guide и с. 16 Adaptation Guides. Случай Magic Initiate обнаружен при сравнении колонок. Подборка источников, существующие типы страниц и права сохранены. Полные компоненты и автоматическая выдача черт требуют новой проверки.

Рефлексия для планировщика. Поиск по странице AL нашёл Magic Initiate рядом с Dragonlance. Для многоколоночных правил стоит фиксировать заголовок, конец области и читабельный кадр до расчёта. Стоимость — один рендер страницы. Польза — предупреждение переносов между кампаниями, включая текст с ошибочной отсылкой.
