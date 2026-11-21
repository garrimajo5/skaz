# Wizard Equipment18: полный выбранный scope — #77

[Отчёт](../catalog/wizard-equipment-2014.json) сопоставляет весь выбранный раздел сохранённого Wizard HTML: вводный абзац, четыре list items и абзац альтернативных средств. Это source-сравнение, не полный класс/оригинальная PHB-версия/права, не применение инвентаря и не выпуск.

Primary: SRD5.1 PDF52 Equipment до Wizard table; Basic2018 PDF45 Starting Equipment и только Wizard-строка Starting Wealth by Class. Изображения просмотрены, SHA обоих прежних PDF сохранены. Четыре строки wealth-таблицы не превращены в проверку всех классов. Нового HTTP не было.

Обычный стандартный набор добавляется к фоновому: quarterstaff **или** dagger; component pouch **или** arcane focus; scholar’s pack **или** explorer’s pack; spellbook. Не выдавать оба варианта в каждой паре автоматически. Содержимое наборов, цены и canonical item IDs этим сравнением не приняты.

Альтернатива — **4d4×10 gp вместо обоих начальных наборов класса и предыстории**, а не дополнительное золото вместе с ними. В выбранном SRD Wizard-абзаце этой строки нет; сохранён отдельный Basic45контекст. Новое получение Wizard-level при мультиклассировании не переигрывает generic starting equipment; специфические Spellbook/feature grants остаются отдельным вопросом.

Отклонения от этих обычных условий предупреждают и допускают ручное сохранение, без обязательной отметки мастера. Сам выбор/бросок/выдача имущества не автоматизированы этим пакетом. Парсер отказывается принимать незамеченный текст, новый семантический элемент, потерянный list item или обрезанный альтернативный абзац; типы частей сохраняются отдельно.

```sh
python scripts/audit-wizard-equipment-2014.py --class-html <class-105.html> --srd <srd.pdf> --basic <basic.pdf> --rendered-primary-pages-checked --output <report.json>
python -m unittest discover -s tests -p test_wizard_equipment_2014.py
```

8Equipment +33current-context/21triage Python PASS; source CLI выполнен на реальных сохранённых PDF/HTML. Прежние проверки неизменённых list/core/entry переиспользуются. Source-only, UI/Android/runtime/VPS неприменимы. Независимое exact-head read-only review перед merge; #77/M0/этапы не закрывать.

Следующий content: **только оставшиеся Wizard multiclass13 paragraphs0/1/3** (optional rule/prerequisite/slot context). Paragraph2уже сравнен; class-known/prepared и caster-slot-level не объединять, полную TCE/Artificer применимость не наследовать.

Рефлексия content: label-only подход потерял бы альтернативный абзац и фоновые вещи; complete ordered parts устраняет риск. Предложение planner: сохранить отдельные source-свидетельства standard choices и alternate wealth и не выдавать их совместно автоматически. Польза — отсутствие повторных starting grants; цена — один parser/test scope, риск ограничен исходнымSHA. Общие инструкции не меняются.
