# Cookie policy e banner Unmarker.it

> BOZZA E SPECIFICA, 17 settembre 2026. Non pubblicabile come descrizione dello
> stato attuale: il controllo del consenso non è ancora implementato. L'inventario
> del browser e le impostazioni remote PostHog vanno verificati prima del rilascio.

## Testo introduttivo proposto

Unmarker.it è gestito da NOMADE - S.R.L., Via Luigi Salvatore Cherubini 10,
50121 Firenze (FI), P. IVA/CF 07505480488; contatto help@nomadesrl.it.

Usiamo strumenti necessari per memorizzare preferenze e gestire gli acquisti.
Con il tuo consenso usiamo PostHog per capire come viene utilizzato il sito e
misurare visualizzazioni e clic degli sponsor. Puoi rifiutare gli analytics
continuando a usare il sito e cambiare scelta in ogni momento dalle preferenze.

## Inventario iniziale dal codice

| Strumento                                        | Scopo                                                                                               | Durata/stato verificato                                                                                             |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `unmarker_sponsor_session`                       | Sessione necessaria all'acquisto e accesso agli ordini dal medesimo browser; valore opaco, HttpOnly | Cookie con durata di 120 giorni, limitato a `/api/sponsors`; verificare rinnovi e durata separata dei record server |
| `theme` in local storage                         | Preferenza di tema                                                                                  | Nessuna scadenza automatica del local storage; rimozione con pulizia del browser                                    |
| Preferenze lingua e suggerimenti                 | Scelta della lingua/interfaccia                                                                     | Verificare nomi e durata delle chiavi effettive nell'inventario finale                                              |
| Flag in session storage per recupero caricamento | Evita cicli di ricaricamento dopo errori di caricamento delle risorse                               | Durata della sessione o rimozione da parte dell'app                                                                 |
| Cookie/local storage PostHog                     | Identificatori e statistiche d'uso                                                                  | Nomi, durate, session replay e ulteriori strumenti DA VERIFICARE con versione SDK e configurazione remota           |
| Preferenza consenso                              | Ricorda accettazione/rifiuto/versione dell'informativa                                              | DA IMPLEMENTARE e includere nell'inventario finale                                                                  |

La pagina di pagamento Stripe è separata: descriverne il rinvio all'informativa
del fornitore e distinguere gli strumenti presenti su Unmarker da quelli usati
su Checkout. Verificare eventuali strumenti aggiunti dall'hosting in produzione.

## Testo breve del banner

**Privacy e statistiche**

Usiamo strumenti necessari al funzionamento del sito. Con il tuo consenso usiamo
PostHog per analizzare l'utilizzo di Unmarker e misurare visualizzazioni e clic
degli sponsor. Puoi rifiutare gli analytics e continuare a usare tutte le funzioni.

Azioni: **Rifiuta analytics**, **Accetta analytics**, **Preferenze**.
Link: **Privacy policy** e **Cookie policy**.

La formulazione va aggiornata se si decide di usare registrazioni di sessione:
non includerle silenziosamente in una descrizione di semplici conteggi.

## Specifica da implementare

- Stato iniziale senza analytics non necessari: non caricare/inizializzare il
  client PostHog finché manca il consenso. Coprire anche captureException,
  autocapture, pageview automatici, replay, identificatori e richieste di configurazione.
- Non inviare retroattivamente gli eventi avvenuti prima dell'accettazione.
- Le tre scelte devono essere accessibili con tastiera e tecnologie assistive;
  rifiuto e accettazione devono essere presentati senza ostacoli o enfasi ingannevoli.
- Gli strumenti strettamente necessari sono spiegati ma non subordinati al
  consenso analytics; chiusura del banner mantiene il rifiuto predefinito.
- Conservare scelta, versione e data, riapribili dal footer. Non chiedere
  nuovamente a ogni pagina o visita; stabilire durata e condizioni di riproposizione
  secondo le indicazioni del Garante, senza cancellare arbitrariamente un rifiuto.
- Revoca: fermare raccolta/replay, rimuovere identificatori non necessari ove
  possibile e sincronizzare la scelta nelle schede aperte. Testare anche una
  revoca durante l'importazione asincrona dell'SDK.
- Collegare la scelta agli eventi server degli acquisti: `analytics_id` viene
  oggi conservato nell'acquisto e usato dall'outbox. Il solo blocco browser non
  basta per la revoca; evitare invii successivi non consentiti e non inventare
  identificatori sostitutivi per aggirare il rifiuto.
- Non inviare dati di fatturazione, contenuti delle immagini, numeri carta o
  campi sensibili in proprietà, URL, errori o registrazioni di sessione.
- Decidere il replay esplicitamente dopo l'audit; proposta iniziale: disabilitato,
  analytics degli eventi necessari alle metriche sponsor soltanto dopo consenso.
- Le metriche analytics descrivono il campione consenziente; fatture e conteggi
  amministrativi dei pagamenti restano nel database per le rispettive finalità.

## Collaudo richiesto

Browser pulito prima della scelta; rifiuto; accettazione; revoca; ricaricamento;
più schede; storage non disponibile; pagamento e webhook dopo rifiuto/revoca.
Verificare rete e storage, non soltanto la comparsa grafica del banner.

Riferimento: [Garante, FAQ cookie e altri strumenti di tracciamento](https://www.garanteprivacy.it/faq/cookie).
