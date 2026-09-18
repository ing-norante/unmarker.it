# Audit PostHog e consenso — Unmarker.it

17 settembre 2026 · progetto **104940 — Unmarker.it**, PostHog EU.

## Sintesi

Consultati impostazioni del progetto e catalogo eventi tramite la connessione
PostHog dell'app. La CLI configurata non aveva accesso a questo progetto;
il fallback era già autorizzato da Giuseppe. Nessuna impostazione remota
modificata. Il report è una sintesi delle evidenze raccolte: il wizard/ledger
previsto dalla skill non era disponibile, quindi non vengono inventati esiti
o conteggi automatici del wizard.

Il replay è disabilitato nel progetto. Gli eventi recenti comprendono pageview,
Web Vitals, eccezioni, azioni del flusso immagini, impression sponsor e apertura
dell'annuncio. Il catalogo include anche eventi di altri prodotti mai osservati
recentemente: la loro sola presenza non prova che siano raccolti dal sito.

La correzione principale è il consenso preventivo per **statistiche e diagnostica**,
con rifiuto/revoca sia nel browser sia per gli eventi server degli acquisti.
Non occorre presentare selettori per marketing o registrazioni che non usiamo.

## Impostazioni remote rilevate

| Impostazione | Valore rilevato / significato |
| --- | --- |
| `session_recording_opt_in` | `false`: replay disabilitato |
| `session_recording_sample_rate` | `null`: nessun campionamento esplicito; non abilita il replay |
| `session_recording_minimum_duration_milliseconds` | `null` |
| Trigger URL/eventi | Vuoti; feature flag collegato e gruppi trigger assenti |
| Mascheramento e acquisizione payload rete | Configurazioni remote `null`; non significa acquisizione attiva |
| `session_recording_retention_period` | `30d`, solo replay; non è la retention degli eventi |
| `anonymize_ips` | `false`: non qualificare globalmente i dati come anonimi |
| Autocapture / eccezioni | Opt-out/opt-in remoti `null`; il client può specificare un comportamento |
| Web Vitals / performance / console recording | `true`; console recording non implica registrazioni attive con replay disabilitato |
| `cookieless_server_hash_mode` | `0` |

## Verifiche replay

| Controllo | Evidenza e conseguenza |
| --- | --- |
| Durata minima | Non configurata: da scegliere solo prima di un'eventuale attivazione del replay |
| Durata minima rigorosa | Non esplicita nel client; non applicabile alla modalità replay disabilitato |
| Mascheramento | Default input del SDK, nessun mascheramento personalizzato. Nomi file, metadati e anteprima creatività nel DOM richiederebbero protezioni ulteriori prima di abilitare registrazioni |
| Ambiente test/preview | Prima mancava una disabilitazione client esplicita del replay; ora è disabilitato in tutti gli ambienti |
| Campionamento | Non configurato; nessuna ottimizzazione del costo replay attivo da effettuare |
| Trigger selettivi | Non configurati; da progettare se il replay venisse richiesto in futuro |
| Registrazione rete | Nessun filtro specifico prima della modifica. Ora replay/console recording disabilitati; gli URL degli eventi sono privati di query e frammenti |
| SDK nativi | Nessuna integrazione mobile nativa rilevata; il sito mobile usa il client web |

## Implementazione del consenso

- Categoria necessaria sempre attiva; una sola categoria facoltativa PostHog.
- SDK caricato/inizializzato soltanto dopo consenso. Nessun recupero degli eventi
  precedenti e nessun conteggio cookieless dopo rifiuto.
- Replay, autocapture generico, rageclick, heatmap, sondaggi, tour e conversazioni
  disabilitati nel client. Restano eventi espliciti, eccezioni app e Web Vitals.
- Scelta versionata valida sei mesi, riapribile dal footer. X = rifiuto;
  chiusura del dialogo senza salvataggio = nessuna modifica.
- Rifiuto/accettazione con pari stile, fascia senza overlay; dialogo soltanto
  su richiesta. Localizzazioni inglese e cinese semplificato.
- Alla revoca: opt-out, rimozione identificatori del progetto, sincronizzazione
  tra schede, abort delle richieste SDK e delle relative code di retry.
  Ogni nuova accettazione usa un'istanza SDK separata, per non riattivare retry
  del precedente consenso. Il trasporto fetch e il relativo AbortSignal sono
  stati verificati con PostHog JS **1.433.4**: ripetere questo test dopo upgrade SDK.
- Checkout conserva l'attribuzione solo con ricevuta di consenso valida.
  La revoca autenticata rimuove l'attribuzione dagli acquisti di quel browser.
  L'outbox riverifica il consenso prima dell'invio; eventi privi di consenso
  vengono scartati, senza recuperarli a una futura accettazione.
- Revoca e invio server usano lo stesso lock transazionale. Una richiesta già
  trasmessa non si può richiamare; offline la revoca server richiede retry,
  segnalato nell'interfaccia. Non vengono cancellati pagamenti/fatture/campagne.

File principali: `src/components/CookieConsent.tsx`, `src/lib/cookieConsent.ts`,
`src/lib/consentPolicy.ts`, `src/lib/analytics.ts`, `src/lib/sponsorTracking.ts`,
`server/sponsors/http.ts`, `server/sponsors/service.ts`.

## Collaudo e limiti

- Test unitari del consenso: default, rifiuto, scadenza, storage bloccato,
  altre schede, revoca durante import SDK, nuove accettazioni e retry.
- Test dell'osservatore sponsor: visibilità conteggiata solo dopo consenso.
- Test con PostgreSQL isolato: consenso valido/assente/scaduto, revoca dopo
  invio fallito, messaggi fuori ordine, endpoint anonimo e protezione origine.
- Browser Chrome a 1440×900 e 390×844: banner, rifiuto, reload, preferenze,
  consenso e revoca. SDK reale collegato a un ricevitore HTTP locale con chiave
  fittizia, per evitare traffico di test nel progetto reale. Nessuna richiesta
  PostHog prima della scelta o dopo rifiuto; richieste dopo accettazione; retry
  di risposte 503 bloccati dopo revoca; nuova accettazione funzionante.
- Inventario runtime tramite pagina diagnostica locale: dopo consenso, chiavi
  PostHog in localStorage/sessionStorage e nessun cookie analytics; dopo revoca,
  eliminati identificatori e chiavi di sessione. Resta solo il flag globale
  `ph_debug` del SDK in sviluppo, che non identifica il visitatore.
- Il ricevitore locale simula la raccolta e il salvataggio del consenso, non il
  progetto remoto. I controlli API/database sono coperti separatamente dai test
  di integrazione. Gli script di estensione diagnostica remoti non sono provati
  dal solo ricevitore simulato; ripetere il collaudo sul deployment candidato.

Restano da definire la retention effettiva degli eventi, gli accordi/trasferimenti
con i fornitori e le informative definitive. Non è stato eseguito un audit di
ogni trattamento privacy aziendale. Il risultato tecnico non costituisce una
certificazione legale; privacy e cookie policy restano bozze segnalate.

Prima del deployment applicare `pnpm sponsors:db:migrate` al database destinatario.
La migrazione aggiunge `analytics_consent` ai compratori e `analytics_consent_at`
agli acquisti; già applicata al database locale, non ai database Vercel.

## Riferimenti

- [Garante — FAQ cookie](https://www.garanteprivacy.it/faq/cookie)
- [Garante — linee guida](https://www.gpdp.it/home/docweb/-/docweb-display/docweb/9677876)
- [PostHog — JavaScript configuration](https://posthog.com/docs/libraries/js/config)
- [PostHog — privacy del replay](https://posthog.com/docs/session-replay/privacy)

Audit iniziale svolto con la skill `audit-session-replay`; implementazione del
consenso eseguita successivamente su richiesta di Giuseppe.
