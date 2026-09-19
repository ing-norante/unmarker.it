# Refactoring review — 19 settembre 2026

Revisione analizzata: `4b2440a`, branch `engine-optimization`.

Questo documento conserva l'audit precedente all'implementazione. Il successivo
intervento ha applicato il perimetro immagini, workflow e build, escludendo gli
sponsor su richiesta dell'utente. Stato finale e verifiche sono documentati in
[engine-optimization.md](engine-optimization.md#refactoring-follow-up).

L'architettura ha già confini utili: motore immagini autonomo, parser per formato,
runtime C2PA locale, coda sequenziale, export separato, caricamento differito del
workflow e del billing. La semplificazione consigliata consiste nel rimuovere i
residui precedenti, rendere espliciti i contratti e concentrare il coordinamento
delle operazioni. Non emerge la necessità di cambiare framework o introdurre
infrastruttura server per le immagini.

L'audit comprende applicazione, motore, worker, metadati, traduzioni, sponsor,
backend, script, configurazioni e documentazione. Il controllo degli import ha
considerato 205 file TS/TSX/JS/MJS tracciati, incluse importazioni dinamiche e
riferimenti ai worker. I candidati inutilizzati sono stati verificati anche con
ricerche testuali: il grafo statico da solo non copre CSS, asset e chiavi i18n.
Le osservazioni funzionali derivano dalla lettura del codice; in questo audit
non sono stati eseguiti nuovi test, benchmark o verifiche browser. Non sono stati
interrogati servizi esterni. Alla conclusione dell'audit questo documento era
l'unica modifica alla repository.

## Priorità

| Ordine | Intervento | Natura | Rischio della modifica |
| --- | --- | --- | --- |
| 1 | Rendere riproducibili i test e correggere i riferimenti documentali | Manutenzione | Basso |
| 2 | Rimuovere UI, API e stili inutilizzati | Pulizia | Basso |
| 3 | Conservare tutte le evidenze metadata | Correzione e refactoring | Medio |
| 4 | Coordinare operazioni e cancellazione dei parser | Correzione e refactoring | Medio |
| 5 | Restringere risultati e transizioni; condividere primitive worker | Refactoring | Medio |
| 6 | Riutilizzare ispezione metadata ed executor pixel | Refactoring | Medio |
| 7 | Semplificare layout, messaggi e presentazione degli stati | Refactoring | Basso–medio |
| 8 | Separare decisioni, contratti e form sponsor | Refactoring | Medio–alto |
| 9 | Consolidare configurazioni e strumenti di build | Manutenzione | Basso–medio |

Gli interventi che correggono comportamenti vanno mantenuti separati dalle
rimozioni meccaniche, così da avere commit e verifiche leggibili.

## 1. Pulizia confermata

Otto componenti in `src/components/ui/` non hanno importatori nel codice tracciato:
`item.tsx`, `native-select.tsx`, `radio-group.tsx`, `scroll-area.tsx`, `sonner.tsx`,
`switch.tsx`, `tabs.tsx`, `tooltip.tsx`. Insieme contengono circa 580 righe.
Il pacchetto `sonner` è usato soltanto dal wrapper inutilizzato e può essere
rimosso insieme a quello. Questo riduce manutenzione e dipendenze installate;
non implica un risparmio equivalente nel bundle, che già esclude moduli non importati.

Anche `src/assets/react.svg`, `vite.svg` e `canvas.svg` non hanno riferimenti
nei sorgenti, template o script esaminati.

Restano API del precedente workflow:

- `AppMode`, `ImageWorkflowState`, `ImageWorkflowCapabilities` in `src/lib/types.ts:3,192`.
- `FILE_MODE_POLICIES`, `getFileModePolicy`, `validateFileForMode`,
  `validateUnmarkFile`, `validateMetadataFile`, `inspectBrowserImageDecode` e
  relativo decoder in `src/lib/fileValidation.ts:70` e seguenti. Alcune sono
  referenziate solo dai vecchi test; la validazione del workflow corrente va conservata.
- `resetRunningPipelineSteps` e `markRunningPipelineStepsAsError` in
  `src/lib/pipelineSteps.ts:39,47`.
- `src/lib/objectUrl.ts` diventa eliminabile rimuovendo il decoder legacy,
  suo unico importatore. I lifecycle URL delle anteprime e dei download hanno
  invece durate differenti e non vanno unificati indiscriminatamente.

In `src/index.css:754` sono rimasti `.workflow-action-bar`, `.workflow-actions`,
`.workflow-actions-mobile` e riferimenti a `--workflow-toolbar-height`, senza
più un writer. Eliminare soltanto questi residui: offset sponsor mobile,
scroll padding, cookie banner e suggerimento lingua sono ancora attivi.

Non eliminare `@base-ui/react`, usato dal combobox, né `shadcn`, importato anche
dal CSS. `sharp`, `pg` e `stripe` hanno utilizzi reali nel server. Le chiavi i18n
costruite dinamicamente e gli stili delle pagine legali generate richiedono un
controllo diverso dalla sola ricerca degli import.

Verifica: compilazione, lint, test della validazione attuale, build con controllo
dei chunk e confronto visivo per le rimozioni CSS.

## 2. Evidenze metadata complete

`src/lib/metadata/formats/png.ts:69`, `jpeg.ts:119` e `webp.ts:114` trovano più
marker nello stesso blocco, ma salvano soltanto `markers[0]`. La decisione di
avviare il reader C2PA in `src/lib/metadataCleaner.ts:46` usa quel singolo marker.

Esempio: un blocco XMP con `openai` e `dcterms:provenance` conserva `openai`, per
l'ordine della lista dei marker. Se non esistono altri segnali C2PA, la referenza
non avvia l'approfondimento locale. Si possono perdere anche evidenze utili alla
classificazione e al provider. Questo non significa che ogni manifest embedded
venga ignorato: i contenitori C2PA riconosciuti producono segnali separati.

Proposta: un segnale per segmento, con tutte le evidenze; marker rappresentativo
ed etichetta diventano una proiezione per la UI. Scanner, classificazione e C2PA
leggono la stessa raccolta completa. Le regole binarie di rimozione restano separate.

Verifica: combinazioni di marker e ordine differente; un segmento conta una volta;
provider e provenienza coesistono; C2PA non equivale automaticamente ad AI;
compatibilità del report JSON e byte identici dei cleaner a parità di policy.

## 3. Coordinamento delle operazioni e cancellazione

Due responsabilità correlate oggi sono frammentate.

**Azioni del workspace.** ZIP è gestito dal parent (`src/WorkflowApp.tsx:27,47`),
mentre la pulizia metadata ha stato locale (`src/components/BatchResult.tsx:31,53`).
Avviando la pulizia su un risultato completato mentre la coda è in pausa, il
parent può ancora consentire ripresa, aggiunta file o ZIP. Non conosce `cleaning`.
Smontare il pannello impedisce gli aggiornamenti UI attraverso `alive`, ma non
interrompe il lavoro sottostante.

Serve un coordinatore delle operazioni del workspace con acquisizione/rilascio
esplicito della disponibilità. Le azioni ricevono capabilities e callback coerenti.
La pausa scelta dall'utente va mantenuta; il semplice cambio anteprima può restare
disponibile. Testare pulizia→ripresa, pulizia→ZIP, unmount, errore e cancellazione.

**Parser.** `scanImageMetadata` controlla abort prima della lettura e dopo il
parsing, ma non fra `file.arrayBuffer()` e il parsing (`metadataCleaner.ts:43`).
L'engine può interrompere l'attesa con `abortable` (`engine/processImage.ts:267`)
mentre la scansione continua. La decompressione PNG non riceve un segnale
(`metadata/formats/png.ts:198`): il job successivo può sovrapporsi a lavoro
cancellato ancora in corso.

Proposta: `ParseContext { signal, budget }`, condiviso da scan e clean, con controlli
dopo le attese e tra chunk e cancellazione del reader di decompressione. Questo
non rende interrompibile `Blob.arrayBuffer()` già avviato né JavaScript sincrono
a metà istruzione: impedisce però di proseguire inutilmente ai punti cooperativi.
Abort deve restare distinto da corruzione del file e non produrre risultati tardivi.

## 4. Contratti più stretti e lifecycle dei worker

`src/lib/engine/types.ts:22` permette combinazioni come `completed` senza output.
`src/lib/batch/queue.ts:23` combina status, result ed error opzionali senza vincoli.
Le transizioni attraverso `Partial<BatchItem>` rendono facile introdurre stati
incoerenti che la UI deve poi filtrare.

Usare unioni discriminate per risultati e item: completato con output/postflight,
sola analisi con relativo audit, fallito con errore, e stati non terminali.
Mantenere l'identità del tentativo per ignorare callback precedenti. Anche
`imageAudit.ts:25` dovrebbe richiedere uno stato esplicito della scansione visibile:
il default attuale interpreta detection omessa come scansione negativa, sebbene
l'engine corrente passi già lo stato correttamente.

La presentazione può quindi usare piccoli selettori esaustivi per fase, azioni,
badge e messaggi, oggi ripetuti fra `BatchResult`, `BatchQueuePanel`,
`ImageComparison`, `VerificationDiff` e `AnalysisPanel`.

Timeout, abort, listener e settlement sono ripetuti in `engine/pixels.ts:69`,
`batch/export.ts:20` e `geminiWorkerClient.ts:141`. Condividere primitive piccole
per queste responsabilità, mantenendo diverse politiche di durata e trasferimento.
Il contratto `finish(error?, output?)` in `pixels.ts` ammette una risposta senza
entrambi, che può chiudere il timer senza risolvere la promise: un difetto difensivo,
non un percorso prodotto riprodotto nell'audit.

Il worker Gemini condiviso termina anche altri job pendenti quando un job viene
annullato. È un limite per futuri chiamanti concorrenti; non è una prova di guasto
nel batch sequenziale corrente. Il runtime C2PA serializzato mantiene invece un
confine intenzionale e non richiede un worker pool universale.

Verifica: timeout, errore di invio, risposta invalida, abort prima/durante il job,
rilascio delle risorse una volta sola, retry e callback obsolete. Non convertire
abort in fallback automatico.

## 5. Ridurre duplicazione e memoria nel motore

**Ispezione metadata riusabile.** Scan e clean ripetono attraversamento e
classificazione nei parser. In PNG il cleaner controlla i warning strutturali
prima del loop, ma può accumulare warning di decompressione nel loop e modificare
comunque il file; `canCleanMetadata` considera quegli stessi warning bloccanti
(`metadata/formats/png.ts:85`, `metadataCleaner.ts:80`).

Ogni formato potrebbe produrre un'ispezione effimera con segnali, warning e piano
di modifiche. L'applicatore esegue solo un piano ammesso dalla policy. Condividere
il contratto, mantenendo walker specifici: entropy JPEG, padding/flag WebP e
offset BMFF non hanno le stesse regole. Evitare cache globali che trattengono i file.
La policy sui warning va esplicitata con test: non cambiarla incidentalmente.

**Executor pixel condiviso.** Shake→stir→crush e progress sono duplicati in
`engine/pixels.ts:107` e `workers/pixels.worker.ts:13`. Un executor condiviso può
ricevere superficie e callback; i driver possiedono canvas, bitmap e trasferimenti.
Tipi Canvas e abort appartengono a moduli neutrali, senza importare orchestrazione
nel worker. Verificare stesso ordine, RNG deterministico nei test, qualità JPEG,
alpha, fallback dall'originale e rilascio delle risorse.

**Scanner testuale.** `metadata/markers.ts:72` decodifica quattro encoding,
concatena e normalizza più rappresentazioni. `metadataCleaner.ts:113` può farlo
sull'intero file di formato sconosciuto. È un candidato a ridurre il picco memoria
tramite ricerca incrementale con gestione dei confini e degli encoding. Servono
misure prima/dopo: l'audit non quantifica un miglioramento prestazionale.

**Tipi storici.** `src/lib/types.ts:156` espone stati hidden e valori di confidence
che il builder non emette più; lo score numerico è sempre nullo. Restringere il
modello interno, mantenendo un adapter per il report versione 1 se necessario.
Non reintrodurre affermazioni di neutralizzazione o probabilità non misurate.

## 6. Layout, messaggi e stylesheet

`src/App.tsx:63,117` e `src/WorkflowApp.tsx:70` ripetono wrapper, griglie e porzioni
del layout. Un `WorkspaceFrame` presentazionale con pochi slot elimina la
duplicazione tra homepage, loading e risultati. La pagina sponsorship ha requisiti
distinti e non necessita dello stesso componente universale.

Preservare montaggio di `SponsorLayout`, impression, focus uploader al reset,
ordine mobile, SSR e caricamento differito del motore. Verificare entrambe le
lingue e viewport 320/390/1024/1440.

Gli avvisi di `WorkflowApp` e `BatchResult` memorizzano stringhe già tradotte;
cambiando lingua un avviso esistente resta nella lingua precedente. Salvare
`MessageDescriptor` e valori, traducendo al rendering, come fa già il resto della
pipeline. Tipizzare le mappe delle chiavi (`src/i18n/messages.ts:1`,
`src/i18n/metadata.ts:3`) riduce cast e chiavi inesistenti. Testare EN→ZH→EN con
avviso già visibile, interpolazioni e pluralizzazione.

Dopo la rimozione degli stili morti, `src/index.css` può essere suddiviso per
responsabilità, conservando ordine della cascata e specificità. Non cambiare
insieme architettura CSS e design. Mantenere popup portalled, stili legali,
reduced motion, safe area e regole touch. Applicare Impeccable alla successiva
implementazione UI e alla verifica renderizzata.

## 7. Sponsor: contratti e decisioni autonome

**Servizio.** `server/sponsors/service.ts:513` concentra in `syncLocked` lettura
Stripe, verifica della sessione, scelta dello stato, snapshot, SQL e outbox.
Estrarre prima decisioni pure di validazione e riconciliazione, con `now` esplicito.
Lasciare transazione e orchestrazione nel servizio. Non serve un repository
generico per ogni chiamata Stripe.

**Contratti.** `Purchase.status` usa un tipo che include `stopped`, mentre nel DB
quella condizione deriva da `publication_stopped_at` (`service.ts:34`,
`src/lib/sponsorPurchase.ts:38`, `server/sponsors/schema.sql:18`). Separare stato
persistito e stato pubblico. Annotare il ritorno di `publicPurchase`
(`service.ts:466`) e condividere i pochi tipi request/response con il client.
`sponsorApi.ts:19` oggi asserisce la risposta JSON senza validarla: un eventuale
decoder runtime è un cambiamento comportamentale separato dalla pulizia dei tipi.

**Outbox.** `flushAnalytics` (`service.ts:741`) può vivere in un modulo dedicato,
con builder puro del payload. L'inserimento al fulfillment resta atomico e il
coordinamento con il consenso resta sotto lo stesso lock. Spostare il fetch fuori
dalla transazione cambierebbe una garanzia, non sarebbe una semplice estrazione.

**Duplicazioni puntuali.** Riutilizzare le costanti di prezzo/durata già presenti
in `sponsorPurchase.ts:3` nella logica eseguibile; estrarre la query rate limit
ripetuta in `http.ts:104` e `service.ts:248`; condividere gli eventi webhook fra
handler e `scripts/sponsors-stripe-listen.mjs:15`.

**Configurazione.** `db.ts:7` chiama `getConfig()`, che richiede insieme DB,
credenziali Stripe e configurazione checkout (`config.ts:13`). Separare getter
DB e checkout, mantenendo controlli live nelle entrypoint appropriate. Rendere
esplicito che `transaction` acquisisce il lock globale inventario.

Invarianti: retry idempotenti, capacità degli slot, prevalenza dello stato Stripe
attuale su webhook vecchi, primo snapshot fiscale immutabile, 720 ore reali anche
attraverso DST, rimborso parziale senza estensione/stop, rimborso totale e dispute,
stop amministrativo indipendente dai pagamenti, nessun invio analytics senza
consenso. Non includere dati fiscali, token o identificativi interni nei DTO pubblici.
Non caricare Zod/billing nel catalogo della homepage.

## 8. Sponsor: flusso e form UI

`SponsorBookingForm.tsx` ha circa 660 righe e coordina creatività, validazione,
bozza, billing differito, pending checkout, request ID, redirect e cancellazione.
`SponsorBillingForm.tsx` ha circa 530 righe; la dimensione da sola non è un problema,
ma qui riflette responsabilità separabili.

Estrarre un controller del percorso checkout con transizioni esplicite e payload
billing diretto. Separare sezioni creatività, checkout pendente e billing.
`SponsorPurchaseReturn` può condividere azioni ed error mapping senza essere
fuso col flusso del form. Estrarre un piccolo frame per label/errori/ARIA e le
configurazioni statiche dei campi; mantenere espliciti paese, fiscalità e consensi.
Il lifecycle della preview può riusare `useBlobUrl`.

È il refactor UI più delicato: preservare request ID nei retry, dati tornando
indietro, recupero pending, assenza di doppi pagamenti, focus errori, reset fiscale
al cambio paese, disclosure opzionali, lazy loading e recupero del chunk billing.
Servono test di interazione; gli schema test non coprono queste transizioni.

Una differenza funzionale da decidere separatamente: il client limita ogni lato
dell'icona a 1024 (`sponsorFormValidation.ts:61`), il server limita il totale a
1024×1024 pixel (`service.ts:77`). Un'immagine 2048×256 passa il secondo limite,
non il primo. Uniformare significa scegliere una policy, non solo togliere duplicati.

## 9. Test, build e documentazione

Il test `scripts/legal-pages.test.ts:31` richiede
`docs/legal/sponsor-terms.it.md`, assente dalla repository. Esiste una copia locale
in una directory ignorata, ma puntare a quella non rende il test riproducibile in
un checkout pulito. Occorre decidere quale fonte sia un requisito del progetto e
tracciarla, oppure eliminare l'aspettativa obsoleta conservando le verifiche dei
documenti effettivamente pubblicati. Non pubblicare automaticamente documenti locali.

Il README contiene link a guide Stripe, preview e amministrazione non presenti
nei percorsi tracciati (`README.md:179,217,273`). Separare documentazione operativa
duratura da audit locali ignorati e controllare che i link relativi si risolvano.

`server/sponsors/service.test.ts:185` pone tutta la suite sotto
`describe.skipIf(!connection)`, incluse verifiche principalmente pure. Estrarre
test senza DB per proiezione pubblica, decisioni di riconciliazione, conferme e
normalizzazione dell'icona. Mantenere integration test per concorrenza, SQL,
recovery e webhook; conservare il guard del database locale nello script dedicato.

La precedente verifica su questa revisione ha riportato 274 test passati,
44 saltati e un fallimento preesistente relativo al documento italiano. Non è
una nuova esecuzione dell'audit e non equivale a copertura completa del backend.

Lingue, percorsi e documenti legali ricompaiono in `src/i18n/locales.ts`,
`scripts/prerender.mjs:42`, `scripts/verify-route-bundles.mjs:41`, configurazioni
Vite/Vercel e registri legali. Riutilizzare prima le configurazioni esistenti;
centralizzare solo dati stabili importabili anche dagli script, senza portare
dipendenze Node nel browser. Mantenere verifiche indipendenti sulle route attese
e sui chunk: un test che deriva ogni aspettativa dal codice può replicarne gli errori.

`eslint.config.js` applica globals browser e regole React a tutti i file TS,
anche server/script. Introdurre override per ambiente; estendere i controlli agli
script MJS. `tsconfig.node.json:25` seleziona gli script sponsor ma non comprende
direttamente tutti gli altri test/script. Verificare esplicitamente la copertura
dei controlli, mantenendo poche configurazioni comprensibili. Il requisito Node
documentato nel README può essere dichiarato anche in `package.json`.

## Sequenza di implementazione consigliata

1. Rendere riproducibile la baseline, correggere link e separare i test puri sponsor.
2. Commit di sola rimozione: componenti, asset, API legacy, CSS e dipendenza `sonner`.
3. Correzione delle evidenze metadata con fixture che combinano provider e provenienza.
4. Cancellazione cooperativa dei parser e coordinamento delle operazioni, con test
   controllati sulle sovrapposizioni e sul rilascio delle risorse.
5. Contratti discriminati, selettori UI e primitive worker; verificare errori e retry.
6. Executor pixel e ispezioni per formato, con regressioni binarie e misure memoria.
7. Layout e messaggi traducibili, con verifica UI Impeccable e controllo dei bundle.
8. Refactor sponsor in commit distinti: decisioni pure, DTO/config/outbox, poi form.
9. Consolidamento degli script e aggiornamento finale della documentazione.

Ogni gruppo deve preservare elaborazione immagini esclusivamente locale, fallback
browser, modalità sola analisi, batch sequenziale con limiti, export/report,
accessibilità, lingue, sponsor e privacy. Evitare una riscrittura globale, nuovi
state manager o framework di plugin: i benefici individuati derivano soprattutto
da contratti più precisi e dalla rimozione delle duplicazioni esistenti.
