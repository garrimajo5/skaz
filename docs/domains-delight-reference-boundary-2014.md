# Domains of Delight: первичная граница дополнения — #77

Provider116 — отдельное наблюдение WotC/5e/SRC-00116-ELIFE; его дата в Library не выдаётся за дату первоначального издания. [Отчёт](../catalog/domains-delight-reference-boundary-2014.json) основан на сохранённом официальном [Dungeoncraft Wild Beyond the Witchlight v1.1](https://media.wizards.com/2021/dnd/downloads/Dungeoncraft_Wild_Beyond_the_Witchlight_v1.1.pdf):9 страниц, проверена/отрендерена страница1. Она называет Domains дополнением, отдельно ссылается на товар DMsGuild371449 и использует его вместе с Witchlight. Это не доказательство вхождения в Witchlight или полного совпадения текстов.

Ограничение на использование архифей относится к исторической программе Dungeoncraft. Оно не запрещает обычное действие игрока и не доказывает неофициальность книги либо нулевое число правил. Число371449 — товар,116 — provider namespace; исторический sourceId и canonical ID не установлены.

Доступ: исходный source URL отклонён URL-ограничителем, PROMOTION и установленный канонический marketplace URL дали body-read timeout15с. Неполные тела/SHA не сохранены, успешный официальный PDF и квитанция удержаны. Кэшированное веб-представление магазина подтверждает существование товара, но не подменяет отсутствующий HTML-снимок или полный текст. Доступ владельцев, покупка/claim, актуальная полная версия и права не проверялись. Автоматических повторов0; успешный PDF повторно не скачивался.

```sh
python scripts/audit-domains-delight-reference-2014.py <pdf-capture-folder> <followup-folder> --output <report.json>
python -m unittest discover -s tests -p test_domains_delight_reference_2014.py
```

9 адресных тестов: версии/программа, отдельный продукт, чужой host/ID, дубли одинаковых PDF-ссылок, scope ограничения, provider namespace/редакция, неполные captures и SHA. Полные правила/записи/версии/права/canonical units остаются открыты; accepted/complete=false, denominator=null. Приложение и профили не меняются, выпуск неприменим. Следующий D05 — provider122 Gazetteer.

Рефлексия content: первый реальный прогон helper сохранил успешный PDF при двух отказах; второй — два соседних HTML при одном тайм-ауте. Предложение planner: учесть этот результат испытания, не расширяя автоматический повтор или allowlist. Цена — три ограниченные неудачные попытки; риск неверной полноты исключён явными receipt/outcome и отсутствием body SHA.
