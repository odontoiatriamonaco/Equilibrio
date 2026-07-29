# Caratteri

Self-hosted, nessuna CDN: l'app deve funzionare offline e non deve chiamare terzi.
Finché questi file non ci sono, `css/base.css` ricade sui caratteri di sistema e
l'app resta perfettamente leggibile — solo meno caratterizzata.

Servono due file variabili, subset latino, formato `woff2`:

| File atteso | Carattere | Licenza |
|---|---|---|
| `inter-var-latin.woff2` | [Inter](https://rsms.me/inter/) — UI e dati | SIL Open Font License 1.1 |
| `fraunces-var-latin.woff2` | [Fraunces](https://fonts.google.com/specimen/Fraunces) — titoli e nomi dei piatti | SIL Open Font License 1.1 |

Entrambi sono OFL: si possono ridistribuire insieme all'app, a patto di
conservare il file di licenza del carattere.

## Come ottenerli

1. Scaricare il file variabile dal sito ufficiale (o da `fonts.google.com`).
2. Sottoinsiemare al solo latino e convertire in woff2 — con
   [`glyphhanger`](https://github.com/zachleat/glyphhanger) oppure
   [`fonttools`](https://fonttools.readthedocs.io/):

   ```bash
   pyftsubset Inter-Variable.ttf --output-file=inter-var-latin.woff2 --flavor=woff2 --layout-features=* --unicodes=U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+2000-206F,U+2074,U+20AC,U+2122,U+2212
   ```

3. Copiare i due `.woff2` in questa cartella e aggiungere i rispettivi `OFL.txt`.

Le regole `@font-face` sono già scritte in `css/base.css` e puntano a questi nomi:
non serve toccare il CSS.
