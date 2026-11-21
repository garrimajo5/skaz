# The Radiant Citadel: первая глава, не вся антология — #77

21.11.2026. [Свидетельство](../catalog/radiant-citadel-chapter-boundary-2014.json) разделяет provider92/TheRadiantCitadel и87/Journeys. [Статья издателя](https://www.dndbeyond.com/posts/1270-what-youll-discover-at-the-radiant-citadel-a-city) описывает первую главу как городскойhub вEtherealPlane и прямо поясняет отдельное имя главы вSources. [Оглавление книги](https://www.dndbeyond.com/sources/dnd/jttrc) содержит еёchapter-link. [Отдельный источник](https://www.dndbeyond.com/sources/dnd/trc) анонимно перенаправляет наclaim, где сейчас прямо написано об окончании промо. Claim/вход не выполнялись, полный chapter не прочитан.

Проверены два articleBody-абзаца, именованный ContentsTOC и claim-main описание/expiredspan. Второй TOC книги — Statblocks — исключён извыбораchapter; он не считается дополнительным набором приключений. Подпись providerType=adventure сохранена как исходное наблюдение, а предложенный тип — setting-hub-first-chapter-with-separate-promotion. Generictoolset-обещания claimстраницы не доказывают ни новыхspell/monster/item записей, ни нулевого их количества. Доступ прошлыхclaimants/владельцев книги не проверялся.

ТриHTTP200: article367323байта/SHA1c72cf90…,parent249707/b044fd06…,claim221714/91bda44c…. ПолныеURL/SHA/размеры/время вJSON, HTML/проза/карта/аккаунтные сведения внеGit. Existingparentdnd.su171→provider87проверен; ownchildnumeric=null, canonical=null. Это не unlockвсейантологии, не новаяподтверждённаяadventure-единица и не reusePermission.

```sh
python scripts/audit-radiant-citadel-chapter-2014.py <capture-folder> --output <report.json>
python -m unittest discover -s tests -p test_radiant_citadel_chapter_2014.py
```

11Python: firstchaptervswholebook, ContentsvsStatblocks/peerheading/fragment/duplicateконтейнер, scopeexpirednotice, noaccess/count inference, namespace/provenance. Реальный3HTMLотчёт воспроизведён. Строгиеграницыучитываютреальныеразныешаблоныclaim идвеименованныеTOCсекции. Независимыйread-onlyreviewдоmerge. Остались точныеверсии/полныйchapter/каноническиеединицы/права; следующийнезависимыйD05 — SpelljammerAcademy93. Runtime/профили/VPS/этапы не менялись.

Рефлексия content: sourceTypeиgenericpromotionтекст не равнытипу/количествукаталожныхзаписей. Предложениеplanner — именоватьTOCсекции иотделятьavailabilityотcontent/provenance; польза — нет ложногоfullbook/zero-recordcoverage, цена — триboundedchecks, рискfulltext/versionостаётсяявным.
