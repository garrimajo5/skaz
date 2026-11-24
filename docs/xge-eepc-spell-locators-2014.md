# Цифровые ссылки заклинаний XGE и EEPC

В открытой выдаче D&D Beyond фильтр Xanathar’s Guide to Everything даёт 95 уникальных карточек на пяти страницах. Все 95 по имени совпали с наблюдениями источника 109. Фильтр Elemental Evil Player’s Companion даёт 43 карточки на трёх страницах. Для всех 43 совпадают URL карточек в двух фильтрах и исходные ID [сверки по PDF](eepc-spell-inventory-2014.md). [Выдача XGE](https://www.dndbeyond.com/spells?filter-source=27), [выдача EEPC](https://www.dndbeyond.com/spells?filter-source=4).

Фильтр Princes of the Apocalypse выбран и даёт пустой список. Примечание издателя в EEPC подтверждает происхождение заклинаний в печатном приложении PotA. Для сравнения полных правил нужны сами версии книг. Одинаковый цифровой URL показывает повторное использование карточки платформой. [Выдача PotA](https://www.dndbeyond.com/spells?filter-source=10), [официальный PDF EEPC, страница 2](https://media.wizards.com/2015/downloads/dnd/EE_PlayersCompanion.pdf#page=2).

[Отчёт](../catalog/xge-eepc-spell-locators-2014.json) хранит URL, SHA-256 и число строк девяти страниц, две исходные атрибуции в пересечении и отдельные страницы двух фильтров. Для воспроизведения сохранить по URL из отчёта исходные HTML как `skaz-ddb-<xge|ee|pota>-spells-<page>-20261124.html` и выполнить команды ниже. Каждый снимок должен содержать только выбранную опцию источника и правильную следующую страницу.

```sh
python scripts/audit-xge-eepc-spell-locators.py --directory <html-captures>
python -m unittest discover -s tests -p test_xge_eepc_spell_locators.py
node --test tests/xge-eepc-spell-locators.test.mjs
```

[Отдельная сверка эрраты XGE](xge-spell-errata-2014.md) добавляет четыре печатных указателя для поправок начиная с четвёртого тиража. Версии полных печатных текстов, права и общий знаменатель остаются открытыми.
