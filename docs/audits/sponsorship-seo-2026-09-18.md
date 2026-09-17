# SEO audit — Sponsorship

**Data:** 18 settembre 2026  
**Pagina analizzata:** http://127.0.0.1:5173/sponsorship  
**URL canonico previsto:** https://www.unmarker.it/sponsorship

## Sintesi

**84/100 — buona base tecnica, con opportunità nella presentazione dell’offerta e nella scoperta della pagina.** Nessun blocco critico rilevato nel perimetro locale. Il punteggio è una valutazione editoriale, non un indicatore di Google o una previsione di posizionamento.

| Area | Punteggio | Valutazione |
| --- | ---: | --- |
| On-page | 86/100 | Titolo, H1 e collegamenti corretti; metadati migliorabili per intento commerciale. |
| Contenuti | 82/100 | Prezzo e durata chiari; destinatari B2B e posizionamenti da anticipare. |
| Tecnica | 92/100 | Prerender, canonical e hreflang coerenti; sitemap incompleta. |
| Dati strutturati | 80/100 | WebPage pertinente; Service e Organization sarebbero un arricchimento facoltativo. |
| Immagini e social | 80/100 | Nessuna immagine nel contenuto iniziale; anteprime social ereditate dalla homepage. |

## Metodo e limiti

Esaminati DOM renderizzato nel browser, risposta HTTP locale, HTML già generato in `dist/` per entrambe le lingue, sorgenti dei metadati, robots.txt, sitemap e configurazione Vercel. Nessuna cache SEO precedente disponibile.

Il server Vite restituisce inizialmente il template della homepage, con contenuto inserito da JavaScript. **La build contiene invece già titolo, metadati e contenuto specifici di sponsorship:** non è corretto attribuire alla versione prodotta il template vuoto del server di sviluppo.

Non verificati: deployment pubblico corrente, indicizzazione effettiva in Search Console, ranking, volumi di ricerca, backlink, Core Web Vitals reali o intestazioni aggiunte da Vercel alla preview. Il report non certifica il comportamento dell’ultimo deployment. Una modifica locale al solo suggerimento del campo URL non altera le conclusioni sui metadati della build.

## Elementi già corretti

- HTTP locale 200; pagina inglese con un solo H1, `Advertise on Unmarker.it`.
- Gerarchia H1 → H2 → H3 senza salti. Le legende del form sono appropriate per raggruppare campi: non occorre trasformarle tutte in titoli editoriali.
- URL breve e descrittivo, senza parametri.
- `index,follow` e canonical assoluto verso l’URL pubblico corretto.
- Versioni EN e zh-Hans con canonical distinto e hreflang reciproci, più x-default inglese.
- Metadati Open Graph e Twitter presenti; JSON-LD WebPage coerente con la pagina.
- Tre link a sponsorship nell’HTML generato della homepage: la pagina non è orfana. Navigazione e link legali sono veri collegamenti HTML.
- Prezzo di €500 più IVA applicabile, durata di 30 giorni e assenza di rinnovo automatico visibili prima del form.
- Identità del venditore, dati societari, contatti e documenti legali raggiungibili nel footer. Sono segnali di affidabilità pertinenti a questa pagina; una biografia dell’autore non è necessaria.
- Il noindex configurato per `/legal/*` è distinto dall’indicizzazione della pagina commerciale.

## Problemi e raccomandazioni, per priorità

### Critici / alti

Nessuno rilevato nel perimetro verificato.

### Medi

**1. Sponsorship manca dalla sitemap in entrambe le lingue.**

`public/sitemap.xml` elenca soltanto le homepage EN e ZH. Alla pubblicazione della pagina indicizzabile, aggiungere `/sponsorship` e `/zh-hans/sponsorship`, con gli stessi riferimenti linguistici già presenti nel documento. Usare una data lastmod veritiera, se inclusa.

Impatto atteso: maggiore coerenza tra pagine canoniche e sitemap e migliore supporto alla scoperta. L’assenza dalla sitemap non impedisce da sola l’indicizzazione, soprattutto quando esistono link interni. [Google: sitemap](https://developers.google.com/search/docs/crawling-indexing/sitemaps/overview).

**2. Titolo e descrizione raccontano poco dell’offerta.**

Attuali:

- Titolo: `Advertise on Unmarker.it` — 24 caratteri.
- Descrizione: `Put your project in front of thousands of people worldwide using Unmarker.it to work with AI images.` — 100 caratteri.

Non sono errori di lunghezza: Google non impone un numero fisso di caratteri. L’opportunità è rendere immediatamente riconoscibili durata, prezzo e modalità di acquisto. Separare le stringhe SEO da `dialogTitle` e `dialogDescription`, attualmente condivise con la copia visibile, per poterle adattare senza allungare il titolo del form.

Proposta inglese:

```text
Title: Advertise on Unmarker.it | 30-Day Sponsorship
Description: Promote your business on Unmarker.it for 30 days. Desktop and mobile placements for €500 plus applicable VAT. One payment, no automatic renewal.
```

Adattare anche i metadati cinesi, evitando limiti di caratteri pensati per l’inglese. Impatto atteso: risultato di ricerca più informativo; un miglioramento del CTR resta da misurare. Google può comunque scegliere titoli e snippet differenti. [Titoli](https://developers.google.com/search/docs/appearance/title-link), [snippet](https://developers.google.com/search/docs/appearance/snippet).

**3. Anticipare l’idoneità B2B e ciò che viene acquistato.**

L’esclusività per imprese e professionisti emerge nello step di fatturazione. Una frase breve accanto all’offerta può evitare che utenti non idonei compilino prima la creatività:

> For businesses and professionals. Your sponsor appears in desktop cards and mobile sponsor strips.

Conservare i dettagli nel blocco “How it works” già presente, senza duplicarli in più sezioni. La promessa “thousands of people worldwide” richiede dati aggiornati a supporto: il numero attuale e la composizione del pubblico non sono stati verificati in questo audit. Non aggiungere profili professionali, geografie o risultati pubblicitari non dimostrati.

Impatto atteso soprattutto sulla qualità delle conversioni e sulla comprensione dell’offerta, non un vantaggio di ranking garantito.

### Bassi

**4. Anteprima social generica e relativamente pesante.**

La pagina usa le immagini della homepage e un testo alternativo che descrive l’interfaccia del tool:

| Asset | Dimensioni | Peso |
| --- | --- | ---: |
| `public/og-image.png` | 1200 × 630 PNG | 399.360 byte |
| `public/og-image-zh-hans.png` | 1200 × 630 PNG | 861.441 byte |

Creare un’immagine social dedicata all’offerta sponsor, con titolo e posizionamenti reali, e aggiornare immagine e testo alternativo di OG/Twitter. Ottimizzare il peso mantenendo un formato compatibile con i social destinatari; non cambiare automaticamente in AVIF solo per ridurre i byte.

Entrambe superano 200 kB e la versione cinese supera 500 kB. **Non sono immagini caricate nel corpo della pagina e non costituiscono, per questo solo fatto, un problema LCP.** L’effetto riguarda soprattutto qualità e trasferimento dell’anteprima social.

**5. Dati strutturati più descrittivi, facoltativi.**

Il WebPage attuale è pertinente e il JSON è correttamente interpretabile. Aggiungere Service e Organization può esplicitare servizio e fornitore. Non è una correzione obbligatoria e non dà diritto a un rich result dedicato. Non usare Product per fingere un prodotto materiale, né FAQ/HowTo per questa pagina. [Schema.org Service](https://schema.org/Service), [Google: dati strutturati](https://developers.google.com/search/docs/appearance/structured-data/intro-structured-data).

## Contenuti e leggibilità

Il contenuto principale inglese prerenderizzato contiene circa **196 parole**, includendo etichette e testo del form. È una pagina di acquisto: non serve allungarla fino a una quota arbitraria da articolo. La versione cinese non è confrontabile con un conteggio basato sugli spazi.

Il linguaggio del primo step è diretto; prezzo, durata e azione successiva sono distinguibili. Un indice Flesch o un livello scolastico sull’intero form mescolerebbe etichette, importi e testo legale: non viene presentato come misura attendibile della sua leggibilità. Analogamente, non è utile imporre una densità keyword dell’1–3% a un checkout. Usare naturalmente “advertise”, “sponsorship”, “desktop” e “mobile” dove spiegano l’offerta.

Una data di pubblicazione editoriale non è necessaria nel form. Sono più importanti prezzo, disponibilità e condizioni aggiornati, già gestiti separatamente dalla pagina statica.

## Immagini e prestazioni

Nessun elemento `<img>` presente nello stato iniziale esaminato: le preview usano segnaposto e le immagini scelte dall’utente appartengono a uno stato interattivo successivo. Non emergono immagini editoriali prive di alt, dimensioni o lazy loading da correggere in questo stato.

Il peso JavaScript resta un elemento da misurare su dispositivi mobili, ma non consente da solo di dedurre INP o LCP. Verificare il deployment con un test di laboratorio mobile e, quando disponibili, dati reali della pagina o dell’origine. Misurare anche stabilità della pagina durante caricamento della disponibilità, apertura della fatturazione e visualizzazione del consenso cookie. Nessun punteggio Core Web Vitals viene assegnato da HTML o server Vite.

## Esempio JSON-LD

Proposta per sostituire il WebPage inglese attuale, **non applicata**. Non include disponibilità o prezzo dinamico, né recensioni o risultati inventati. L’eventuale Offer va aggiunto soltanto mantenendolo sincronizzato con l’offerta effettivamente acquistabile. Tradurre nome, descrizione e inLanguage nella versione cinese, mantenendo l’identità del venditore condivisa.

```json
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebPage",
      "@id": "https://www.unmarker.it/sponsorship#webpage",
      "url": "https://www.unmarker.it/sponsorship",
      "name": "Advertise on Unmarker.it",
      "inLanguage": "en",
      "mainEntity": { "@id": "https://www.unmarker.it/sponsorship#service" }
    },
    {
      "@type": "Service",
      "@id": "https://www.unmarker.it/sponsorship#service",
      "name": "Unmarker.it Sponsorship",
      "serviceType": "Website advertising",
      "description": "30-day sponsor placement on Unmarker.it, with desktop cards and mobile sponsor strips for businesses and professionals.",
      "url": "https://www.unmarker.it/sponsorship",
      "provider": { "@id": "https://www.unmarker.it/#organization" }
    },
    {
      "@type": "Organization",
      "@id": "https://www.unmarker.it/#organization",
      "name": "NoMaDe S.r.l.",
      "legalName": "NOMADE - S.R.L.",
      "vatID": "IT07505480488",
      "email": "help@nomadesrl.it"
    }
  ]
}
```

## Ordine suggerito

1. Metadati dedicati EN/ZH e breve indicazione B2B prima del form.
2. Aggiornamento sitemap quando la pagina è pubblicata e indicizzabile.
3. Anteprime social dedicate; Service/Organization se utili alla descrizione semantica.
4. Verifica sul deployment: HTML e intestazioni effettivi, canonical delle eventuali varianti con slash, prestazioni mobili e ispezione URL in Search Console.

**Esito operativo:** audit soltanto. Nessuna modifica al codice applicativo, nessun commit o deploy.
