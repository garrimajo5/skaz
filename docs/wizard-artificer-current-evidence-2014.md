# Текущая передача Wizard/Artificer — #77/D05

[Связный отчёт](../catalog/wizard-artificer-current-evidence-2014.json) связывает пять независимо проверенных результатов точными reportSHA/PRhead/reviewcomment, не переписывая исходные наблюдения:

- [130candidate/23heading матрица](wizard-artificer-source-scopes-2014.md): стабильные ID/source claims/parentlinks, без совпадения правил по одинаковому названию.
- [Шесть Artificer errata](artificer-errata-scopes-2014.md):119/117раздельны, tools/material/контейнер/ritual/ammunition только в проверенных scopes.
- [WizardSpellcasting inventory](wizard-spellcasting-scope-2014.md):9блоков/21p и3новых коротких сравнения; навигационное отличиеFocus сохранено.
- [Полный YourSpellbook](wizard-spellbook-sidebar-2014.md):7p/415слов, обязательноеSRD54→55, разницаa/that сохранена, new-copy/backup/prepared-only процедуры раздельны.

Исходная последовательность130ID и checksum ledger[sourceIds/sourceBasis] сохранены. Пять candidate-ссылок получили дополнительные указатели, не принятые полные правила. Все6errata сохраняют source/version hold; RepeatingShot оставлен одним unassigned correction, без выдуманного candidateID или наследования соседней инфузии.

Исходный Wizard reference graph сохранён. Только конкретный следующий критерий полного Spellbook-sidebar закрыт сравнением источников с явной literal-дельтой; Wizardtable/generalSpellcasting/spellList остаются, wholeFeatureAccepted=false. Source-сравнение не даёт русскому candidate PHB/TCE происхождение или право на перевод автоматически.

## Следующий исполнимый шаг

[Выбранная concordance](wizard-candidate-clause-concordance-2014.md) теперь выполнена:8разделов/19абзацев/19оценок, отдельная DMG-вставка и два пропуска learning сохранены. Это co-versioned вход данного изменения; он не наследует review прежних четырёх PR. Исходные130ID/source ledger и пять ссылок сохранены.

Теперь [таблица и вводный19](wizard-table-concordance-2014.md) сопоставлены:20строк/220чисел,4literal name deltas,2отдельныеTCEопции и2добавленные ссылки. Этот новый вход проверяется с текущим изменением и не наследует прежний review. Следующий content-шаг: **инвентаризация общей статьи Spellcasting** и её bounded primary scopes; Wizard spell list остаётся отдельно. Не повторять готовую concordance, не исправлять молча русские оговорки и не переносить правила на Artificer.

Параллельный оставшийся критерий: точная применимость к полному TCE/Artificer тексту/версии. Пока не подтверждена, не заменять её Eberron/Wizard/UA/2024/форумом. Законно доступные первичные errata подтверждают свои поправки, а не весь недоступный класс. Приоритет матрицы Эдвина остаётся; настоящий лист не читать/менять вQA.

```sh
python scripts/review-current-class-evidence-2014.py --output <report.json>
python -m unittest discover -s tests -p test_current_class_evidence_2014.py
python -m unittest discover -s tests -p test_d05_current_triage_2014.py
```

14context/21triage тестов:130/23/ledger immutable,5supplemental+1unassigned,раздельные119/117,точное закрытие однойgraphзадачи,unknown/crossclass targets,изменённыйreportне наследуетreview,stage/runtime/denominatorне принимаются. ВD05триаже добавлен19-й вход — этотcontext; прежние selected-counts относятся только к прямо закреплённым Arcane/Ritual, не ко всем source-работам проекта. НовыйHTTP/браузер/Android/runtime/VPS здесь не нужны, выпускнеприменим.

Рефлексия content: page continuation и extractor version оказались существенными для полноты. Planner: **одобрить** привязку этих данных и supported/excluded fact scopes в #77; **отложить** автоматическое применение Artificer clauses до проверки версии/текста. **Испытать** следующий связанный source/concordance пакет однимPR с полноценным независимым review вместо нескольких мелкихPR: ответственныйcontent, #77, критерии0потерьsource/ID/scope и0сокращённыхнегативныхпроверок. Польза — меньше повторов передачи иGitHubопераций; риск — слишком широкийPR, граница2–3связанныхрезультата. Общиеинструкции/цели/доступ не меняются.
