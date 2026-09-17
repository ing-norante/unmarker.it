# Cookie policy e preferenze Unmarker.it

> Versione v1.0.0 · Efficace dal 16 settembre 2026.

## Titolare e finalità

Unmarker.it è gestito da NOMADE - S.R.L., Via Luigi Salvatore Cherubini 10,
50121 Firenze (FI), P. IVA/CF 07505480488; contatto help@nomadesrl.it.

Usiamo strumenti necessari per memorizzare preferenze e gestire gli acquisti.
Con il consenso usiamo PostHog per statistiche di utilizzo e diagnostica:
visite, completamento del flusso immagini, visualizzazioni e clic sponsor,
conversioni di acquisto, errori dell'app e prestazioni del browser. I dati sono
pseudonimi, non anonimi. Non carichiamo le immagini elaborate con lo strumento.
L'icona pubblica caricata per una campagna sponsor è un trattamento separato.

## Due categorie

- **Necessari, sempre attivi:** preferenze richieste e sessione sicura degli
  acquisti. Non servono a fare statistiche e non dipendono dal relativo consenso.
- **Statistiche e diagnostica — PostHog, facoltative:** tutte le misurazioni sopra
  indicate richiedono consenso, anche quelle inviate dal server per gli acquisti.
  Nessuna categoria marketing, profilazione pubblicitaria o session replay è
  utilizzata sul sito.

## Inventario

| Strumento                                                                           | Scopo                                                                                                | Durata                                                                                                            |
| ----------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `unmarker_sponsor_session`, cookie HttpOnly, SameSite=Lax, percorso `/api/sponsors` | Sessione d'acquisto e accesso agli ordini dal medesimo browser; non viene creata scegliendo i cookie | 120 giorni; durata dei record server distinta                                                                     |
| `unmarker.locale.preference`, localStorage                                          | Lingua scelta                                                                                        | Fino a cancellazione del browser                                                                                  |
| `unmarker.localeSuggestion.zh-Hans`, localStorage                                   | Ricorda la risposta al suggerimento lingua                                                           | Fino a cancellazione del browser                                                                                  |
| `chunk-reload:*`, sessionStorage                                                    | Evita ricaricamenti ripetuti dopo un errore di caricamento                                           | Sessione della scheda o rimozione dopo caricamento riuscito                                                       |
| `unmarker_consent`, localStorage                                                    | Scelta, data, versione dell'informativa e scadenza; nessun identificatore personale aggiuntivo       | Scelta valida sei mesi; eventuale record scaduto viene sostituito alla nuova scelta                               |
| `ph_<chiave-progetto>*`, localStorage e dati di sessione SDK                        | Identificatori pseudonimi, sessione e proprietà degli analytics consentiti                           | Nessuna scadenza nativa di localStorage; cancellati alla revoca o quando l'app rileva il consenso scaduto/assente |
| `__ph_opt_in_out_<chiave-progetto>`, localStorage                                   | Stato tecnico opt-in dell'SDK dopo accettazione                                                      | Rimosso insieme agli identificatori alla revoca; la scelta necessaria resta in `unmarker_consent`                 |

L’SDK è configurato per localStorage, senza cookie analytics condivisi
tra sottodomini. La revoca tenta anche la rimozione dei cookie PostHog precedenti
per questo progetto sul dominio corrente e sui domini superiori applicabili.
Gli archivi locali non vengono cancellati automaticamente mentre il sito è chiuso:
la scadenza del consenso viene verificata al successivo accesso e nelle schede aperte.

Stripe Checkout è una pagina separata, che può usare strumenti necessari al
pagamento e alla prevenzione delle frodi, descritti nell'[informativa Stripe](https://stripe.com/it/privacy).
Le preferenze di Unmarker.it regolano gli analytics del nostro sito e non
sostituiscono le informazioni rese da Stripe per i propri trattamenti.

## Scelta, modifica e revoca

Il banner propone **Rifiuta analytics**, **Accetta analytics** e **Preferenze**,
senza oscurare o bloccare il sito. Accettazione e rifiuto hanno pari evidenza;
la X equivale al rifiuto. Scorrere o continuare a navigare non vale come consenso.
La categoria facoltativa è inizialmente disattivata.

Il pulsante **Preferenze cookie** nel footer permette in ogni momento di
modificare la scelta o revocare con **Rifiuta analytics**. Chiudere le preferenze
senza salvare non modifica la scelta. Il rifiuto non limita le funzioni del sito.

La scelta è ricordata per sei mesi in quel browser, quando lo storage è
accessibile. Potrà essere richiesta nuovamente dopo la scadenza, se il browser
non conserva più la preferenza o in presenza di cambiamenti sostanziali delle
finalità. Una revisione editoriale non deve azzerare i rifiuti.

Prima dell'accettazione PostHog non viene inizializzato e gli eventi precedenti
non vengono recuperati. Dopo la revoca si interrompono raccolta e invii del
browser, inclusi i tentativi di reinvio in coda; gli identificatori locali
vengono rimossi e la scelta si propaga alle altre schede dello stesso sito.

Per chi ha acquistato dal medesimo browser, la revoca aggiorna anche il server,
che rimuove l'associazione analytics dagli acquisti e scarta gli eventi ancora
in attesa. Se manca la connessione, il blocco locale è immediato e compare un
avviso per completare la sincronizzazione; si riprova al ritorno online o con
il pulsante dedicato. La revoca dal browser non può fermare un invio server
prima che il server riceva la richiesta, né richiamare dati già trasmessi.

La revoca non cancella dati già raccolti lecitamente o documenti amministrativi.
Per esercitare gli altri diritti si può contattare il titolare. Cancellare la
sessione d'acquisto o cambiare dispositivo può richiedere assistenza per ritrovare
un ordine: non viene eseguito un collegamento tra dispositivi per aggirare il rifiuto.

## Analytics e conservazione

L'audit del progetto PostHog Unmarker.it rileva session replay disabilitato;
l'app lo disabilita anche esplicitamente, insieme ad autocapture dei clic,
rageclick, heatmap, sondaggi, tour e conversazioni. Restano gli eventi applicativi
espliciti, errori tecnici e Web Vitals, tutti subordinati al consenso.
I parametri e i frammenti degli URL di navigazione vengono rimossi dagli eventi.

Usiamo PostHog Cloud EU con piano Free, per cui il fornitore prevede una finestra
analytics di 12 mesi. L'applicazione della retention al progetto e la cancellazione
dei dati richiedono verifica: il solo limite del piano non garantisce la
cancellazione automatica. NoMaDe riesamina almeno annualmente i dati non più
necessari e ne gestisce la cancellazione con gli strumenti del fornitore.
La conservazione degli eventi è distinta dai sei mesi della scelta nel browser.
Le [informazioni su destinatari, trasferimenti e conservazione](/legal/privacy)
sono contenute nell'informativa privacy.

Le statistiche sponsor e del flusso immagini descrivono il solo campione che ha
acconsentito. I dati amministrativi dei pagamenti conservano finalità e basi
giuridiche distinte dal consenso agli analytics.

Riferimenti: [Garante, FAQ cookie](https://www.garanteprivacy.it/faq/cookie) e
[linee guida del 10 giugno 2021](https://www.gpdp.it/home/docweb/-/docweb-display/docweb/9677876).
