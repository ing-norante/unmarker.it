# Sponsor: checklist prima della produzione

## Aggiornamento operativo — 18 settembre 2026

La QA della Preview è stata confermata dall'utente, così come i testi legali
inglesi v1.0.0 con efficacia 18 settembre 2026. Le pagine `/legal/*` esistono
e hanno `noindex, follow`. Il blocco relativo ai testi non ancora pubblicabili
è rimosso dal codice; rimangono l'abilitazione esplicita dei pagamenti live e
la lista dei Paesi consentiti.

L'account Stripe live, prodotto, chiave limitata, IVA, ricevute e webhook sono
stati predisposti: vedere [stato e procedura di attivazione](./sponsor-live-setup.md).
La riconciliazione ogni cinque minuti è definita in `vercel.json` e diventerà
attiva al deployment Production. **Preparazione non significa deployment:**
il webhook e i pagamenti restano disabilitati fino alla pubblicazione coordinata.

Le sezioni sotto conservano la checklist iniziale: le voci su bozze italiane,
assenza delle pagine legali, mancata Preview e assenza del cron descrivono lo
stato del 17 settembre e sono superate dall'aggiornamento sopra. Restano utili
per i controlli fiscali/amministrativi e per le attività future.

## Checklist iniziale — 17 settembre 2026

Documento operativo da completare con il
commercialista e, per i contratti, con il consulente legale di NoMaDe S.r.l.
Non costituisce un'attestazione di conformità fiscale o legale.

## Stato verificato e scelta proposta

Il test in preview con il nuovo account Stripe è stato confermato dall'utente.
Il codice del worktree è stato esaminato; in questa revisione non sono state
ricontrollate le impostazioni live dei pannelli Stripe, Vercel e Neon.

**Decisioni confermate da Giuseppe:** Stripe Payments standard, con NoMaDe S.r.l.
come venditore; acquisti B2B; prezzo imponibile di **500 € più IVA dove dovuta**;
Fatture in Cloud come gestionale. Il worktree implementa raccolta B2B e Stripe Tax in sandbox; la matrice fiscale
per il live deve ancora essere approvata. Sono ammessi aziende e liberi professionisti in Italia,
UE ed extra UE, nei limiti normativi e dei paesi supportati. Cancellazione volontaria
senza rimborso per ripensamento; disservizi con rimborso pro-rata del downtime,
fatti salvi i diritti inderogabili.

Visura, contatti e XML di esempio ricevuti. I dati societari e le bozze sono
raccolti in [docs/legal](./legal/README.md). Il sezionale è `_info`; ultimo numero
comunicato `3_info`, candidato successivo `4_info` da verificare sul gestionale
prima dell'assegnazione. Non è stato emesso alcun documento fiscale.

Per le commissioni Stripe Giuseppe intende usare il processo TD17 già adottato
da NoMaDe; la corretta classificazione dei documenti resta al commercialista.

| Area             | Situazione nel codice                                                                                        |
| ---------------- | ------------------------------------------------------------------------------------------------------------ |
| Acquisto         | Pagamento unico, 500 € imponibili più imposte, 720 ore dal pagamento confermato                              |
| Rinnovo          | Nessun abbonamento o rinnovo automatico                                                                      |
| Managed Payments | Disabilitato esplicitamente nelle Checkout Session                                                           |
| IVA              | Stripe Tax sandbox; caso IT verificato 500 € + 110 € = 610 €; live da configurare                            |
| Fatturazione     | Export amministrativo JSON disponibile; XML/FIC/SdI e registro fatture da completare                         |
| Dati fiscali     | Passaggio B2B con anagrafica, indirizzo, Tax ID, CF italiano e recapiti SdI                                  |
| Documenti legali | Bozze segnalate; tre conferme, timestamp, versione e testo/hash conservati; nuovi acquisti live bloccati     |
| Analytics        | Consenso preventivo browser/server, revoca e preferenze; replay disabilitato                                 |
| Cron             | Endpoint autenticato disponibile; nessuna pianificazione in `vercel.json`                                    |
| Rimborsi         | I parziali mantengono la campagna fino alla scadenza; il totale cumulativo integrale la rimuove              |
| Pausa vendite    | Nuovi acquisti live bloccati da documenti in bozza/paesi non approvati; pausa operativa ancora da aggiungere |

Riferimenti implementativi: `server/sponsors/service.ts`,
`server/sponsors/config.ts`, `server/sponsors/schema.sql`,
`src/lib/analytics.ts`, `src/components/Footer.tsx`, `vercel.json`.
Per la preview: [sponsor-preview.md](./sponsor-preview.md).
Dettagli della nuova integrazione: [checkout B2B e Stripe Tax](./sponsor-billing-checkout.md).
Queste modifiche fiscali non sono ancora distribuite in Preview.

## 1. Managed Payments: che cosa cambierebbe

Con Payments standard NoMaDe vende lo spazio allo sponsor e Stripe elabora
il pagamento. Con Managed Payments Stripe/Link diventa il merchant of record:
gestisce la vendita al cliente e gli adempimenti di imposizione indiretta
coperti dal servizio, oltre a documenti e assistenza transazionale. Rimangono
gli obblighi contabili e fiscali propri della SRL, e le responsabilità escluse
dalla copertura. [Stripe: funzionamento di Managed Payments](https://docs.stripe.com/payments/managed-payments/how-it-works).

L'Italia è supportata, ma l'ammissibilità riguarda anche il prodotto: i servizi
professionali di marketing sono esclusi, mentre alcune prestazioni elettroniche
automatizzate sono ammesse. Per la vendita automatica di questi spazi pubblicitari
non deduciamo l'idoneità dalla sola presenza della guida nel pannello: servirebbe
conferma di Stripe sulla descrizione reale del servizio e sul codice fiscale
del prodotto. [Stripe: requisiti](https://docs.stripe.com/payments/managed-payments/eligibility).

- [x] **Giuseppe:** confermare Payments standard per il lancio.
- [ ] **Sviluppo:** mantenere `managed_payments.enabled = false` e verificare
      questo comportamento anche nel checkout live finale.
- [ ] **Solo se si sceglie Managed Payments:** ottenere conferma di idoneità,
      esaminare contratto/costi e ridefinire con il commercialista il rapporto
      NoMaDe–Stripe, prima di cambiare integrazione e documenti.

La guida di configurazione nello screenshot non prova che Managed Payments sia
attivo, né che ogni sezione debba essere completata per usare Payments standard.

## 2. Decisioni fiscali e commerciali — prima di modificare Checkout

- [x] **Giuseppe:** scegliere vendita B2B per il lancio.
- [x] **Giuseppe:** clienti aziendali e liberi professionisti, Italia/UE/extra UE.
- [ ] **Commercialista + sviluppo:** definire come verificare l'acquisto professionale;
      una semplice casella non trasforma un consumatore in un professionista.
- [x] **Giuseppe:** 500 € significa imponibile, più IVA dove dovuta.
      Esempio puramente numerico con IVA italiana al 22%:
      500 € imponibili → 610 € totali; 500 € totali → 409,84 € imponibili + 90,16 € IVA.
- [ ] **Commercialista:** classificare la prestazione, confermare l'attività
      esercitata dalla società e definire aliquote, territorialità, eventuale OSS,
      natura IVA, bollo e adempimenti sulle operazioni estere.

La fornitura di spazi pubblicitari su siti è inclusa nell'elenco UE dei servizi
elettronici: non presumere che sia sempre un servizio generico soggetto a IVA
italiana. [Regolamento UE 282/2011, allegato I, punto 3(h)](https://eur-lex.europa.eu/legal-content/EN/TXT/PDF/?uri=CELEX%3A02011R0282-20170101).
Le prestazioni B2B UE seguono normalmente il reverse charge; per i servizi
elettronici B2C vanno valutate le regole del paese del cliente e le soglie/eccezioni
applicabili. [Your Europe: IVA transfrontaliera](https://europa.eu/youreurope/business/finance-and-tax/vat/cross-border-vat/index_en.htm).

**Criterio di completamento:** tabella fiscale approvata per ogni combinazione
di paese/tipo cliente ammessa, con esempi di importi da usare nei test.

## 3. Flusso amministrativo per NoMaDe

Flusso proposto con Payments standard:

1. Raccogliere dati legali e fiscali del compratore, distinti dal nome pubblico
   dello sponsor: ragione sociale/nome, indirizzo e paese, email, partita IVA o
   codice fiscale quando necessario; codice destinatario/PEC se disponibili.
2. Alla conferma del pagamento registrare vendita e dati di fatturazione.
   Concordare con il commercialista il momento fiscale e i termini di emissione;
   non usare il successivo bonifico di Stripe come unico segnale per fatturare.
3. Emettere il documento intestato allo sponsor tramite il gestionale della SRL,
   con XML/SdI e conservazione ove richiesti. Una ricevuta o un PDF Stripe non
   dimostrano da soli l'adempimento: l'e-invoicing richiede il formato e la rete
   applicabili. [Stripe: e-invoicing](https://support.stripe.com/questions/what-is-e-invoicing?locale=en-GB).
4. Collegare acquisto, pagamento Stripe, fattura e relativo esito; gestire scarti
   e nuovi tentativi senza emettere due fatture per lo stesso acquisto.
5. Registrare separatamente ricavo, IVA, costi Stripe, rimborsi e movimenti
   bancari. Il payout è il trasferimento del saldo: non è una nuova vendita
   e non si fattura a Stripe il netto ricevuto per questi acquisti standard.
6. In caso di rimborso gestire anche la rettifica fiscale/nota di credito dovuta,
   oltre all'operazione sul pagamento e allo spegnimento della campagna.

La riconciliazione **contabile** collega fatture, pagamenti, commissioni, saldo
Stripe e banca; è distinta dal nostro cron, che ripara gli stati delle campagne.
I report Stripe distinguono lordo, commissioni e netto e permettono di risalire
alle transazioni dei payout automatici. Per payout manuali si usa il report del
saldo. [Stripe: riconciliazione dei payout](https://docs.stripe.com/reports/payout-reconciliation).

- [x] **Giuseppe:** confermare Fatture in Cloud come gestionale.
- [ ] **Commercialista:** approvare un esempio di
      fattura italiana, estera e nota di credito per i mercati abilitati.
- [ ] **Sviluppo/amministrazione:** implementare l'invio al gestionale oppure,
      per il lancio, una procedura manuale con elenco pagamenti da fatturare,
      responsabile, controllo quotidiano, scadenze ed esiti. L'automazione non è
      obbligatoria; la tracciabilità di ogni vendita sì.
- [ ] **Commercialista:** verificare i documenti delle commissioni Stripe.
      Stripe indica fatturazione da SPEL Irlanda dal luglio 2025: valutare reverse
      charge e adempimenti italiani sulla base dei documenti effettivi, senza
      applicare indiscriminatamente la stessa IVA a ogni servizio.
      [Stripe: fatture delle commissioni in Italia](https://support.stripe.com/questions/tax-invoice-and-vat-e-invoice-for-italy-based-businesses).

## 4. Condizioni, recesso e assistenza

- [x] **Sviluppo:** footer responsive con denominazione, sede, P. IVA/CF,
      Registro Imprese, REA, capitale versato e contatti, presenti nell'HTML iniziale.
      Link a condizioni sponsor, privacy, cookie e cancellazioni/rimborsi:
      per ora aprono le bozze italiane su GitHub, con avviso che non sono applicabili.
- [ ] **Prima del lancio:** completare, validare e pubblicare i documenti definitivi
      su pagine del sito, aggiornare i link del footer e rimuovere gli avvisi di bozza.
      Le condizioni B2B usano «Cancellazioni e rimborsi», senza promettere il
      recesso consumer di 14 giorni. Non considerare le bozze informative definitive.
- [ ] **Giuseppe + legale:** pubblicare condizioni di vendita per la sponsorizzazione,
      indicando NoMaDe S.r.l., dati societari obbligatori, sede, P. IVA e contatti.
- [ ] Descrivere pagamento unico, durata dal pagamento, pubblicazione automatica,
      disponibilità, rotazione, assenza di rinnovo e di garanzie su visite/clic/vendite.
      Uguale tempo nominale di rotazione non significa uguale numero di impression.
- [ ] Definire contenuti ammessi, diritti su icona/testi, controlli e rimozioni,
      indisponibilità del servizio, rimborsi e gestione dei reclami. I tre sponsor
      interni non vanno presentati come clienti paganti o testimonianze commerciali.
- [x] **Sviluppo:** mostrare le condizioni e registrare versione, testo/hash,
      timestamp e approvazioni separate (in sandbox con bozze segnalate).
- [ ] Inviare conferma contrattuale conservabile con importi, creatività,
      date e condizioni definitive applicabili.
- [ ] **Giuseppe:** attivare un recapito di assistenza e una procedura per
      acquirenti che hanno perso il cookie/sessione del browser.

### Se in futuro si accettano consumatori — escluso dal lancio B2B

Per i contratti di servizi a distanza è normalmente previsto il recesso entro
14 giorni. L'avvio immediato richiede una richiesta espressa; l'eventuale importo
per il servizio già eseguito va gestito secondo le regole applicabili. Non
considerare la campagna di 30 giorni interamente eseguita al primo clic.
[Your Europe: vendite a distanza](https://europa.eu/youreurope/business/selling-in-eu/selling-goods-services/ecommerce-distance-selling/index_en.htm).

- [ ] **Legale + sviluppo:** approvare informativa, modulo, richiesta di avvio
      anticipato e regole di rimborso. Evitare una rinuncia generica al recesso.
- [ ] Implementare la funzione di recesso online prevista dal nuovo art. 54-bis
      del Codice del consumo: accessibile nel periodo utile, conferma della richiesta
      e avviso su supporto durevole con contenuto, data e ora.
      [D.lgs. 209/2025, art. 1](https://www.gazzettaufficiale.it/atto/serie_generale/caricaArticoloDefault/originario?atto.codiceRedazionale=26G00002&atto.dataPubblicazioneGazzetta=2026-01-08&atto.tipoProvvedimento=DECRETO+LEGISLATIVO).
- [ ] Se il servizio viene aperto ai consumatori, testare il recesso anche con
      campagne avviate, oltre alle regole B2B definite sotto.

### Rimborsi B2B per downtime — necessario già al lancio

- [x] Correggere la sincronizzazione affinché un rimborso parziale non interrompa
      la campagna né ne cambi la scadenza. La regola usa gli importi Stripe e vale
      per tutti i rimborsi parziali; non classifica il motivo del rimborso.
- [ ] Implementare separatamente la cancellazione volontaria della campagna pagata
      senza rimborso e la registrazione amministrativa dei disservizi.
- [ ] Applicare calcolo e nota di credito secondo la
      [specifica fatturazione e rimborsi](./legal/billing-and-refunds.md), con
      intervalli documentati, idempotenza e scadenza originale invariata.

## 5. Privacy e analytics

Audit delle impostazioni e collaudo locale documentati nel
[report PostHog e consenso](../posthog-audit-session-replay-report.md).

- [x] **Sviluppo:** aggiunto al footer «Preferenze cookie», collegato a un
      controllo reale di consenso e revoca per PostHog, anche per gli eventi server.
      Il collegamento alla cookie policy da solo non svolge questa funzione.
      [Garante: modifica delle scelte dal footer](https://www.gpdp.it/home/docweb/-/docweb-display/docweb/9677876).
- [ ] **Giuseppe + consulente privacy:** pubblicare informativa con titolare,
      finalità, basi giuridiche, destinatari, conservazione, trasferimenti e diritti.
- [ ] Descrivere separatamente immagini elaborate localmente, icone sponsor
      caricate sul server, dati d'acquisto e telemetria.
- [ ] **Sviluppo:** verificare cookie, storage, autocapture, replay e payload reali;
      impedire l'invio di dati fiscali, campi del form e credenziali nei tracciamenti.
- [x] Una categoria facoltativa statistiche/diagnostica PostHog, bloccata fino alla
      scelta, con rifiuto e revoca. L'esenzione per analytics richiede condizioni
      precise di aggregazione/minimizzazione: il solo proxy sul nostro dominio
      non basta. [Garante: cookie e analytics](https://www.garanteprivacy.it/faq/cookie).
- [ ] **Giuseppe + consulente:** verificare ruoli e accordi dei fornitori Stripe,
      Vercel, Neon e PostHog, regioni effettive e garanzie sui trasferimenti.
      Non presumere che la regione della preview coincida con quella da adottare
      in produzione; definire anche cancellazione e conservazione fiscale.

**Criterio di completamento:** verifica in un browser senza preferenze salvate,
poi con rifiuto, accettazione e revoca; documenti coerenti con le richieste di rete.

- [ ] Prima di distribuire questa versione: eseguire la migrazione idempotente
      `pnpm sponsors:db:migrate` sul database dell'ambiente destinatario. Aggiunge
      `sponsor_buyers.analytics_consent` e `sponsor_purchases.analytics_consent_at`;
      gli acquisti precedenti senza consenso verificabile non alimentano analytics.
- [ ] Ripetere il collaudo rete/storage su Vercel Preview e aggiornare i link alle
      informative definitive. I link attuali puntano ancora alle bozze già committate.

## 6. Implementazione e infrastruttura live

- [x] Adeguare form, Checkout e verifiche server a dati fiscali e imposte:
      500 € imponibili distinti dal totale, snapshot privati, compatibilità legacy.
- [ ] Approvare la matrice fiscale e i paesi live; configurare Tax e registrazioni
      live. L'approvazione sandbox non autorizza registrazioni fiscali live.
- [ ] Migrare i cinque nuovi campi fiscali su Preview e Production prima del deploy;
      ripetere il collaudo della nuova versione in Preview.
- [ ] Verificare nell'account live `acct_1UGRfqCwozMNRcOx` requisiti pendenti,
      possibilità di incassare/ricevere payout, conto bancario, descrizione del
      servizio, sito Unmarker, assistenza e descrittore riconoscibile sull'estratto conto.
- [ ] Creare prodotto/prezzo **live** coerenti con le decisioni fiscali; gli
      oggetti sandbox non sono riutilizzabili in live.
- [ ] Collegare il database Neon di produzione tramite `SPONSOR_DATABASE_URL`
      o `DATABASE_URL`, verificare isolamento dai test, migrazione, pooling, backup
      e una procedura di ripristino provata.
- [ ] Impostare su Vercel **Production** chiave privata live, prezzo live,
      `STRIPE_WEBHOOK_SECRET`, `SPONSOR_APP_URL` canonico HTTPS e segreti indipendenti
      `SPONSOR_SESSION_SECRET`/`CRON_SECRET`. Nessun segreto con prefisso `VITE_`.
- [ ] Creare il webhook live sull'URL canonico senza redirect, con gli eventi
      documentati nel [piano tecnico](./stripe-sponsorship-plan.md); verificare
      firma, retry e risposta 200 dopo persistenza.
- [ ] Configurare Cron Vercel per la riconciliazione, indicativamente ogni cinque
      minuti, con autenticazione e allarme sugli errori. La pianificazione opera
      sui deployment di produzione. [Vercel Cron](https://vercel.com/docs/cron-jobs).
- [ ] Configurare allarmi per webhook, cron, pagamenti non attivati, fatture
      non emesse/scartate e acquisti che richiedono assistenza.
- [ ] Aggiungere una pausa dei **nuovi acquisti** che conservi operativi webhook,
      riconciliazione e campagne esistenti. Non usare il blocco condiviso
      `SPONSOR_ALLOW_LIVE_PAYMENTS=false` come interruttore operativo dopo il lancio.

**Redis non è un prerequisito:** inventario, lock e rate limiting dell'implementazione
attuale usano PostgreSQL. Aggiungerlo soltanto per un'esigenza concreta misurata.

## 7. Prova finale e apertura delle vendite

- [ ] Ripetere in sandbox il flusso aggiornato con casi fiscali, accettazione,
      email, fattura, pagamento fallito/annullato, webhook duplicato, rimborso e scadenza.
- [ ] Eseguire build, lint e test pertinenti sull'esatta revisione candidata.
- [ ] Pubblicare documenti e configurazione con nuovi acquisti sospesi.
- [ ] Dopo l'approvazione delle sezioni precedenti, abilitare live ed eseguire
      un acquisto reale concordato con Giuseppe, verificando fattura, pubblicazione,
      riconoscibilità dell'addebito ed eventuale rimborso/nota di credito.
- [ ] Verificare il primo payout sul conto della SRL e la quadratura contabile.
- [ ] Aprire le vendite e assegnare un responsabile per gli avvisi operativi.

## 8. Esportazione XML e Fatture in Cloud

Giuseppe preferisce esportare gli XML e controllare personalmente l'invio allo
SdI. L'importazione standard di XML/ZIP in Fatture in Cloud serve allo storico:
non consente l'invio di quei documenti allo SdI. Per un documento inviabile occorre
crearlo nel gestionale, anche tramite API.
[Fatture in Cloud: XML esterni](https://developers.fattureincloud.it/docs/guides/externally-generated-xml/).

La [CLI indicata da Giuseppe](https://github.com/16bitsrl/fattureincloud-cli)
supporta proprio la conversione XML → documento tramite API JSON, con anteprima
`--dry-run`. Quindi il percorso proposto è:

1. Esportazione protetta dei dati dell’acquisto pagato (JSON già disponibile);
   produzione dell’XML/documento FIC da completare.
2. Verifica locale del tracciato e anteprima della conversione nella CLI.
3. Creazione controllata della fattura in Fatture in Cloud, marcata pagata.
4. Revisione di Giuseppe e invio manuale allo SdI.
5. Registrazione del documento/esito per impedire una seconda emissione.

- [x] Sezionale `_info` confermato, ultimo numero fornito `3_info`.
- [ ] Coordinare la numerazione con FIC prima di emettere `4_info` o successivi;
      nessuna sequenza autonoma che ignori le altre emissioni nello stesso sezionale.
- [ ] Verificare un XML di esempio con il commercialista e il `dry-run` della
      versione CLI installata: anagrafiche, IVA/natura, numero/data, pagamento,
      conversione di decimali e arrotondamenti.
- [ ] Proteggere l'esportazione con accesso amministrativo; non pubblicare XML
      contenenti dati fiscali nel catalogo sponsor o in URL pubblici.
- [ ] Definire registro degli export/import e procedura di retry per evitare
      duplicati. L'import non equivale a esito positivo SdI.

## Dati e documenti da raccogliere

Ricevuti da Giuseppe:

- Visura estratta il 1 settembre 2026: anagrafica e capitale verificati.
- Assistenza `help@nomadesrl.it`, PEC `info@pec.nomadesrl.it`. Si propone assistenza anche come recapito privacy.
- XML TD01/RF01/FPR12 della fattura `3_info`; dati del destinatario non copiati
  nelle bozze. Numerazione successiva coordinata con FIC.
- Mercati Italia/UE/extra UE, aziende e professionisti.
- Cancellazione volontaria senza rimborso; downtime con rimborso pro-rata.

Documenti opzionali ancora utili e verifiche del consulente:

- Eventuali condizioni, informativa privacy e cookie policy aziendali esistenti;
  riferimento del consulente privacy/DPO soltanto se già nominato.
- Validazione di trattamento IVA, attività dichiarata, disciplina B2B e clausole
  delle bozze, senza introdurre una rinuncia generale ai rimedi per inadempimento.

Da verificare tecnicamente, senza chiedere a Giuseppe di trascrivere pannelli:

- Funzioni PostHog effettive, retention, replay e mascheramento; richieste di rete
  prima del consenso, dopo rifiuto, accettazione e revoca.
- Regioni e accordi dei fornitori e flussi dei dati di acquisto.
- Banner con azioni chiare di accettazione/rifiuto, preferenze riapribili e
  blocco effettivo degli analytics non necessari prima del consenso; nessuna
  perdita delle funzioni del sito per chi rifiuta.

I documenti per il lancio saranno condizioni di vendita B2B (con disciplina
contrattuale di cancellazioni/rimborsi), privacy e cookie policy. Le tutele B2C
non vanno presentate come disponibili né escluse con una rinuncia generica:
occorre rendere effettiva la vendita professionale dichiarata.

Questo documento prepara il lancio: non attiva pagamenti live, non modifica
impostazioni fiscali e non esegue merge o deploy.
