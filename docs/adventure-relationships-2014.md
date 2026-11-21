# Три разных связи приключений — #77/D05

## Lightning Keep/provider126

[Отчёт](../catalog/lightning-keep-relationship-2014.json), [статья издателя](https://www.dndbeyond.com/posts/1579-from-minecraft-x-dungeons-dragons-to-tabletop) и [claim](https://www.dndbeyond.com/claim/source/lightning-keep): отдельное приключение для3уровня,4–6персонажей,3–4часа. Использует монстров из Minecraft Compendium/provider115, исторический199; не alias всего сборника и не доказательство включения всех его статблоков или одинаковых текстов. Мир можно выбрать, Minecraft не обязателен. Раздача завершена; прежний доступ владельцев/полные правила не проверены. Provider126 не является историческим126 Descent into Avernus.

## Heroes’ Feast/provider129

[Отчёт](../catalog/heroes-feast-relationship-2014.json), [интервью на сайте издателя](https://www.dndbeyond.com/posts/1639-deborah-ann-woll-talks-heroes-feast-saving-the): самостоятельное приключение для10уровня, вдохновлённое рецептом из Heroes’ Feast Flavors of the Multiverse. Поваренная книга не добавлена в каталог игровых правил, contained-in/равенство полных текстов не установлены. Автор и издатель раздельны; контекст публикации Wizards сопоставлен с WotC-плашкой Library. Исходный source URL отклонён ограничителем URL; статья сохранена, HTML самого продукта не прочитан. Сохранён сырой provider title с конечным пробелом; нормализация применяется только при сравнении, исходник не переписан.

## Vecna: Nest of the Eldritch Eye/provider135

[Отчёт](../catalog/vecna-prequel-relationship-2014.json), [статья издателя](https://www.dndbeyond.com/posts/1680-play-the-prequel-adventure-to-vecna-eve-of-ruin): самостоятельный приквел3уровня к Eve of Ruin/provider132/historical214/SKU134. SKU нельзя вычислять из provider ID. Кампания рассчитана на10–20уровни, а способ перехода к10 определяет мастер; автоматического3→10 нет. Это не contained-in и не совпадение полных правил. Календарный2024год не превращает Library ruleset5e в revised2024; проверка точных правил остаётся отдельной. Source135 перешёл на marketplace, HTTP200/body-read timeout; тело не сохранено и не выдано за полный доступ.

## Проверка и ограничения

```sh
python scripts/audit-adventure-relationships-2014.py <lightning-captures> <other-two-captures> --output-dir <existing-output-directory>
python -m unittest discover -s tests -p test_adventure_relationships_2014.py
```

15 целевых тестов проверяют разницу related/contained/alias, scope статьи/claim, неправильные ссылки, однозначность relation-параграфов, разные namespaces/SKU, отказ автоматического повышения, год против редакции, сырой title, ограниченные неудачные попытки и code/input SHA. Четыре HTML сохранены с HTTP/SHA/байтами и квитанциями; неудачные source GET не повторялись. Один общий модуль даёт три самостоятельных отчёта; связанные публикации не канонизированы автоматически.

Fulltext/поэлементное происхождение/точные версии/права/категорийный знаменатель и игровая приёмка остаются открыты. accepted/complete=false, denominator=null. Аккаунты/профили/приложение/VPS не менялись, выпуск неприменим; #77/M0/этапы не закрываются.

Рефлексия content: один модуль объединяет повторяющуюся механику квитанций и pins, но каждое отношение имеет отдельную смысловую проверку и отчёт. Предложениеplanner — использовать этот способ для однотипных источников с разными отношениями; критерии0потерь исходных source ID/0ложных contained-in/0уровней, полученных по рекламной связи. Политики доступа не менять.
