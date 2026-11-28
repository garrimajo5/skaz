# Первичные оглавления четырёх классовых семейств — #77/D05

22.11.2026МСК. [Отчёт](../catalog/class-multisource-toc-2014.json) добавляет ограниченные publisher-TOC witnesses к [пакету единиц](class-unit-residual-review-2014.md). Три index HTML сохранены полностью со status200/finalURL/временем/bytes/SHA. Это новый контроль конкретных семейственных ссылок, не повтор принятия библиографии и не полный текст подклассов.

Проверены восемь source-specific ссылок в единственном `div.compendium-toc-full-text`: TCE содержит Eloquence/Spores/Order/Glory, MOoT — Eloquence/Glory, GGtR — Order/Spores. На тех же сохранённых TCE bytes подтверждены ещё три Sidekick ссылки Expert/Spellcaster/Warrior и связаны с точными discovery URL. Полная классовая справка не объявляется равной13основным классам; персонажу эти варианты автоматически не выдаются.

Прямые источники: [Tasha’s Cauldron of Everything](https://www.dndbeyond.com/sources/dnd/tcoe), [Mythic Odysseys of Theros](https://www.dndbeyond.com/sources/dnd/moot), [Guildmasters’ Guide to Ravnica](https://www.dndbeyond.com/sources/dnd/ggtr). У8семейственных ссылок сохраняются observed href, fragment, label, resolvedURL и numeric source claim, без замены одного namespace другим. Это digital publication presence; printed-version equality, canonical alias, полный перевод и права не принимаются.

## Контекст версий Sidekick

Дополнительно сохранён один [обзор на площадке D&D Beyond](https://www.dndbeyond.com/posts/906-how-to-play-sidekicks-like-heroes-in-tashas), опубликованный17.11.2020. Сопоставлены два целых вводных абзаца7/8 в bounded article body, с SHA каждого; комментарии и следующие разделы не входят. Обзор различает ранние правила Icespire Peak (описан диапазон1–6) и обновлённый TCE-вариант. Старый cap6 не переносится автоматически в TCE; максимальный уровень новой версии этими двумя абзацами не установлен. Это редакционный guide, не первичный полный rulebook и не доказательство равенства двух книг/перевода/прав. Возможность играть сайдкиками как героями не запрещается; приложение не выдаёт новые классы автоматически.

## Ограниченная попытка полного текста

Запросы по реально наблюдаемым Eloquence TOC-targets:

- `https://www.dndbeyond.com/sources/tcoe/bard` → marketplace/all-rulebooks/tashas-cauldron-of-everything.
- `https://www.dndbeyond.com/sources/moot/character-creation` → marketplace/settings/mythic-odysseys-of-theros.

У обоих helper получил headers/status200/finalURL, затем TimeoutError при чтении тела. Полного rawbody/bytes/SHA нет. Это **не** доказательство прочитанного класса, постоянного отказа, paywall или разрешение обойти вход. Полные тексты не приобретались; учётные данные/сессии/внешнийbrowser QA не использовались. Всего6явных capture-helper запросов:4complete/2partial; автоповторов0. Успешные3index captures не теряются из-за2ошибок соседей. Конкретно отложена только точная TCE/MOoT body/version-сверка6Eloquence observations; независимые M0-критерии доступны.

## Воспроизведение

```sh
python scripts/audit-class-multisource-toc-2014.py --captures <public-capture-directory> --sidekick-captures <guide-capture-directory> --output <report.json>
python -m unittest discover -s tests -p test_class_multisource_toc_2014.py
```

14Python PASS: точные bounded links/подписи/книги, missing/duplicate/outside-TOC, подмена source/path/fragment, stale rawSHA,3sidekicks и запрет выдавать partial header receipt за полный текст. Триindex HTML и отдельныйguide HTML/receipts воспроизводят committed JSON; сырые снимки/квитанции внеGit. В TCE два одинаковыхH1 (header/body echo), в остальных поодному: точный ожидаемый счёт закреплён, эвристика «первыйH1подойдёт» не используется.

Рефлексия content/planner: stage-specific TOC witness подтверждает конкретную связь, не обещая полный доступ. Header200оказался недостаточным доказательством body; отдельные квитанции сохранили частичный результат. Предложение — переиспользовать эти3captures, возвращаться к full-body только при новом разрешённом источнике/условии доступа. Общие разрешения, WotC-only политика и критерии M0 не меняются. Runtime/профили/VPS не меняются; браузерная/Android и длительная игра не заявляются.

### NPC Sidekick в цифровом указателе Essentials Kit

[Реестр #77](../catalog/essentials-sidekick-index-evidence-2014.json)
связывает четыре книги и 12 сохранённых поисковых страниц с 16
исходными атрибуциями. У [Dragon of Icespire Peak](https://www.dndbeyond.com/sources/dnd/doip)
найдены четыре карточки с собственной подписью книги:

| Название в индексе | Карточка D&D Beyond | Наблюдение dnd.su |
| --- | --- | --- |
| Expert | [368969](https://www.dndbeyond.com/monsters/368969-expert) | 8016 |
| Spellcaster - Healer | [370724](https://www.dndbeyond.com/monsters/370724-spellcaster-healer) | 8014 |
| Spellcaster - Mage | [370794](https://www.dndbeyond.com/monsters/370794-spellcaster-mage) | 8022 |
| Warrior | [368996](https://www.dndbeyond.com/monsters/368996-warrior) | 8017 |

У всех четырёх число `1` в колонке CR цифровой выдачи. Значение
хранится буквальным полем индекса. Полные блоки и трактовка числа для
конкретного уровня NPC требуют прямой проверки. Ссылка уровня книги не
переносится на NPC из других приключений.

В [Storm Lord’s Wrath](https://www.dndbeyond.com/sources/dnd/slw),
[Sleeping Dragon’s Wake](https://www.dndbeyond.com/sources/dnd/sdw) и
[Divine Contention](https://www.dndbeyond.com/sources/dnd/dc) поиск по
Expert и Spellcaster возвращает явный пустой ответ. По Warrior найдены
Drow Elite Warrior и Sword Wraith Warrior, без точной карточки Sidekick.
Это свойство публичного поиска на 28.11.2026. Наблюдения 8014/8016/8017/8022
и четыре составных наблюдения продолжений сохранены раздельно.
Каждая книга показывает родительский раздел Sidekick. Его точная ссылка
при открытой проверке перенаправляет в магазин. Пустая выдача и ссылки
разделов не определяют уровни продолжений, совпадение правил или права.
Классовые ссылки Tasha остаются справочными.

Воспроизведение: сохраните URL из реестра как `<query>-<фильтр>.html`
вне Git, затем выполните
`python scripts/audit-essentials-sidekick-index-2014.py <каталог HTML>`.
Команда проверяет SHA, выбранные книги, связывание строк и пустые ответы.
