> Historical analysis before implementation. The delivered browser architecture, checks and remaining limits are documented in [engine-optimization.md](engine-optimization.md).

**Analisi di watermarks-remover e opportunità per Unmarker.it**

18 settembre 2026. Vincolo: elaborazione dei file interamente nel browser, senza upload, servizi locali obbligatori o backend di elaborazione.

**Valutazione principale**

La repo offre spunti validi soprattutto per pulizia strutturale dei file, copertura dei formati, reporting e metodologia di verifica. Non contiene un motore leggero di rimozione dei watermark invisibili pronto da compilare in WASM. Le funzioni più avanzate sui pixel sono adattatori verso progetti esterni.

Per Unmarker darei priorità a qualità dell'analisi, conservazione dell'immagine e prestazioni. Affiancherei una ricerca separata su un detector spettrale locale; rimanderei una pipeline generativa completa.

**1. Perimetro e attendibilità dell'analisi**

- Repo esterna: commit `e4d2bd49c4cb84c5fddb50f5361618cfb3b75def`, coincidente con `origin HEAD` verificato durante l'analisi.
- Unmarker: codice locale esaminato a partire dal commit `8eefc868dd0a5d5257b77726bc6148c2eb532607`. Erano presenti modifiche a branding/favicon/Header, estranee all'analisi.
- Esaminati codice, fixture, test, Dockerfile, dipendenze, benchmark e documentazione; verificate anche fonti primarie delle dipendenze browser e dei backend esterni.
- Test mirati repo esterna: **487 passati, 1 saltato**. Test mirati Unmarker: **40 passati**.
- Nessun download di modelli, nessun avvio di servizi di inferenza, nessun invio di immagini. Non sono state misurate efficacia reale dei modelli, memoria browser o velocità su smartphone.
- Le stime di lavoro, memoria e portabilità che seguono sono valutazioni ingegneristiche, non risultati di benchmark.

**2. Cosa fa davvero il progetto**

| Componente | Implementazione effettiva | Interesse per Unmarker |
|---|---|---|
| Pulizia Unicode | Regole Python deterministiche e contestuali | Port TypeScript semplice, se si vuole aggiungere il testo |
| Metadati immagini | Parser binari, rimozione di chunk/segmenti/box, strumenti esterni opzionali | Alta riusabilità delle idee e delle fixture |
| Documenti | Pulizia XML/ZIP, proprietà, immagini incorporate; PDF con strumenti nativi | Espansione possibile, complessità diversa per formato |
| Audio/video | Pulizia contenitori; trasformazioni opzionali con FFmpeg/modelli | Metadati portabili; trattamento del segnale molto più costoso |
| Riscrittura testo | LLM via Ollama/API e masked language model | Non compatibile direttamente con il requisito browser |
| Scoring SynthID immagini | Wrapper di reverse-SynthID esterno | Ricerca interessante, vincoli di licenza e validazione |
| Rimozione nei pixel | Wrapper CtrlRegen o MarkDiffusion DiffusionPurification | Ricerca generativa, non integrazione immediata |
| Benchmark | Soprattutto testo, corpus controllato e strategie | Metodo utile, risultati non trasferibili alle immagini |
| Servizio/agent skill | HTTP, subprocess, filesystem, Docker | Architettura da sostituire con moduli browser |

Il servizio può essere eseguito sulla macchina dell'utente, ma questo non equivale a funzionare dentro una pagina web. Pyodide non renderebbe automaticamente disponibili subprocess, ExifTool, qpdf, FFmpeg nativo o PyTorch/CUDA.

Riferimenti: [dispatch](https://github.com/guillaumemeyer/watermarks-remover/blob/e4d2bd49c4cb84c5fddb50f5361618cfb3b75def/service/scripts/format_dispatch.py), [clean_image.py](https://github.com/guillaumemeyer/watermarks-remover/blob/e4d2bd49c4cb84c5fddb50f5361618cfb3b75def/service/scripts/clean_image.py), [harness MarkDiffusion](https://github.com/guillaumemeyer/watermarks-remover/blob/e4d2bd49c4cb84c5fddb50f5361618cfb3b75def/service/scripts/markdiffusion_harness.py).

**3. Cosa Unmarker possiede già**

La base di partenza è più avanzata di un semplice filtro JPEG:

- Analisi locale dei metadati, preflight, postflight e confronto prima/dopo.
- Copia nel formato originale con rimozione selettiva dei metadati AI, come azione secondaria.
- Worker OpenCV.js/WASM per il logo Gemini: template multiscala nell'angolo basso destro, inversione dell'alpha blend e inpainting Navier–Stokes dei residui.
- Perturbazioni globali: rotazione ±0,5°, zoom 1,01–1,02, rumore gaussiano e JPEG, qualità predefinita 0,85.
- Limite file di 25 MB e limite elaborazione di 40 megapixel.

Non consiglierei quindi di “aggiungere WASM”, template matching, inpainting o verifica prima/dopo come se mancassero. Il valore è migliorare accuratezza, copertura e orchestrazione di ciò che esiste.

Riferimenti locali: [pipeline](/Users/eppedema/Documents/workspace/unmarker.it/src/lib/pipeline.ts:6), [worker Gemini](/Users/eppedema/Documents/workspace/unmarker.it/src/workers/geminiVisible.worker.ts:314), [workflow](/Users/eppedema/Documents/workspace/unmarker.it/src/hooks/useImageWorkflow.ts:312), [download metadati](/Users/eppedema/Documents/workspace/unmarker.it/src/hooks/useImageWorkflow.ts:590).

**4. Priorità: analisi della provenienza più corretta**

Il cambiamento più urgente riguarda il significato dei risultati. Attualmente lo score assegna valori fissi: 96/98 quando rileva C2PA, 78/88 per altri marker, 12 in assenza di segnali. Queste percentuali non sono probabilità calibrate di origine AI.

C2PA può accompagnare fotografie catturate da una fotocamera, contenuti modificati e media generati. Bisogna leggere le asserzioni, per esempio `digitalSourceType`, invece di dedurre “AI” dalla presenza del contenitore. La specifica distingue esplicitamente cattura digitale e media prodotti da algoritmi addestrati. [Specifica C2PA](https://spec.c2pa.org/specifications/specifications/2.4/specs/C2PA_Specification.html).

Proporrei risultati separati:

- credenziali di provenienza presenti;
- origine dichiarata nel manifest: cattura, generazione, modifica, sconosciuta;
- integrità/firma verificata localmente, non verificata o verifica incompleta;
- logo Gemini rilevato, non rilevato o controllo indisponibile;
- metadati selezionati rimossi oppure rimasti;
- trasformazioni sui pixel applicate; efficacia sul watermark invisibile non verificata.

Unmarker già usa in UI una formula prudente equivalente a “elaborato; rimozione non verificata”. Va mantenuta: il problema non è una garanzia esplicita nell'interfaccia, ma il rischio di attribuire allo score prima/dopo un valore che non ha. Lo stato interno `neutralized-unverified` potrebbe diventare `processed-unverified`.

Per leggere C2PA, la libreria attuale da valutare è **`@contentauth/c2pa-web`**, con core WASM e Worker; il vecchio c2pa-js è stato spostato nella repo legacy. Il caricamento può essere separato dal percorso base. [SDK ufficiale](https://github.com/contentauth/c2pa-js/tree/main/packages/c2pa-web).

Il vincolo privacy richiede configurazione esplicita: `remoteManifestFetch: false`, `ocspFetch: false`, trust anchor eventualmente distribuite come risorse locali. Il recupero remoto dei manifest è abilitato per default nell'API consultata. Manifest esterno non recuperabile significa “verifica incompleta”, non “nessuna credenziale”. Le impostazioni sono documentate nel [codice ufficiale](https://github.com/contentauth/c2pa-js/blob/main/packages/c2pa-utilities/src/settings.ts).

In Unmarker, separerei inoltre marker specifici da parole generiche come `prompt`, `workflow`, `parameters`, oggi cercate per substring. Conserverei tutti i marker di un blocco, invece del solo primo, per non perdere indicazioni sul provider.

Punti di intervento: [score](/Users/eppedema/Documents/workspace/unmarker.it/src/lib/aiProvenanceScore.ts:35), [marker](/Users/eppedema/Documents/workspace/unmarker.it/src/lib/metadata/markers.ts:17), [audit](/Users/eppedema/Documents/workspace/unmarker.it/src/lib/imageAudit.ts:98).

**5. Priorità: pulizia senza ricompressione e modalità distinte**

La repo esterna mostra il valore di intervenire direttamente sul contenitore. È spesso sufficiente per eliminare proprietà, XMP o manifest, lasciando intatti i dati compressi dell'immagine.

Unmarker già fa una parte di questo lavoro, ma il flusso principale applica sempre shake, stir e JPEG alle immagini elaborabili. Suggerisco tre operazioni comprensibili:

1. **Pulisci metadati:** copia nello stesso formato, senza ricompressione.
2. **Rimuovi il logo Gemini:** modifica della sola zona interessata, export PNG oppure WebP con encoder appropriato. Per preservare esattamente i pixel fuori dalla patch serve una codifica lossless; JPEG e WebP lossy possono modificarli durante l'export.
3. **Riduci le tracce nei pixel, sperimentale:** perturbazioni con un costo visivo dichiarato.

Assenza di metadati non dimostra assenza di watermark invisibile; scegliere una modalità conservativa serve a limitare modifiche indesiderate, non a certificare che altre operazioni siano inutili.

Distinguerei anche due politiche metadata: rimozione dei segnali di provenienza/generazione e rimozione dei dati personali, come GPS e identificativi. Oggi la pulizia selettiva AI di Unmarker non equivale a cancellare tutti i metadati personali.

“Senza ricompressione” non basta a garantire resa invariata: orientamento EXIF, profili ICC, informazioni colore, alpha e animazione hanno effetti visibili. Bisogna conservare i campi necessari oppure trasformarli con una procedura esplicita. La rimozione dei metadati non elimina watermark incorporati nei pixel.

**Porting concretamente utile:**

- PNG: aggiungere copertura `eXIf`, distinguere proprietà, testo compresso e credenziali; mantenere IDAT e chunk di animazione.
- JPEG: coprire commenti COM e segmenti metadata tra scan; preservare orientamento e profili necessari.
- WebP: aggiornare anche i flag VP8X quando si eliminano EXIF/XMP, mantenendo animazione e trasparenza.
- AVIF/HEIF: gestire box annidati e soprattutto gli item EXIF/XMP e i relativi offset; altrimenti limitare e dichiarare la copertura.
- GIF/BMP: aggiunte ragionevoli per pulizia metadata; TIFF richiede più attenzione a IFD, offset e multipagina.

Per AVIF/HEIF può essere preferibile sostituire certi box rimovibili con box `free` della stessa lunghezza, azzerandone il contenuto, invece di spostare tutto il file. Questo preserva gli offset, ma non risolve automaticamente metadati descritti tramite item: serve un parser consapevole del formato.

Punti di intervento: [PNG](/Users/eppedema/Documents/workspace/unmarker.it/src/lib/metadata/formats/png.ts:24), [JPEG](/Users/eppedema/Documents/workspace/unmarker.it/src/lib/metadata/formats/jpeg.ts:58), [WebP](/Users/eppedema/Documents/workspace/unmarker.it/src/lib/metadata/formats/webp.ts:57), [box container](/Users/eppedema/Documents/workspace/unmarker.it/src/lib/metadata/formats/boxContainer.ts:71).

**6. Cosa non copiare alla lettera**

La repo è utile come riferimento, ma alcuni comportamenti sono inadatti a diventare garanzie di prodotto:

- Il cleaner JPEG esterno, con `strip_all`, può eliminare EXIF/orientamento, ICC APP2 e Adobe APP14; dal primo SOS conserva tutto il resto, compresi eventuali metadati successivi.
- Il cleaner AVIF/HEIC non interpreta integralmente gli item EXIF/XMP descritti da `iinf`/`iloc`/`mdat`.
- Microfixture in memoria hanno evidenziato una coda WAV corta scartata e un figlio `moov` troncato che viene accorciato senza segnalare incompletezza. La tecnica dei box `free` è buona; l'implementazione richiede ulteriori controlli.
- Nel percorso pixel, un backend eseguito con successo può essere riportato come “removed” anche se il detector successivo continua a rilevare il watermark. In Unmarker terrei separati esecuzione del motore e risultato misurato.

Anche Unmarker ha punti da rafforzare: rimozione box che può spostare offset AVIF/HEIF, flag WebP, decompressione del testo PNG senza un budget esplicito. Le fixture sintetiche attuali non provano che ogni file fotografico reale rimanga decodificabile.

Porterei regole, casi di test e struttura del report, con implementazioni TypeScript mirate. Eviterei sia l'importazione integrale sia una sostituzione dei parser esistenti senza confronto.

Riferimenti esterni: [image_meta.py](https://github.com/guillaumemeyer/watermarks-remover/blob/e4d2bd49c4cb84c5fddb50f5361618cfb3b75def/service/scripts/image_meta.py), [av_meta.py](https://github.com/guillaumemeyer/watermarks-remover/blob/e4d2bd49c4cb84c5fddb50f5361618cfb3b75def/service/scripts/av_meta.py).

**7. Prestazioni: prima di aggiungere altri modelli**

L'ispezione comparata suggerisce ottimizzazioni indipendenti dalla repo esterna:

**Ritagliare prima delle conversioni OpenCV.** La ricerca Gemini riguarda al massimo 256 × 256 pixel, ma prima viene costruita l'immagine intera in RGBA, gray e gray32. A 40 MP sono circa **360 MB per questi tre buffer soltanto**, calcolo teorico `(4 + 1 + 4) × 40 milioni`, esclusi Canvas e copie. Trasferire e convertire la sola regione necessaria riduce drasticamente questo costo. Anche l'inpainting dovrebbe ricevere una patch con padding. [Worker](/Users/eppedema/Documents/workspace/unmarker.it/src/workers/geminiVisible.worker.ts:332).

**Riutilizzare anche le scansioni negative.** Il preflight passa al processing solo il rilevamento positivo. Se il logo manca, si ripete la ricerca. Conservare un risultato negativo valido per la stessa immagine elimina lavoro duplicato; un errore o una scansione incompleta restano casi distinti. [Workflow](/Users/eppedema/Documents/workspace/unmarker.it/src/hooks/useImageWorkflow.ts:413).

**Worker per tutta la pipeline.** Shake, noise e Canvas sono ancora sul main thread, con yield cooperativo. OffscreenCanvas, ImageBitmap/Transferable e riuso dei buffer sono il passo naturale, con fallback dove necessario. Il supporto preciso va verificato sui browser target con un prototipo.

**Moduli opzionali indipendenti.** Un errore di caricamento OpenCV non dovrebbe impedire una pulizia metadata che non usa OpenCV. La distinzione della repo esterna fra capacità disponibile, controllo fallito e risultato negativo è utile qui.

WASM aggiuntivo avrebbe senso per codec, FFT o kernel misurati come colli di bottiglia. Per leggere chunk e riscrivere header, TypeScript e `DataView` sono già una scelta appropriata.

**8. SynthID locale: la ricerca più promettente**

`score_synthid.py` non implementa un detector Google: richiama reverse-SynthID, progetto indipendente, con un codebook V4 che il README indica in circa 220 MB.

Ho verificato anche il metodo upstream effettivamente invocato: `detect_from_v4_codebook`. Calcola FFT dei tre canali, confronta la fase su fino a **128 frequenze per canale**, selezionate per consenso, e costruisce uno score. Usa un profilo per modello/risoluzione, con resize quando non c'è corrispondenza esatta. Il percorso non richiede tutta la pipeline di wavelet/denoising/PCA presente nello stesso modulo. [Sorgente pinnato](https://github.com/aloshdenny/reverse-SynthID/blob/b11083676fd3ee3ff97ce9d03c0e409e46905902/src/extraction/robust_extractor.py#L811).

**Inferenza progettuale:** per il solo scoring, una tabella precalcolata di coordinate/fasi/consenso dei bin selezionati potrebbe sostituire i grandi array densi. Si parla teoricamente di pochi KB per profilo, esclusi runtime e memoria FFT. Sarebbe necessario verificare equivalenza numerica, selezione dei profili e calibrazione. Non ho estratto né misurato questa rappresentazione.

Questa pista è più plausibile nel browser di una rigenerazione diffusion completa. La destinazione iniziale sarebbe un **segnale sperimentale di compatibilità con i profili conosciuti**, non una certificazione di presenza/assenza di SynthID. Uno score sigmoidale non diventa una probabilità attendibile senza calibrazione.

Il blocco concreto è la licenza del codice/codebook upstream: la Research License limita l'uso commerciale e impone condizioni sui derivati. Il fatto che il codice giri sul dispositivo dell'utente non elimina queste condizioni. Per un prodotto con sponsorizzazioni non considererei sufficiente l'accesso gratuito: serve una base di licenza adeguata o un'implementazione e un corpus indipendenti. [Licenza verificata al commit usato](https://github.com/aloshdenny/reverse-SynthID/blob/b11083676fd3ee3ff97ce9d03c0e409e46905902/LICENSE).

Un eventuale prototipo deve essere valutato su foto reali negative, generatori/versioni differenti, resize/crop/JPEG e corpus tenuti fuori dallo sviluppo. Ottimizzare la rimozione contro questo singolo scorer rischia di far diminuire il suo score senza ingannare un detector indipendente.

**9. CtrlRegen e MarkDiffusion: fattibilità browser**

CtrlRegen rigenera l'immagine usando controllo semantico e spaziale. Il wrapper usa un backend Stable Diffusion 1.5/ControlNet, risoluzione nativa 512, tiling per immagini maggiori. La documentazione della repo stima circa **10 GB di download modelli**; è una cifra dichiarata upstream, non misurata qui. [Integrazione e requisiti](https://github.com/guillaumemeyer/watermarks-remover/blob/e4d2bd49c4cb84c5fddb50f5361618cfb3b75def/README.md#optional-ctrlregen-pixel-removal), [ricerca originale](https://arxiv.org/abs/2410.05470).

È fattibile studiare una variante WebGPU, ma non basta compilare Python in WASM. Servono esportazione dei modelli, operatori compatibili, scheduling, controllo della memoria, gestione dei tile, eventuale quantizzazione e validazione del deterioramento visivo. Volti, scritte e piccoli dettagli sono casi critici quando si rigenera l'immagine.

MarkDiffusion aggiunge generazione/detection controllata e DiffusionPurification. Il wrapper di purificazione usa Stable Diffusion 2.1, senza il controllo ControlNet della pipeline CtrlRegen. Dichiara correttamente che la detection richiede stessa configurazione, modello e chiavi: non è un detector universale dei file caricati. Lo userei prima come laboratorio di sviluppo, su campioni autorizzati locali. Questo non richiede di mandare i file degli utenti a un server. Il toolkit è Apache-2.0; le licenze dei pesi rimangono separate. [Toolkit ufficiale](https://github.com/THU-BPM/MarkDiffusion).

ONNX Runtime Web offre WASM e WebGPU; la disponibilità degli operatori varia per backend. I modelli grandi incontrano limiti di buffer e memoria, mentre il multithreading WASM richiede isolamento cross-origin. Sono vincoli da verificare sulla pipeline scelta, non una prova che ogni modello diffusion sia impossibile in browser. [Runtime](https://onnxruntime.ai/docs/tutorials/web/), [modelli grandi](https://onnxruntime.ai/docs/tutorials/web/large-models.html), [threading](https://onnxruntime.ai/docs/tutorials/web/env-flags-and-session-options.html).

**Aggiornamento importante sulle licenze:** il commit `b642ae45…` di noai-watermark usato dalla repo non ha una LICENSE, come segnala il suo README. Tuttavia il ramo upstream attuale pubblica una **MIT**: non è corretto affermare che il progetto sia oggi privo di licenza in assoluto. Un'adozione andrebbe valutata sulla revisione con licenza esplicita e sulle licenze separate dei pesi. [MIT attuale verificata](https://github.com/mertizci/noai-watermark/blob/main/LICENSE). La MIT del wrapper watermarks-remover non sostituisce le licenze dei componenti esterni.

Un autoencoder più piccolo o una pipeline distillata potrebbero essere esperimenti successivi, ma non sono funzionalità già pronte offerte da questa repo, né abbiamo misure che ne provino il vantaggio per Unmarker.

**10. Benchmark: la parte metodologica da adottare subito**

Il benchmark più sviluppato della repo è sul testo: corpus controllato, più seed, controlli negativi, margine dalla soglia, qualità e costo. Non ho trovato nel checkout un report equivalente che dimostri un miglioramento della rimozione immagini rispetto a Unmarker. I test delle integrazioni ML usano anche backend finti: verificano contratti, non qualità delle immagini.

Per Unmarker costruirei un corpus locale con tre gruppi separati:

- **Metadata:** PNG/JPEG/WebP/AVIF/HEIF reali, orientamento, ICC, alpha, animazioni, metadati compressi, strutture malformate, box annidati. Misurare ciò che viene rimosso e la conservazione della resa.
- **Logo visibile:** immagini marcate e negative, sfondi testurizzati, più dimensioni e ricompressioni. Misurare falsi positivi/negativi, danno fuori dalla patch e residui.
- **Watermark invisibili:** campioni con generazione e detection controllate per schema, più un insieme indipendente dove disponibile. Misurare detection rate a falso positivo fissato, qualità, tempo, memoria e fallimenti.

Per confrontare varianti: baseline invariata, solo metadata, solo JPEG, pipeline attuale, nuovi preset. Usare seed registrati per le perturbazioni, separare set di sviluppo e valutazione, pubblicare denominatori/esclusioni/errori. PSNR/SSIM aiutano a quantificare il danno; non sostituiscono un detector del watermark o una revisione visiva di testi/volti.

Il principio trasferibile è scegliere la modifica meno distruttiva che soddisfa una misura attendibile. In assenza di detector indipendente, un ciclo “continua finché il nostro score scende” non verifica la rimozione.

Riferimenti: [benchmark testo](https://github.com/guillaumemeyer/watermarks-remover/blob/e4d2bd49c4cb84c5fddb50f5361618cfb3b75def/service/scripts/bench_synthid_text.py), [metodologia](https://github.com/guillaumemeyer/watermarks-remover/blob/e4d2bd49c4cb84c5fddb50f5361618cfb3b75def/docs/synthid-text-benchmark.md).

La pubblicazione scientifica **UnMarker** citata dal nostro README impiega ottimizzazioni avversarie dello spettro. Shake/stir/crush non è una riproduzione di quel metodo; i risultati del paper non validano automaticamente il prodotto. [Paper](https://arxiv.org/abs/2405.08363).

**11. Estensioni possibili del prodotto**

| Estensione | Tecnologia plausibile | Valutazione |
|---|---|---|
| Testo Unicode | TypeScript, segmentazione Unicode, report carattere/azione | Economica, utile, completamente locale |
| Batch immagini | Coda Worker con concorrenza e memoria limitate, download locale | Utile dopo stabilizzazione del motore |
| SVG/HTML/Markdown | Parsing strutturale; nessuna esecuzione di contenuti o fetch incorporati | Possibile, distinguere metadata da contenuto |
| DOCX/XLSX/PPTX/EPUB | ZIP + XML in Worker; pulizia proprietà e media annidati | Buona espansione successiva, non priorità immagini |
| WAV/MP3/FLAC metadata | Parser contenitore, payload audio preservato | Realizzabile senza inferenza |
| MP4/MOV metadata | Parser ISOBMFF con offset stabili e letture a blocchi | Più complesso per file grandi |
| PDF | Parser/riscrittore completo, eventualmente WASM | Non semplice regex; alta complessità |
| Riscrittura statistica testo | LLM locale in WebGPU da progettare separatamente | Fuori dalla prima roadmap |

La pulizia Unicode è interessante perché tratta in modo contestuale joiner, emoji e script. Va però adattata: la repo rimuove anche soft hyphen e caratteri Private Use per default, che possono essere legittimi. Bidi, spazi non separabili e punteggiatura richiedono policy esplicite. Rilevare un carattere insolito non dimostra che un testo sia generato da AI; eliminarlo non rimuove una watermark statistica sul campionamento dei token. [Regole Unicode](https://github.com/guillaumemeyer/watermarks-remover/blob/e4d2bd49c4cb84c5fddb50f5361618cfb3b75def/service/scripts/text_unicode.py).

Per ZIP/documenti servono budget per dimensione decompressa, numero di entry e ricorsione; per PDF servono gestione di oggetti compressi, revisioni incrementali e allegati. Non dichiarare pulito un file con porzioni non ispezionate. [Contenitori](https://github.com/guillaumemeyer/watermarks-remover/blob/e4d2bd49c4cb84c5fddb50f5361618cfb3b75def/service/scripts/container_meta.py).

**12. Architettura proposta e sequenza di lavoro**

Userei un motore browser con moduli separati per riconoscimento formato, ispezione, piano di modifica, trasformazione ed export. Ogni controllo restituisce disponibilità, evidenze, copertura e limiti. Un modulo indisponibile non deve trasformarsi in un risultato negativo.

Tutte le elaborazioni operano su File/Blob/buffer locali. Asset WASM e modelli, se introdotti, vengono distribuiti come file statici versionati e caricati solo quando servono. Download del modello e upload del contenuto sono cose diverse; si può supportare cache/offline senza backend di inferenza. I file dell'utente restano effimeri salvo salvataggio esplicito.

Un test di rete dovrebbe verificare assenza di invio di file, pixel, miniature, prompt, metadati e hash derivati dai contenuti. Il sito attuale ha analytics e servizi sponsor separati: “elaborazione locale” non equivale a “pagina senza alcuna connessione”. L'offline completo richiederebbe anche cache/PWA e gestione indipendente dei servizi accessori.

| Ordine | Intervento | Impegno indicativo, 1 sviluppatore |
|---|---|---|
| 1 | Correggere semantica score/C2PA e stati di verifica | 2–4 giorni senza SDK completo |
| 2 | ROI prima di OpenCV, riuso negativo, isolamento errori opzionali | 3–6 giorni con QA browser |
| 3 | Modalità metadata/logo/pixel; conservazione qualità; primi fix parser | 1–2 settimane |
| 4 | Corpus regressioni e benchmark browser | 1–2 settimane iniziali, poi continuo |
| 5 | C2PA strutturato con SDK e rete disabilitata | 1–2 settimane, secondo copertura richiesta |
| 6 | GIF/BMP, batch o testo Unicode | Incrementi da pianificare dopo le priorità core |
| R&D | Scorer spettrale compatto WASM | 2–4 settimane per un prototipo, dopo licenza/dataset; nessuna promessa di produzione |
| R&D successiva | Rigenerazione WebGPU | Diverse settimane o più, esito prestazionale incerto |

Le stime non sono additive in modo rigido e dipendono dal livello di preservazione richiesto e dai browser target. La raccolta di un corpus indipendente può richiedere più tempo dell'implementazione.

La prima milestone che sceglierei è una versione che analizza meglio, offre pulizia senza ricompressione come percorso evidente e usa meno memoria. Il detector spettrale sarebbe il progetto di ricerca parallelo; un backend diffusion completo non sarebbe il prerequisito per migliorare concretamente Unmarker.

**Appendice: verifiche eseguite**

Repo esterna, pytest 9.1.1 già presente in un runtime locale; bytecode e cache pytest disabilitati:

- 321 passati: clean_text, av_meta, container_meta, epub, ooxml_xlsx_pptx, zip_partial_evidence, truncated_tail_preserved, unscanned_file_accounting, entity_encoded_watermarks, prose_values_not_provenance.
- 94 passati, 1 saltato: security_hardening, svg_security_hardening, binary_guard, truncated_id3v2, pdf_structural_rewrite. Saltato il test PDF end-to-end che richiede veri ExifTool e qpdf; gli altri non ne provano l'integrazione reale.
- 72 passati: clean_image, avif_heic, image_formats_bmp_gif_tiff, ctrlregen_clean, markdiffusion_harness, synthid_score. I backend ML finti verificano passaggio parametri, errori e report.

Unmarker:

```sh
pnpm exec vitest run src/lib/pipeline.test.ts src/lib/geminiShared.test.ts src/lib/geminiWorkerClient.test.ts src/lib/metadataCleaner.test.ts src/lib/imageAudit.test.ts src/lib/aiProvenanceScore.test.ts src/hooks/useUnmarkPipeline.test.tsx
```

7 file, 40 test passati. Non eseguita una campagna browser con immagini reali né inferenza dei modelli esterni. Creato soltanto questo resoconto; nessuna implementazione applicativa o modifica alle dipendenze.
