# Wizard Spellcasting: весь состав и три новых компонента — #77/D05

[Отчёт](../catalog/wizard-spellcasting-scope-2014.json) охватывает весь видимый digital-раздел от WizardSpellcasting до ArcaneRecovery: вводный блок,7подразделов и отдельная YourSpellbook-врезка —9блоков/21абзац с заголовком врезки. Ничего вне p/подзаголовков не теряется молча; список/изображение/неожиданный heading и незакрытые структуры требуют разбора, а дополнительный обычный абзац сохраняется.

Это **инвентаризация полного состава digital-feature, не принятие всех его правил**. Четыре ранее выбранных preparation/ability/ritual/learning компонента помечены как reuse, не новый результат. Книга как полный sidebar, вводный scope и ссылки на Wizard table/general spellcasting/spell list сохраняют отдельные критерии.

По уже сохранённым digital/BasicPDF/SRD сравнены три новых полных коротких подраздела:

| Компонент | Выбранные источники | Результат |
| --- | --- | --- |
|Cantrips | Basic32/SRD52/digital | Одинаков после ограниченной типографики:3заговора при входе в Wizard1, дальнейшие — по Wizard table, выбор сохраняется |
|Spellbook | Basic32/SRD52/digital | Одинаков после ограниченной типографики: начальная книга6заклинаний1круга, заговоры в неё не входят; не повторная выдача на импорт/каждом уровне |
|SpellcastingFocus | Basic32/SRD53/digital | Классовое разрешение arcane focus совпадает; буквальный текст различается навигационной отсылкой к главе5, полное text-equality=false |

Только для выбранных carrier/component исправлены визуально подтверждённые extraction splits `choic e`→`choice` (SRD52/Cantrips) и `repos - itory`→`repository` (Basic32/Spellbook), плюс прежняя ограниченная ordinal-hyphen нормализация. Нет общего ремонта слов. Basic32/SRD52/SRD53 просмотрены; source hashes/21paragraph-hashes сохранены, исходный полный текст в Git не внесён. Разница Focus классифицируется без изменения хешируемого текста и не даёт общего разрешения считать все книги равными.

```sh
python scripts/audit-wizard-spellcasting-scope-2014.py <retained-web-folder> <retained-pdf-folder> --output <report.json>
python -m unittest discover -s tests -p test_wizard_spellcasting_scope_2014.py
```

14 тестов: full inventory/sidebar, чужие классы/порядок, видимые условия/изображения/вложенныйp, захват дополнительногоp, PDF-heading против table/body word, полная граница страницы, narrow repairs, сохранённые literal-deltas, initial-versus-import/other-class, открытый reference graph и SHA. Нового HTTP или повторного скачивания нет. Ничего не перенесено в профиль, runtime/VPS неизменны, выпуск неприменим. Artificer не получает правилоWizard по одинаковому названию.

Следующий критерий — полный YourSpellbook-sidebar, включая copying/replacement/appearance, по трём сохранённым носителям; ранее проверенная base-copy-cost clause не подменяет всю врезку. Full Wizard/Artificer/подклассы/права/M0 не приняты.

Рефлексия content: целый feature нельзя получить сложением нескольких соседних проверок без проверки состава и ссылочной врезки. Предложениеplanner — сохранять reference graph и narrow repair scope; цена9блоков/3новыхcomponent-сравнения, риск ложного text-equality исключён сохранением Focus-deltas.
