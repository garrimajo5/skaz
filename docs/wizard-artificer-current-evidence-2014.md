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

[Границы мультикласса изобретателя](artificer-multiclass-sources-2014.md) добавляют официальный контекст AL, три сценария для #82 и конкретный недостающий абзац книги. Расчёт по гипотезе об округлении вклада ожидает первоисточник.

## Следующий исполнимый шаг

Общий [пакет единиц13классов](class-unit-residual-review-2014.md) сопоставляет913proposals/8kinds,13особых случаев и28multi-source observations. Discovery31 сохраняет13main+3sidekick+15excluded; [primary TOC](class-multisource-toc-2014.md) подтверждает8family+3sidekick links, не полные версии/права. Прежний130/23source-ledger не изменён и не повышен до full-class/canonical.

Следующий content: независимый оставшийся unit/variant/reference критерий D06 Folio/IMR/SKT по [конечной очереди M0](catalog-m0-exit-criteria-2014.md). Только перваяEloquence full-body/version сверка имеет конкретныйhold: два запроса дали marketplace-finalURL/200headers и timeout без body. Не повторять успешные TOC/13-class inventory и произвольные полные high-level умения; M4-правила без влияния на единицу не добавлять к барьеру M0. Полные TCE/Artificer/CantripFormulas31,11general-body/5media, версии/права/глобальный знаменатель отдельно; #77/M0принимает владелец.

```sh
python scripts/review-current-class-evidence-2014.py --output <report.json>
python -m unittest discover -s tests -p test_current_class_evidence_2014.py
python -m unittest discover -s tests -p test_d05_current_triage_2014.py
```

39context/21triage тестов проверяют130/23/ledger/5+1/15-70-7, точныеreviewpins, partial-versus-complete scopes, отсутствие full-list/runtime grants и безопасную передачу следующего критерия. Подробности/рефлексия нового пакета — в профильном отчёте/PR; общий план не является архивом. Runtime/VPS не менялись, выпуск неприменим; #77/M0/этапы принимает владелец.
