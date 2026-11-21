# Wizard13: мультикласс и ячейки — #77/D05

[Отчёт](../catalog/wizard-multiclass-2014.json) сверяет только оставшиеся абзацы0/1/3 сохранённого Wizard13; paragraph2 о владениях переиспользует прежнее свидетельство, а не новый счётчик. Весь heading прочитан, но это классовое резюме, не перевод всех первичных правил мультиклассирования. Полные классы/версии/права/автоматизация не приняты.

Первичные границы: SRD56 prologue и prerequisite paragraph с Wizard Intelligence13строкой; полный выбранный Spellcasting-контекст с PDF57→58 до таблицы; вся таблица20уровней×9кругов. Basic2018PDF58 даёт отдельный вводный контекст optional rules/решения мастера. Точный колонтитул SRD58 исключён перед соединением частей предложения; условие single-Spellcasting class не обрезано. Все четыре PDF-страницы просмотрены изображениями, SHA удержаны, нового HTTP нет.

- Если Spellcasting feature только одного класса, применяются правила этого класса. Известные/подготовленные определяются для каждого класса отдельно, как для одиночного класса; ability/focus привязаны к классу. Пример книги из10заклинаний — пример, не предел копирования.
- Русский Int13абзац описывает Wizard-условие при входе/выходе из класса. Primary требует prerequisites **обоих** текущего/нового класса; остальные11строк таблицы этим сравнением не приняты.
- Wizard levels полностью участвуют в общей формуле; выбранный SRD называет5fullcasters иhalf-downPaladin/Ranger. Artificer/one-third-caster правила здесь не содержатся, поэтому их вклад не выдумывается как0. Агрегация нескольких нечётных halfcasters отдельно не разрешена этим отчётом.
- Таблица даёт доступные ячейки, а не право изучать/готовить высший круг. Source-example Ranger4/Wizard3:effective5, slots4/3/2, но Wizardдо2круга/Rangerдо1. Upcasting усиливает только эффект, явно описанный в заклинании; не любой cantrip или автоматические extra dice.
- Pact Magic разрешает использовать его слоты для известных/подготовленных Spellcasting-спеллов и обычные Spellcasting-слоты для известных Warlock-спеллов. Это не объединение resource-pools, восстановления, количества ячеек и не прибавление Warlocklevels к общей SRDформуле.

20×9=180числовых клеток сопоставлены с уже проверенной slot-проекцией Wizard-table; это новый carrier witness, не повторное открытие старых20/220 Wizard-клеток и не тождество class-level/effective-caster-level. Только явное em dash представлено0, неизвестный символ/потерянная строка не становится0.

Для синтетической Artificer3/Wizard6-комбинации effective caster level не объявляется проверенным этими источниками. Сохранение ручного профиля доступно; неподдержанный автоматический расчёт не выдаётся за технический отказ. Любой обычный class-limit/prerequisite/optional-rule deviation предупреждает и допускает ручной путь без обязательной отметки мастера. Права/целостность/точный повтор остаются прежними.

```sh
python scripts/audit-wizard-multiclass-2014.py --class-html <class-105.html> --srd <srd.pdf> --basic <basic.pdf> --rendered-primary-pages-checked --output <report.json>
python -m unittest discover -s tests -p test_wizard_multiclass_2014.py
```

13адресных Python PASS: cross-page condition, lost both-class prerequisite/Pact ending, complete table/dash/order/cell mismatches, source pins, no false Artificer acceptance и reuseparagraph2. Реальные источники сверены; UI/runtime/VPS не меняются, выпуска нет. Независимое exact-head read-only review нужно передmerge; #77/M0 принимает владелец.

Evocation37/38/39 теперь имеет [отдельное выбранное сравнение](wizard-evocation-low-level-2014.md). Текущий следующий критерий — [границы единиц и planner review](class-unit-granularity-proposal-2014.md); полная TCE/Artificer версия и прежние general/media критерии остаются.

Рефлексия content: header попал в условие на границеPDF, точная нормализация/негативный тест устраняют риск. Предложение planner — сохранять отдельно effective caster slots и class spell eligibility, а source gaps — unknown, не0. Польза: отсутствие ложных higher-circle grants; цена — ограниченный primary/table witness. Общие инструкции/доступ не меняются.
