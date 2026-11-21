# Текущая передача Wizard/Artificer — #77/D05

[Связный JSON](../catalog/wizard-artificer-current-evidence-2014.json) сохраняет исходные130candidateID/23Artificer headings, source-claim ledger, пять прежних supplemental links и один unassigned correction. Новые co-versioned scopes не наследуют прежнее независимое ревью и не принимают канонические единицы/полный класс/права/runtime.

| Проверенная граница | Доказательства и оставшееся |
| --- | --- |
| Классовые исходные ссылки и6Artificer errata | [Матрица](wizard-artificer-source-scopes-2014.md), [errata](artificer-errata-scopes-2014.md). Точная полная TCE/Artificer версия и применимость остаются непроверенными;119/117 и RepeatingShot unassigned раздельны. |
| Wizard Spellcasting и книга | [Inventory](wizard-spellcasting-scope-2014.md), [полный sidebar](wizard-spellbook-sidebar-2014.md), [clause concordance](wizard-candidate-clause-concordance-2014.md), [таблица](wizard-table-concordance-2014.md). Selected-scope проверки не принимают весь класс; DMG-вставка/learning omissions и4literal name deltas сохранены. |
| General Spellcasting | [Текущая карта](spellcasting-current-scope-coverage-2014.md):49body,38selectedwitness/11pending; ещё5mediaheadings с7диаграммами/6подписями не приняты. Счётчики наблюдений — не denominator или число всех правил. |
| Wizard list и выборы | [Новый связанный отчёт](wizard-list-and-core-sources-2014.md):204SRDnames/circles,333pagination observations+6targeted absences,17name correspondences,4WizardTCElabels; полные30/32core scopes,16/17entry scopes и только13paragraph2. Полнота вторичного списка/оригинальной PHB версии не объявлена. |

| Мультикласс и Evocation2/6 | [Wizard13](wizard-multiclass-2014.md): paragraphs0/1/3,2reused,180primaryslotcells; [37/38/39](wizard-evocation-low-level-2014.md): три полных выбранных scope. Это не все формулы/подклассы. |
| Единицы классового каталога | [Предложение](class-unit-granularity-proposal-2014.md):130сохранённых observations/23aux, роли/occurrences/reference, без canonical/denominator/runtime. |

## Следующий исполнимый шаг

Planner: **class-unit-version-and-alias-residual-review** — проверить предложенные границы единиц по фактическим DoD #77, определить остаток полного состава/версий/дублей/прав/знаменателя и пакет для владельца. [Граница единиц](class-unit-granularity-proposal-2014.md) не задаёт canonical IDs, новый runtime-kind или1:1. Полный source-аудит каждого высокоуровневого умения не становится новым барьером M0.

Не повторять завершённые selected list/core/entry/Equipment/multiclass/Evocation scopes. Полные TCE/Artificer/CantripFormulas31,11general-body/5media, полные классы/версии/права/канонический знаменатель остаются отдельными критериями. Приоритет матрицы Эдвина сохраняется; реальные данные дляQA не использовать.

```sh
python scripts/review-current-class-evidence-2014.py --output <report.json>
python -m unittest discover -s tests -p test_current_class_evidence_2014.py
python -m unittest discover -s tests -p test_d05_current_triage_2014.py
```

36context/21triage тестов проверяют130/23/ledger/5+1/15-70-7, точныеreviewpins, partial-versus-complete scopes, отсутствие full-list/runtime grants и безопасную передачу следующего критерия. Подробности/рефлексия нового пакета — в профильном отчёте/PR; общий план не является архивом. Runtime/VPS не менялись, выпуск неприменим; #77/M0/этапы принимает владелец.
