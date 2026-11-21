# Artificer2014: шесть ограниченных errata-коррекций — #77/D05

[Отчёт](../catalog/artificer-errata-scopes-2014.json) сохраняет два новых официальных PDF/HTTP200/bytes/SHA вне Git: [Eberron v2.0](https://media.wizards.com/2020/dnd/downloads/ERftLW-Errata.pdf),2страницы, и [Tasha’s v1.0](https://media.wizards.com/2021/dnd/downloads/TCE-Errata.pdf),1страница. В каждом проверена/отрендерена страница1. Footer source versions/первичные области подтверждены; предупреждения Poppler font-weight не мешают чтению выбранных строк.

| Книга | Выбранный scope | Подтверждено исправлением | Не подтверждено |
| --- | --- | --- | --- |
|Eberron/source119 | MagicalTinkering replacement phrase | thieves’/artisan’s tools вместо прежнего tool wording | Полный feature и точный TCE-вариант |
|Eberron119 | ToolsRequired added clarification | Уточнение material component при cast через этот feature | Освобождение от стоимости/расхода материалов, другие классы, полный focus-rule |
|Eberron119 | InfusingAnItem: полный добавленный абзац | При окончании инфузии контейнера его содержимое появляется невредимым в/вокруг его пространства; Bag of Holding — пример | Все события уничтожения/экстрапространственных взаимодействий и вся InfuseItem |
|Eberron119 | RightTool replacement phrase | Изменён набор инструментов | Весь feature или время создания/полные условия |
|Tasha’s/source117 | ArtificerSpellList added marker | PurifyFoodAndDrink имеет ritual-marker в этом списке | Автоматическая подготовка/изучение, Wizard spellbook, полное Artificer ritual-rule |
|Tasha’s117 | RepeatingShot: полное заменённое предложение | При отсутствии боеприпаса создаётся одна магическая единица в момент ranged attack этим оружием | Безусловный запас патронов или вся инфузия |

Eberron119 не равен исходному TCE117 у existing Artificer candidates. Даже при одинаковом названии способности `appliesToCandidatePublicationVerified=false`; для117-исправления совпадение book-ID тоже не доказывает полный русский текст/версию. Нет автоматического применения к профилю, выданных инфузий или изменения инвентаря. Обычное отклонение предупреждает и допускает ручной путь; целостность/права сохраняются.

Для контейнера различаются infusion-end, still-active, item-destroyed и неподтверждённая версия. Программное удаление записи инвентаря не объявлено игровым событием окончания инфузии. Эти вымышленные случаи — ожидаемые результаты для будущей реализации, не выполненная UI-функция. Homunculus/SteelDefender/PerfectedArmor и остальные изменения PDF не принимались.

```sh
python scripts/audit-artificer-errata-scopes-2014.py <capture-folder> --output <report.json>
python -m unittest discover -s tests -p test_artificer_errata_scopes_2014.py
```

13 тестов: точные/повторные границы, два визуально подтверждённых discretionary wraps, триггер/безопасный исход/пример контейнера, условия атаки/боеприпаса, material/ritual без побочных исключений,119≠117, непринятые полные features и SHA. Rawprose/PDF не добавлены в Git; fixtures синтетические. Не установлены права переиздать тексты/переводы, канонические единицы, полный класс или M0. Выпуск неприменим, приложение/VPS не менялись.

Следующее: соотнести соответствующие clauses с точными Eberron119/TCE117 версиями и candidate body, не переносить Eberron на Tasha’s по имени; полный Wizard Spellcasting scope остаётся отдельным результатом. Рефлексия content: узкий errata paragraph уже подтверждает безопасный исход для содержимого, но не весь механизм инфузий. Предложениеplanner — разделять событие, source-version applicability и полноту feature; цена шесть областей/дваPDF, риск ложного cross-book применения сохранён явным source-hold.
