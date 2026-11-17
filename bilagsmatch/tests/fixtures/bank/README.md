# Bank CSV fixtures

Synthetic data only. The files imitate the general *style* of exports from Danish banks
(delimiters, header names, number and date formats). They are not exact official formats.

| File | Imitates | Encoding | Delimiter | Decimal | Dates | Notes |
|---|---|---|---|---|---|---|
| danske-bank.csv | Danske Bank | Windows-1252 | `;` (quoted) | `1.234,56` | dd.mm.yyyy | æøå in text, summary line at the end |
| nordea.csv | Nordea | UTF-8 with BOM | `;` | `-1234,56` | yyyy-mm-dd | Both Navn and Beskrivelse columns, Valuta |
| jyske-bank.csv | Jyske Bank | UTF-8 | `;` | `1.234,56` | dd-mm-yyyy | Valørdato, quoted text containing `;` |
| lunar.csv | Lunar | UTF-8 | `,` | `1234.56` | yyyy-mm-dd | Quoted text containing `,` |
| spar-nord.csv | Spar Nord | UTF-8 | `;` | `1.234,56` | dd/mm/yyyy | Separate Ud/Ind columns, preamble lines, empty trailing lines |
| no-header.csv | Older export without header | UTF-8 | `;` | `1.234,56` | dd-mm-yyyy | Columns inferred from content |
| broken-rows.csv | — | UTF-8 | `;` | `1.234,56` | dd-mm-yyyy | Invalid dates/amounts to test per-row errors |
