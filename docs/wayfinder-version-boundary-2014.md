# Wayfinder: прототип, старые механики и точная версия — #77 D05

21.11.2026. [Свидетельство](../catalog/wayfinder-version-boundary-2014.json) касается provider37, первого свободного пункта текущего триажа. Три первичных артефакта различают публичную подпись, историческое обновление и ограничения конкретной кампании.

- [Корневая страница Wayfinder](https://www.dndbeyond.com/sources/dnd/wgte) по-прежнему называет издание прототипом. Проверен ограниченный intro-blockquote, не весь текст правил. LibraryWotC/5e/false-thirdParty не отменяет необходимость проверки статуса правил.
- [Первое staff-объявление18.12.2019](https://www.dndbeyond.com/forums/d-d-beyond-general/news-announcements/53261-wayfinders-guide-to-eberron-pre-update-content?comment=1) отмечает конкретный старый неофициальный контент, воссозданный какpublichomebrew, на фоне обновленияWGtE/Rising. Выбран толькоbody1, подтверждённыйfirst-staff-navigationmarker; userreplies/цитаты/meta-description не считаются его утверждениями. Это не заявление, что весь текст всех версий —homebrew, или что обновлённые механики автоматически официальны.
- [ALAdaptationGuidesv2.4](https://media.dndbeyond.com/compendium-images/ddal/reference-docs/03-2024/d%26d-adventurers-league-adaptation-guides-v2.4.pdf),67страниц: проверены1/3/18, страница18 отрендерена1800px и прочитана. В разделеEberronCampaign есть условное исключение для точного совпадения сRising. Положение о легальности в организованной кампании не является общим запретом для домашней игры или основанием блокировать действие пользователя. Документ сам отделяет организованную игру от рекомендаций вне неё.

ТочныеURL/размеры/хэши/время вJSON: source244923байта/SHAeddfdc50…, announcement392650/45bdd184…, guide1476910/ee0ffa32…. HTML/PDF/рендеры/полные правила и обсуждение не копируются вGit.

## Следствие для состава

Конкретные старые неофициальные механики не проходят уже согласованную границу общего каталога. Но старая prototype-подпись илиAL-ограничение не позволяют автоматически исключить каждую обновлённую версию и общий сRising текст. Для текущегоWGtE остаётся requires-version-specific-evidence; текстовое равенство конкретных обновлённых passages не проверено. Политика владельца не меняется; ручные личные исключения доступны с предупреждениями, не обязательным подтверждением мастера.

Введение не принято как прочитанный текущий текст. Один анонимныйHTTP-запрос оборвался на чтении (TimeoutError,20сек), отдельный unverified storefront-candidate DMsGuild вернул403 вwebtool. Не повторялись, вход/обход не выполнялись. Эти авторские наблюдения о двух попытках не доказывают статус публикации или постоянный запрет доступа. Остальная первичная сверка выполнена; следующим независимым D05-пунктом берётся RadiantCitadel, а не повторяется неудачный запрос.

## Воспроизводимость

```sh
python scripts/audit-wayfinder-version-boundary-2014.py <capture-folder> --output <report.json>
python -m unittest discover -s tests -p test_wayfinder_version_boundary_2014.py
```

11Python проверяют конкретныйbookintro, staffindex/body1/исключениеquotesиmeta, специфическийold-versus-allversions, наличиеAL-exception/campaignscope, отказ сделать глобальный запрет и сохранение ручного пути. Все три реальные артефакта воспроизведены. Scoped-parser переиспользован с codeSHA отдельно отJSONinputpins. Независимый read-only source/code review доmerge, без повторения ограниченных неудачных запросов.

Remaining: точная current-version official-status evidence, конкретные rules/records/сравнениеRising, единицы и права. SourceID/канонизация/denominator/веськаталог/M0 не приняты. Runtime/production/профили/доступ не менялись.

Рефлексия content: SEO-description и staffbody могут содержать одинаковые слова, а повторяемаяобложка — скрывать редакции. Предложение planner — фиксировать оригинальныйpost-index/staff-marker и разделятьmetadata/version/campaignscope. Польза — нет ложногообщегозапрета/включения, цена — триboundedwitness, рискcurrentfulltextнеопределённости остаётся явным.
