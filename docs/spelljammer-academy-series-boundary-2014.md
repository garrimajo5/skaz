# Spelljammer Academy: четыре части и момент повышения — #77

21.11.2026. [Свидетельство](../catalog/spelljammer-academy-series-boundary-2014.json) проверяет provider93 как серию, не единичное приключение или весьSpelljammerboxedset. [Корневоеоглавление](https://www.dndbeyond.com/sources/dnd/sja) связываетчетыренумерованныекомпонента: Orientation, TrialByFire, RealmspaceSortie, Behold…H’Catha. ПовторяемыеCreatureStatisticsраздельныпоpart/chapterURL, а неавтоматическиодинаковыекаталожныесущества.

[Статьяиздателя](https://www.dndbeyond.com/posts/1284-what-is-the-spelljammer-academy-adventure-series) описываетчетыреприключенияуровней1–5иподготовкукLightofXaryxis, включённомувSpelljammer:AdventuresinSpace. Этоpreparatoryrelationship, неproofчтоAcademyнапечатанавкоробке. Relatedprovider90/existinghistorical160сохраненыраздельно; ownnumeric=null, genericAL169неприсвоен.

[ALguidev2.4](https://media.dndbeyond.com/compendium-images/ddal/reference-docs/03-2024/d%26d-adventurers-league-adaptation-guides-v2.4.pdf#page=48), уже закреплённыйвWayfinder-проверке, настранице48различаетисходныйпорядокчастейиопциональнуюигрулюбойочерёдностиtier1вAL. Ограничение4-гоуровняотноситсякмоментудозавершениявыбранныхигрокомAcademy-приключений. Это совместимо с рекламируемым окончаниемна5-м; невыдумываемверсийнуюошибку, глобальныйпотолок4, обязательностьвсехчетырёхилиавтоповышениеприимпортеметаданных. Страница48отрендерена1800pxипрочитана; весьPDFповторнонескачивался.

[Текущийclaim](https://www.dndbeyond.com/claim/source/spelljammer-academy) сообщаетобокончаниипромо. Claim/вход/доступстарыхвладельцев/полныеadventure-правиланепроверялись. ТриHTML/SHA/времявJSON(source246287байт/13243600…,article365301/3305e19f…,claim221632/f968b2af…), PDFпо прежнемуSHAee0ffa32…. Полныетексты/карты/профилинепубликуются.

```sh
python scripts/audit-spelljammer-academy-series-2014.py <capture-folder> <guide-folder> --output <report.json>
python -m unittest discover -s tests -p test_spelljammer_academy_series_2014.py
```

10Pythonпроверяютнумерацию/лишнююпятуючасть/чужиессылки/перетеканиепредыдущихссылок, повторяемыеcreature-heading, единуюpublisherсвязь, точноеAL-before/optional/chosenусловие иscopeистёкшегопромо. Первыйреальныйпроходиотрицательнаярегрессияупали: self.offset конфликтовалсвнутреннимHTMLParser.offset. Переименовановpart_link_start, ссылкикаждойчастиизолированы; реальные3HTML/новаяPDF48репродукцияPASS. КоддвухпроверенныхпарсеровпереиспользовансотдельнымиSHA.

Осталисьполныезаписи/версии/каноническиекомпоненты/права; четыреpart-referenceнеравнычетырёмпринятымcreature/spell/itemединицам. Независимыйread-onlyreviewдоmerge. ДалееD05Stormwreck94/Intro128либодругойдоступныйпункт; runtime/VPS/реальныепрофили/этапынеменялись.

Рефлексияcontent: нужноотличатьпорядокпубликации, опциональныйпорядокALивремяповышения. Предложениеplanner — сохранятьstage/scopeпередсравнениемчисел ииспользоватьназваниявнутреннихполейпарсерасобственнымпрефиксом. Польза — меньшеfalseconflicts/склейкикомпонентов, цена — однаstage-оговорка/регрессия, рискполныхправилостаётсяявным.
