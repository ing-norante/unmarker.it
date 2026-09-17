# Audit tecnico — Sponsorship

Data: 18 settembre 2026. URL verificato: http://127.0.0.1:5173/sponsorship.
Metodo: Impeccable audit, lettura dei componenti, browser Chromium, axe-core 4.10.3, misure DOM e contrasto, analisi della build locale esistente.

## Verdetto sull’integrità dell’implementazione

**PASS, con correzioni mirate.** Il sistema è coerente con le scelte attuali: tema scuro, tipografia monospaziata, azioni primarie blu, secondarie con bordo, collegamenti terziari sottolineati. Card desktop e chip mobile condividono i componenti reali; le anteprime sono inerti e prive degli attributi di tracciamento. Il problema principale non è l’identità visiva, ma la visibilità dei controlli vuoti.

Non sono state applicate correzioni al codice durante questo audit.

## Riepilogo

| Dimensione | Punteggio | Evidenza principale |
| --- | ---: | --- |
| Accessibilità | 2/4 | Contrasto insufficiente dei confini dei campi; nomi accessibili e gerarchia titoli migliorabili |
| Prestazioni | 3/4 | Worker e analytics differiti; entry point importa comunque la homepage |
| Responsive | 3/4 | Nessuno scroll orizzontale di pagina nei viewport provati; campi mobili alti solo 32 px |
| Theming | 4/4 | Token semantici e tema scuro coerente con il brief; nessuna modalità chiara richiesta |
| Integrità implementativa | 3/4 | Componenti riusati; stato disponibilità e documentazione da allineare |
| **Totale** | **15/20** | **Buono: intervenire sui punti deboli** |

**7 rilievi: P0 = 0, P1 = 1, P2 = 5, P3 = 1.**

Le priorità sono: contrasto dei controlli, chiarezza dei nomi accessibili, disponibilità affidabile e dimensioni dei campi su mobile. Il punteggio è una valutazione tecnica di questa superficie, non una certificazione di conformità WCAG.

## Ambito verificato

- Primo accesso con banner cookie e rifiuto degli analytics.
- Passaggi creatività e fatturazione; invio vuoto, errori, caricamento PNG, passaggio avanti/indietro e mantenimento dei dati.
- Paese selezionato da tastiera: ricerca, freccia e Invio; aggiornamento dei campi fiscali passando da Italia a Stati Uniti.
- Desktop 1440×900, tablet 768×1024, mobile 390×844 e 320×740.
- Ingrandimento del font radice al 200% a 1440 px: nessuno scroll orizzontale della pagina; non equivale a una verifica completa dello zoom su ogni browser.
- Richiesta catalogo interrotta mediante intercettazione locale e successivo ripristino.
- Nessun pagamento, nessuna chiamata di creazione Checkout, nessuna modifica a Stripe o agli account.

## Problemi verificati

### 1. [P1] I controlli vuoti si distinguono poco dallo sfondo

**Categoria:** accessibilità. **Posizione:** `src/index.css:88`, `src/components/ui/input.tsx:11`, `src/components/ui/checkbox.tsx:14`, `src/components/ui/input-group.tsx`.

Il bordo `--input`, bianco al 15%, produce circa RGB(48,48,46) sullo sfondo RGB(12,12,9): **contrasto 1,48:1**. Misura ottenuta compositando i colori calcolati dal browser in un canvas sRGB. Il problema riguarda i campi non focalizzati e le checkbox non selezionate, la cui sagoma è un’informazione necessaria per riconoscere il controllo. Il testo leggibile o il focus successivo non risolvono la difficoltà iniziale di individuazione.

**Impatto:** utenti ipovedenti possono non distinguere dove digitare o quale casella selezionare.

**Standard:** WCAG 2.2, 1.4.11, contrasto non testuale minimo 3:1 per gli elementi necessari a identificare controlli e stati. [Spiegazione W3C](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html).

**Intervento:** introdurre o correggere il token del bordo dei controlli fino a raggiungere almeno 3:1; verificare anche checkbox, combobox e select. Evitare di schiarire indiscriminatamente tutti i divisori decorativi. Mantenere il blu per le azioni.

**Comando:** `$impeccable harden`.

### 2. [P2] Nomi accessibili non allineati al testo delle azioni

**Categoria:** accessibilità. **Posizione:** `src/components/SponsorBookingForm.tsx:331`, `src/components/Footer.tsx:83`.

Il bottone mostra “Choose icon” o “Replace icon”, ma nell’albero di accessibilità viene chiamato **“Favicon or icon”**, perché la label esterna punta al bottone. Il nome quindi non distingue la selezione dalla sostituzione. Inoltre axe, eseguendo esplicitamente la regola `label-content-name-mismatch`, segnala il link PEC: testo visibile `info@pec.nomadesrl.it PEC`, nome accessibile `Certified email (PEC): info@pec.nomadesrl.it`.

**Impatto:** chi usa lettori di schermo o comandi vocali trova una corrispondenza meno chiara tra ciò che vede e l’azione da richiedere.

**Standard:** verificare l’allineamento a WCAG 2.5.3. Il rilievo del link PEC proviene da una regola sperimentale: la diversa disposizione dei testi va valutata nel contesto, non interpretata automaticamente come prova di mancata conformità. [Spiegazione W3C](https://www.w3.org/WAI/WCAG22/Understanding/label-in-name.html).

**Intervento:** mantenere “Favicon or icon” come titolo del campo e lasciare che il testo del bottone ne determini il nome; associare l’aiuto tramite `aria-describedby`. Per la PEC evitare una sostituzione del testo accessibile non necessaria, oppure includere il testo visibile nello stesso ordine.

**Comando:** `$impeccable harden`.

### 3. [P2] I campi restano alti 32 px su mobile

**Categoria:** responsive. **Posizione:** `src/components/ui/input.tsx:11`, `src/components/ui/input-group.tsx`, `src/index.css:194`.

A 390 px i campi testo e il combobox paese misurano **32 px di altezza**. La regola mobile porta a 44 px i componenti Button, ma non Input/InputGroup. Le checkbox hanno un’area aggiuntiva tramite pseudo-elemento e label cliccabile: non vanno erroneamente classificate come target di soli 16 px.

**Impatto:** digitazione e correzione meno comode al tocco, soprattutto in un form lungo come la fatturazione.

**Standard:** 44 px è un obiettivo di ergonomia e del criterio avanzato; non è il minimo AA di WCAG 2.2. Questo rilievo **non dichiara una violazione AA**: il criterio 2.5.8 usa 24 px e prevede eccezioni. [W3C: target size minimum](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html).

**Intervento:** estendere l’altezza minima di 44 px ai controlli di input sui dispositivi touch e uniformare gli elementi incorporati nel combobox, preservando il font mobile da 16 px.

**Comando:** `$impeccable adapt`.

### 4. [P2] Disponibilità apparente quando il catalogo non risponde

**Categoria:** integrità implementativa / stati di errore. **Posizione:** `src/hooks/useSponsorCatalog.ts:17`, `src/hooks/useSponsorCatalog.ts:46`, `src/SponsorshipPage.tsx:48`, `src/components/SponsorBookingForm.tsx:584`.

Con la prima richiesta `/api/sponsors` interrotta, l’interfaccia mostra **“17/20 spots left”** dai valori iniziali e contemporaneamente **“Online booking is temporarily unavailable”**. Il pulsante è disabilitato; non compare un’azione di riprova, anche se il polling automatico prosegue. Durante un aggiornamento fallito può inoltre rimanere visibile il dato precedente senza indicazione di obsolescenza.

**Impatto:** l’utente riceve un numero non verificato e non capisce se i posti siano esauriti, il servizio non sia disponibile o la rete abbia un problema. Il backend continua a proteggere la capienza: è un problema di presentazione dello stato.

**Intervento:** distinguere caricamento, dato aggiornato ed errore; mostrare i posti soltanto quando noti, indicando l’eventuale dato non aggiornato. Aggiungere una riprova esplicita che conservi il form.

**Comando:** `$impeccable harden`.

### 5. [P2] La route sponsorship carica anche codice della homepage

**Categoria:** prestazioni. **Posizione:** `src/main.tsx:4`, `src/main.tsx:23`.

`App` è importata staticamente nell’entry point, mentre `SponsorshipPage` è caricata dinamicamente. Il percorso di ingresso di sponsorship conserva quindi il ramo della homepage nell’import graph, anche quando non viene renderizzato.

Nella build locale ispezionata: entry `index` **409.234 byte / 127.344 gzip**; chunk `SponsorshipPage` **354.054 byte / 105.519 gzip**. Sono dimensioni degli artefatti, non misure di latenza o di Core Web Vitals. Non tutto il chunk entry è eliminabile: contiene anche runtime e dipendenze condivise.

**Impatto:** codice non pertinente al form aggiunge download e parsing prima dell’interazione, soprattutto su dispositivi e connessioni lenti.

**Intervento:** importare dinamicamente anche la homepage in base alla route, poi misurare il bundle risultante. Valutare successivamente il caricamento separato della fatturazione, soltanto se la misura dimostra un beneficio.

**Comando:** `$impeccable optimize`.

### 6. [P2] Gerarchia delle intestazioni delle anteprime incompleta

**Categoria:** accessibilità / semantica. **Posizione:** `src/components/SponsorBookingForm.tsx:456`, `src/components/SponsorBookingForm.tsx:466`, `src/components/SponsorSingleCard.tsx`.

La gerarchia passa da H1 della pagina direttamente a H3 “Desktop card”; il nome dentro la card è a sua volta H3. Axe segnala `heading-order`. Il pulsante “Your preview” e le legend del form non sostituiscono un H2 nella navigazione per intestazioni.

**Impatto:** chi esplora la pagina per titoli trova una struttura che non rispecchia sezione, variante e nome dello sponsor.

**Standard:** buona pratica di struttura semantica; il solo salto numerico non viene presentato come violazione WCAG certa.

**Intervento:** assegnare un titolo H2 alla sezione anteprime e trattare le etichette desktop/mobile come testo descrittivo, mantenendo H3 per il nome della card; in alternativa rendere esplicita la gerarchia tramite una prop semantica del componente riusato.

**Comando:** `$impeccable harden`.

### 7. [P3] DESIGN.md descrive un sistema precedente

**Categoria:** integrità implementativa / documentazione. **Posizione:** `DESIGN.md`, sezioni Overview, Colors, Buttons e navigazione/footer.

Il documento menziona tema chiaro, selettore tema, completamenti rosa e varianti dei bottoni precedenti. Sono indicazioni in conflitto con il tema scuro unico e con le preferenze esplicite più recenti. Anche PRODUCT.md descrive prevalentemente il tool per immagini, non questa superficie commerciale.

**Impatto:** un intervento successivo può reintrodurre comportamenti o colori che sono stati deliberatamente rimossi.

**Intervento:** aggiornare il documento alle scelte già implementate, senza ridisegnare la pagina. Non è stato modificato automaticamente durante l’audit.

**Comando:** `$impeccable document`.

## Controlli positivi

- Prezzo, IVA, durata, decorrenza e assenza di rinnovo automatico sono esposti prima del form.
- Schema Zod condiviso con il backend; errori associati ai controlli e focus sul primo campo invalido.
- Cambio di passaggio con focus esplicito; ritorno alla creatività conserva dati e icona.
- Ricerca del paese utilizzabile con tastiera; campi italiani rimossi selezionando Stati Uniti.
- La correzione delle checkbox verifica immediatamente la scelta senza costringere a spostare il focus.
- Anteprime reali, nessun link navigabile o attributo impression nelle anteprime.
- Nessun overflow orizzontale della pagina nei viewport verificati. Nessun clipping bloccante osservato con ingrandimento del font al 200% nel controllo desktop.
- Pulsanti principali mobili di almeno 44 px; input mobili da 16 px, evitando il comune innesco dello zoom automatico su iOS.
- Rifiuto cookie disponibile quanto l’accettazione. Nella sessione senza consenso non sono state osservate richieste PostHog.
- Nessun caricamento del worker OpenCV o di WorkflowApp nella route sponsorship osservata.
- Nessun errore JavaScript dell’app rilevato nella sessione di audit.

## Detector e limiti

Il detector Impeccable ha segnalato 13 occorrenze: una relativa a Geist e 12 advisory su token/font. Geist Mono è una scelta deliberata e viene escluso. Le segnalazioni di stampa (`#000`, `#999`) sono appropriate al loro contesto; varie dimensioni riguardano documenti legali o homepage, fuori da questa route. Le differenze dalla documentazione alimentano il rilievo 7, senza trasformare ogni advisory in un problema.

Il comando iniziale di context ha interpretato `/sponsorship` come percorso filesystem assoluto: i suoi messaggi di documenti mancanti non sono stati usati come evidenza. PRODUCT.md e DESIGN.md effettivamente presenti nella repository sono stati letti direttamente. Il detector ha ricevuto un percorso iniziale errato per il componente pagina (`src/components/SponsorshipPage.tsx`): la pagina reale `src/SponsorshipPage.tsx` è stata quindi verificata manualmente; gli altri target del detector sono stati letti correttamente.

Axe con tag WCAG A/AA e best practices ha restituito solo `heading-order` nel passaggio creatività e nessuna violazione nel passaggio fatturazione osservato. Tre verifiche colore della prima scansione erano incomplete e non vengono contate come superate. Il contrasto non testuale è stato misurato separatamente. La regola sperimentale per il nome accessibile è stata eseguita separatamente e valutata nel contesto.

L’audit non comprende una sessione con VoiceOver/NVDA, Safari/iOS reale, misure di performance in produzione o il checkout ospitato da Stripe. Il dev server non viene usato per dedurre punteggi Lighthouse o tempi di caricamento in produzione.

## Ordine degli interventi

1. **[P1/P2] `$impeccable harden`** — contrasto dei controlli, nomi accessibili, gerarchia titoli e stati catalogo.
2. **[P2] `$impeccable adapt`** — input e combobox touch da almeno 44 px.
3. **[P2] `$impeccable optimize`** — separazione dell’entry della homepage e misura dei chunk.
4. **[P3] `$impeccable document`** — allineamento del sistema documentato.
5. **`$impeccable polish`** — controllo finale dopo gli interventi.

Si possono eseguire uno alla volta, insieme o nell’ordine preferito. Dopo le correzioni, ripetere `$impeccable audit` per confrontare gli esiti.

## Aggiornamento — harden completato

Intervento successivo all’audit, 18 settembre 2026:

- **Rilievo 1 corretto:** token separato `--control-border` per Input, Textarea, InputGroup, Select e Checkbox. Contrasto misurato sullo sfondo della pagina: **4,21:1**. I divisori decorativi e il riempimento dei controlli conservano i propri token.
- **Rilievo 2 corretto:** il pulsante icona usa il proprio testo come nome accessibile; il link PEC conserva il testo visibile senza sostituzioni ARIA.
- **Rilievo 4 corretto:** stato iniziale di caricamento senza conteggi inventati; risposta verificata, timeout a 10 secondi, errore e riprova espliciti. Errori HTTP, JSON incompleto/non valido e interruzioni di rete rendono la disponibilità sconosciuta. Richieste concorrenti vengono accorpate. I campi compilati restano montati; il checkout viene riabilitato dopo il recupero. Gli sponsor già caricati rimangono visibili fino alla propria scadenza. Anche le card di invito della homepage omettono il conteggio quando non verificato.
- **Rilievo 6 corretto:** titolo H2 per le anteprime, etichette desktop/mobile descrittive e H3 del progetto.

Verifiche: **197 test unitari passati**, inclusi 13 casi nuovi sul catalogo; build client/SSR e controllo localizzazioni passati; lint sui file modificati passato. I 43 test di integrazione backend sono esclusi dal comando unitario e non sono stati rieseguiti per questo intervento frontend.

Browser: desktop 1440 px e mobile 320 px; contenuto lungo, emoji e CJK; interruzione rete, risposta priva del conteggio, riprova e recupero anche nel passaggio fatturazione; scelta del dominio e icona conservate. Nessun overflow orizzontale di pagina rilevato; locale cinese verificato. Axe non segnala violazioni nelle scansioni dei due passaggi, ma alcune verifiche automatiche del colore rimangono incomplete: questo esito non equivale a una certificazione WCAG. Il contrasto dei bordi è stato misurato separatamente.

Il controllo del catalogo non importa il bundle Zod nella homepage; le validazioni dei form continuano a usare gli schemi Zod condivisi. Restano per i passaggi successivi dell’audit l’ergonomia touch dei campi (3), la separazione della homepage nell’entry point (5) e l’aggiornamento DESIGN.md (7). Segue una passata `$impeccable polish` dopo gli eventuali interventi adapt/optimize/document.

## Aggiornamento — adapt completato

- **Rilievo 3 corretto:** campi, selettori, opzioni, azioni dell’icona e sezioni espandibili hanno un’area toccabile di almeno 44 px sui viewport stretti e sui dispositivi con puntatore touch. I campi mantengono almeno 16 px di testo. Il layout con mouse conserva i controlli compatti.
- Azioni della fatturazione impilate sugli schermi piccoli; opzioni lunghe vanno a capo nei menu. Margini laterali rispettano le safe area del dispositivo.
- Indicatore dei passaggi, intestazioni, allegato e footer gestiscono il testo ingrandito. Le anteprime riusano i componenti del sito e conservano le loro dimensioni; quando necessario scorrono nel proprio contenitore.

Verifiche nel browser: viewport 320, 393, 768, 844 e 1440 px; menu paesi e tipi fiscali canadesi; testo al 200% a 320 px. Build client/SSR, localizzazioni, lint mirato e diff check verificati. Il detector segnala solo font/token preesistenti già discussi nell’audit; DESIGN.md resta da aggiornare separatamente.

Limiti: viewport emulati, non dispositivi fisici; la query `any-pointer: coarse` è prevista nel CSS ma non è stata verificata su un tablet touch reale. Restano da provare tastiera virtuale e safe area su Safari/iOS e Android reali. Nessun pagamento creato durante queste verifiche.

## Aggiornamento — optimize completato

**Rilievo 5 corretto:** l’entry client importa esclusivamente la route richiesta. In produzione l’HTML prerenderizzato anticipa il caricamento della route e delle sue dipendenze statiche tramite `modulepreload`, senza anticipare homepage, workflow o fatturazione su `/sponsorship`. I due loader sono separati anche nell’espressione sorgente: un import condizionale dentro lo stesso callback induceva Vite a precaricare entrambe le route, comportamento rilevato e corretto verificando le richieste effettive.

Il form fiscale e i suoi selettori vengono caricati dopo la validazione della creatività. Durante il caricamento il pulsante è disabilitato e mostra uno stato esplicito; il cambio di passaggio conserva il focus e i dati. Un errore del modulo mantiene la creatività montata e mostra istruzioni per copiare i dati prima di ricaricare: un import fallito può restare nella cache del browser fino al reload, quindi non viene promesso un semplice retry né imposto un reload che perderebbe il form.

### Misura prima/dopo

Build di produzione locale, stessi dati e dipendenze; somma dei file JavaScript dell’entry e della route, seguendo solo import statici. Compressione con Python `gzip.compress`, livello 9, per entrambi i campioni; esclusi CSS, font e richieste API.

| JavaScript iniziale sponsorship | Prima | Dopo | Riduzione |
| --- | ---: | ---: | ---: |
| Minificato | 865.351 byte | 641.718 byte | 25,84% |
| Gzip | 268.104 byte | 199.592 byte | 25,55% |

La divisione passa da 5 a 7 file JS iniziali, anticipati dall’HTML; fatturazione (~169 kB minificati più una dipendenza da ~8 kB) viene richiesta soltanto al secondo passaggio. La verifica delle richieste in Chromium conferma l’assenza dei chunk App, WorkflowApp e SponsorBillingForm al primo caricamento sponsorship; il percorso inverso della homepage non carica la sponsorship.

Verifiche: build client/SSR, documenti prerenderizzati nelle due lingue, **197 test unitari passati**, lint e diff check. Il nuovo `scripts/verify-route-bundles.mjs`, incluso in `pnpm build`, controlla separazione dei chunk e preload nelle quattro pagine EN/ZH. I test di avvio attendono ora il caricamento asincrono e continuano a verificare che analytics non blocchi la pagina. I 43 test backend restano esclusi dalla suite unitaria.

Browser sulla build di produzione servita localmente: desktop EN 1440 px, mobile ZH 320 px, passaggio creatività/fatturazione e ritorno con icona e bozza fiscale conservate; errore di rete controllato sul chunk fiscale; nessun pagamento avviato. Detector: nessuna segnalazione nei target optimize. Non sono misure CWV di utenti reali né benchmark di latenza Vercel: non si deduce un miglioramento percentuale di LCP/INP dai soli byte risparmiati.

## Aggiornamento — typeset completato

La valutazione tipografica ha rilevato una gerarchia debole: titolo 24/32 px, titoli di sezione 16/24 px a peso 500, etichette 14 px a peso 500 e introduzioni 14/21 px. Il detector separato ha segnalato soltanto la famiglia già scelta e dimensioni fuori dal DESIGN.md non aggiornato; non rilevava la vicinanza percettiva dei ruoli.

Ruoli applicati solo alla sponsorship, mantenendo Geist Mono Variable e il fallback cinese esistente:

- Titolo responsive 28–32 px, peso 800, interlinea 1,2; tracking −0,02em. In cinese tracking normale e interlinea 1,35.
- Titoli delle sezioni 20/28 px a peso 700; etichette 14/21 px a peso 600.
- Introduzioni e condizioni 16/26,4 px, misura desktop di circa 60 caratteri. Aiuti/errori 14/22,4 px con gestione delle parole lunghe.
- Prezzo 18/27 px; avanzamento e dettagli principali a 14 px. Numeri tabulari per prezzo, disponibilità, passaggi e contatore.
- Checkbox delle condizioni allineate alla prima riga; card e chip di anteprima conservano la tipografia dei componenti pubblicati.

Verifiche: valori computati nel browser corrispondenti ai ruoli sopra; desktop EN 1440 px, mobile EN 390 px e ZH 320 px, fatturazione EN a 320 px con font al 200% senza overflow orizzontale dopo la correzione delle parole lunghe. Confronto visivo di creatività, condizioni e pagina cinese; nessun errore JavaScript rilevato. Build client/SSR, localizzazioni, controllo dei chunk, lint mirato e diff check passati.

Nessuna famiglia o risorsa font aggiunta: resta il singolo WOFF2 variabile latino con `font-display: swap`, pesi 100–900 e fallback locale per CJK. Colori, contrasto e gestione del caricamento non sono modificati. Il detector finale conserva le segnalazioni preesistenti e aggiunge un advisory per la scala intenzionale 28–32 px del titolo, non descritta dal vecchio DESIGN.md; non è stato aggiornato globalmente il design system come effetto collaterale. Il controllo è in Chromium emulato, non su dispositivi fisici o con ogni font di fallback del sistema.

## Aggiornamento — polish completato

Difetti locali rifiniti mantenendo il layout e il contenuto esistenti:

- Titolo di sezione e descrizione avevano **0 px** di separazione a causa del margine negativo del componente FieldDescription. Ora la distanza misurata è **8 px**, limitata ai titoli visibili della sponsorship; le legende nascoste restano tali.
- Anteprima e dettagli SdI/PEC hanno un indicatore di apertura coerente con le sezioni espandibili. Pulsanti ghost allineati al form senza padding laterale; freccia decorativa orientata dallo stato reale, senza nuove animazioni o cambi ai nomi accessibili.
- L’azione di avanzamento espone `aria-busy` durante validazione e caricamento.

Verifica sul flusso locale: invio della creatività vuota, focus sul primo campo invalido, correzione e passaggio alla fatturazione; apertura/chiusura dell’anteprima anche con Space; dettagli fiscali opzionali; invio dei dati fiscali vuoti e focus corretto; tre checkbox con rimozione immediata degli errori senza blur; ritorno alla creatività e rimozione icona con errore e focus sul relativo pulsante. Non è stato creato alcun checkout.

Ispezione desktop EN 1440 px, mobile EN 390 px, 320 px con testo al 200% e tablet ZH 768 px: nessun overflow orizzontale di pagina rilevato e nessun errore JavaScript. Build client/SSR, localizzazioni, controlli dei bundle, lint mirato e diff check passati. Il detector restituisce esclusivamente le eccezioni già motivate (Geist Mono scelto, regole di stampa, scale intenzionali e DESIGN.md non aggiornato). Nessuna nuova dipendenza installata. Test effettuati in Chromium con viewport emulati; restano fuori dalla verifica Safari/Android fisici e il pagamento ospitato da Stripe.
