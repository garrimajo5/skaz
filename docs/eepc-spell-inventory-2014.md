# EEPC и PotA · инвентарь заклинаний 2014

Два открытых PDF Elemental Evil Player’s Companion дают полный список из 43 заголовков раздела Spell Descriptions. Все 43 совпадают по имени с исходными наблюдениями dnd.su источников 107 и 109. Круг, школа и ритуальность совпадают между двумя PDF и сохранённым снимком dnd.su по каждому ID. Create Bonfire находится на странице 16 оригинального PDF и на странице 17 альтернативного. Skywrite учтён как ритуал 2-го круга. [Оригинальный PDF Wizards](https://media.wizards.com/2015/downloads/dnd/EE_PlayersCompanion.pdf), [альтернативный PDF Wizards](https://media.wizards.com/2016/downloads/DND/EE-Players-Companion.pdf).

Издательское примечание на странице 2 оригинала связывает заклинания второй главы с приложениями Princes of the Apocalypse. Вторичный снимок сохраняет исходную атрибуцию 107 и 109. Точные формулировки приложения PotA, воспроизведение издания 109, различия правил между PDF и права требуют отдельных доказательств. Для семи выбранных заклинаний уже описаны [различия снимков и исправлений](design/ee-selected-source-comparison-2014.md).

[Инвентарь](../catalog/eepc-spell-inventory-2014.json) хранит исходные ID, страницы двух PDF и проверенные поля. Аудит закрепляет источники по SHA-256, берёт пары заголовок/классификация после начала раздела описаний и требует уникальных совпадений по имени. При извлечении он восстанавливает знак апострофа в притяжательном окончании в тех заголовках, где PDF-парсер выдаёт символ замены. Исходные имена dnd.su остаются в отчёте.

```sh
python scripts/audit-eepc-spell-inventory.py --original <EE_PlayersCompanion.pdf> --alternate <EE-Players-Companion.pdf>
python -m unittest discover -s tests -p test_eepc_spell_inventory.py
node --test tests/eepc-spell-inventory.test.mjs
```

Первый вызов сверяет результат с зафиксированным отчётом. При необходимости `--output` создаёт новый файл. Оригиналы PDF остаются вне Git.
