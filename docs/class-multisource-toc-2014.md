# Первичные оглавления четырёх классовых семейств — #77/D05

22.11.2026МСК. [Отчёт](../catalog/class-multisource-toc-2014.json) добавляет ограниченные publisher-TOC witnesses к [пакету единиц](class-unit-residual-review-2014.md). Три index HTML сохранены полностью со status200/finalURL/временем/bytes/SHA. Это новый контроль конкретных семейственных ссылок, не повтор принятия библиографии и не полный текст подклассов.

Проверены восемь source-specific ссылок в единственном `div.compendium-toc-full-text`: TCE содержит Eloquence/Spores/Order/Glory, MOoT — Eloquence/Glory, GGtR — Order/Spores. На тех же сохранённых TCE bytes подтверждены ещё три Sidekick ссылки Expert/Spellcaster/Warrior и связаны с точными discovery URL. Полная классовая справка не объявляется равной13основным классам; персонажу эти варианты автоматически не выдаются.

Прямые источники: [Tasha’s Cauldron of Everything](https://www.dndbeyond.com/sources/dnd/tcoe), [Mythic Odysseys of Theros](https://www.dndbeyond.com/sources/dnd/moot), [Guildmasters’ Guide to Ravnica](https://www.dndbeyond.com/sources/dnd/ggtr). У8семейственных ссылок сохраняются observed href, fragment, label, resolvedURL и numeric source claim, без замены одного namespace другим. Это digital publication presence; printed-version equality, canonical alias, полный перевод и права не принимаются.

## Ограниченная попытка полного текста

Запросы по реально наблюдаемым Eloquence TOC-targets:

- `https://www.dndbeyond.com/sources/tcoe/bard` → marketplace/all-rulebooks/tashas-cauldron-of-everything.
- `https://www.dndbeyond.com/sources/moot/character-creation` → marketplace/settings/mythic-odysseys-of-theros.

У обоих helper получил headers/status200/finalURL, затем TimeoutError при чтении тела. Полного rawbody/bytes/SHA нет. Это **не** доказательство прочитанного класса, постоянного отказа, paywall или разрешение обойти вход. Полные тексты не приобретались; учётные данные/сессии/внешнийbrowser QA не использовались. Автоповторов0; успешные3index captures не теряются из-за2ошибок соседей. Конкретно отложена только точная TCE/MOoT body/version-сверка6Eloquence observations; независимые M0-критерии доступны.

## Воспроизведение

```sh
python scripts/audit-class-multisource-toc-2014.py --captures <public-capture-directory> --output <report.json>
python -m unittest discover -s tests -p test_class_multisource_toc_2014.py
```

11Python PASS: точные bounded links/подписи/книги, missing/duplicate/outside-TOC, подмена source/path/fragment, stale rawSHA,3sidekicks и запрет выдавать partial header receipt за полный текст. Все реальные retained HTML/receipts воспроизводят committed JSON; сырые снимки/квитанции внеGit. В TCE два одинаковыхH1 (header/body echo), в остальных поодному: точный ожидаемый счёт закреплён, эвристика «первыйH1подойдёт» не используется.

Рефлексия content/planner: stage-specific TOC witness подтверждает конкретную связь, не обещая полный доступ. Header200оказался недостаточным доказательством body; отдельные квитанции сохранили частичный результат. Предложение — переиспользовать эти3captures, возвращаться к full-body только при новом разрешённом источнике/условии доступа. Общие разрешения, WotC-only политика и критерии M0 не меняются. Runtime/профили/VPS не меняются; браузерная/Android и длительная игра не заявляются.
