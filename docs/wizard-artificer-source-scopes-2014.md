# Wizard/Artificer: кандидаты и ограниченные источники — #77/D05

[Матрица](../catalog/wizard-artificer-source-scopes-2014.json) сохраняет130существующих candidate ID:87Wizard/43Artificer, включая подклассы/выборы/непроверенные записи. Дополнительно сохранены23Artificer-heading observations,10связей с уже существующими parent ID. Исходные массивыsourceIds, sourceBasis, порядок и снимки не переписаны.

Связь строится по явно выбранным стабильным class/feature anchors, а не по русскому названию. У трёх Wizard candidates есть соответствующие bounded source-компоненты: Spellcasting, ArcaneRecovery, ASI. Ещё три имеют только локальную SRD-ссылку;124не имеют первичного компонента **в этой матрице**, а не объявлены пропущенными/несуществующими. Этот отчёт связывает прежние свидетельства, а не выдаёт их повторный прогон за новые правила.

| Наблюдение | Связь | Ограничение |
| --- | --- | --- |
|Wizard Spellcasting/source102 | selected preparation/bonuses/learning/copying, spellbook errata, полный RitualCasting | Не весь Spellcasting, не перевод/dnd.su-PHB равенство |
|Wizard ArcaneRecovery/source102 | полный выбранный английский unit в3носителях | Не подтверждает точный русский/PHB текст или автоматизацию |
|Wizard ASI/source102 | выбранная SRD-clause | Не импортирует улучшение заново и не переносится на ArtificerASI |
|Wizard extra-spells/cantrip-formulas/source117 | исходный optionalTCE marker сохранён | Отсутствие локального SRD-ID не значит пропуск официального каталога |
|Artificer Spellcasting/ASI/source117 | ссылки остаются без Wizard-source наследования | Одинаковый русский label не доказывает одинаковое правило |
|Artificer23heading observations | исходные parentObservationId/basis сохранены | Даже одинаковый снимок не означает принятие полного текста |

Исторический102 — PHB,117 — Tasha’s. Эти sourceIds не являются provider ID или номеромSRD. Correspondence не переписывает исходные атрибуции и не даёт права на полный перевод. Даже у ArcaneRecovery completeCandidateRulesAccepted=false: сравнен английский компонент, не вся вторичная запись.

В прежнем wizard-errata-selected рядом с поправками Spellbook есть MinorConjuration. Матрица сохраняет этот факт в excludedFactKeys; в Spellcasting переданы только два соответствующих spellbook-fact и исходные limitations. Нельзя принять соседний подклассный эффект как базовую способность. Manual/choice implementation state не повышен до автоматизации; игровой ручной путь с предупреждениями сохраняется.

```sh
python scripts/review-wizard-artificer-source-scopes-2014.py --output <report.json>
python -m unittest discover -s tests -p test_wizard_artificer_source_scopes_2014.py
```

13 тестов:130/23/порядок/source claims, одинаковые labels, optionalTCE, исключённая Conjuration-clause, неоднозначные/чужие/потерянные parent ID, новый snapshot, source acceptance/status и точные SHA. Нового HTTP/повторной source-экстракции/QAпрофилей нет. Приложение/VPS не менялись, выпуск неприменим, #77/M0/этапы открыты.

Следующие критерии: полный scope WizardSpellcasting, включая не покрытые подкомпоненты/книгу; отдельные primaryArtificer исправления и доказательства версии, а не заимствование Wizard. Недоступный полный Artificer текст не заменять UA/2024 или форумом.

Рефлексия content:130metadata proposals нельзя считать130правилами; source-контекст одного unit может включать чужую clause. Предложениеplanner — сохранять supported/excluded fact keys и limitations при связывании scope. Польза — отсутствие утечки соседних правил, цена один явный mapping слой, риск ложной полноты защищён отдельными false-состояниями/независимымreview.
