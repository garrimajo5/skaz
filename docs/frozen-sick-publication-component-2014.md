# Frozen Sick: глава и отдельная публикационная ссылка — #77 D05

21.11.2026. [Свидетельство](../catalog/frozen-sick-publication-component-2014.json) касается provider62 из остатка15. [Статья издателя](https://www.dndbeyond.com/posts/1886-running-winter-adventures-in-d-d) в articleBody называет приключение частью Explorer’s Guide to Wildemount и ссылается на [отдельную главу](https://www.dndbeyond.com/sources/dnd/wa/frozen-sick). [Оглавление книги](https://www.dndbeyond.com/sources/dnd/egtw) даёт собственную ссылку на одноимённое приключение. Это первичные основания отношения компонентов, не новая редакция или доказанное текстовое равенство.

Анонимный источник `/sources/dnd/wa` перенаправляет на открытую страницу приключения, HTTP200. Здесь прочитаны только canonical/h1; adventure-проза не собирается identity-парсером и не принята целиком. В отличие от Prisoner13, это неclaim-landing. Вход/claim не выполнялись. Три исходныхHTML/SHA/URL/status/bytes/даты сохраняются только как внешние temp-артефакты, вGit — метаданные/хэши. Статья365573байта/SHA140c694d…, parent250591/99fa12a4…, child372849/4aea69c3….

## Не смешивать подпись бренда с изданием

Library показывает CriticalRole для provider59/62, thirdParty=false и ruleset5e. Эти наблюдения не переписываются. Уже независимо проверенное издательское свидетельство родителя в source-link-отчёте — WotC/официальная публикация2014, historicaldnd.su116→provider59. В новом отчёте оба утверждения раздельны. Это не автоматическое включение всегоCriticalRole и не изменение запрета владельца на сторонние книги/Tal’Dorei.

Provider62 — отдельная distribution-запись компонента. ChilddndsuSourceId=null, существующий parent116 сохранён; provider116/DomainsOfDelight не подставляется по числовому совпадению. Scope ребёнка, версия/полные правила/равенство выдачи с книжной главой, канонические единицы и права не приняты. Исторические70источников/15остатка не переписаны, denominator=null.

## Проверка и следующий шаг

```sh
python scripts/audit-frozen-sick-component-2014.py <capture-folder> --output <report.json>
python -m unittest discover -s tests -p test_frozen_sick_component_2014.py
```

Папка содержит article.html,parent.html,child.html,capture.json. До разбора проверяются SHA/requested-finalURL/status/bytes. Переиспользован проверенный scoped-parser Prisoner13 с отдельным code-SHA; JSON-onlyinputpins сохранены.8Python проверяют title-типографику без подмены книги, чужую ссылку/дубли/комментарии, ложныйclaim/заголовок, отсутствие полной прозы в identity-выходе и разделение co-brand/WotC/разныхID.

Следующий шаг — собрать актуальный D05-триаж уже независимо проверенных ограниченных свидетельств, чтобы не повторять Basic/SageAdvice/Prisoner/FrozenSick, сохраняя все15и их оставшиеся критерии. Затем новый доступный остаток, напримерRrakkma. Приложение/UI/Android/VPS/личные данные не менялись, #77/M0/этапы открыты; самостоятельная полноценная game-design/QA-приёмка остаётся отдельной.

Рефлексия content: primary-ссылка книги/приключения точнее брендинга. Лишней повторной реализации парсера нет — переиспользован проверенный, его происхождение закреплено отдельно. Предложение planner — сохранять поле displayPublisher и publicationEvidencePublisher раздельно; польза — меньше ошибочных исключений/включений, цена — два поля, риск неверной версии дочернего текста остаётся явным.
