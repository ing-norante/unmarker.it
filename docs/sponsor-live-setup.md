# Stripe live: preparazione e attivazione

Stato verificato il 18 settembre 2026. Nessun pagamento reale eseguito e nessun
deployment Production effettuato durante questa preparazione.

## Risorse live

| Risorsa              | Configurazione                                                                                                                      |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Account              | Unmarker.it, `acct_1UGRfqCwozMNRcOx`, organizzazione NoMaDe S.r.l.                                                                  |
| Prodotto             | `prod_VHXifvQ2SnUpRd`, Unmarker.it — 30-day sponsorship                                                                             |
| Prezzo               | `price_1UGycgCwozMNRcOxxIHtFS1u`, 500 EUR, pagamento unico, imposte escluse                                                         |
| Categoria fiscale    | Website Advertising, `txcd_10701000`                                                                                                |
| Tax                  | Provider Stripe; sede IT; impostazioni attive                                                                                       |
| Registrazione        | `taxreg_1UGyuCCwozMNRcOx3olTFtoG`, IT standard, attiva; schema `small_seller` in base alla soglia UE confermata dall'amministratore |
| Webhook              | `we_1UGywLCwozMNRcOxH2WLSxSi`, `unmarker-production-sponsors`, disabilitato fino al deployment                                      |
| URL webhook          | `https://www.unmarker.it/api/sponsors?action=webhook`                                                                               |
| Versione API webhook | `2026-08-26.dahlia`, coerente con Stripe SDK 22.6.2                                                                                 |

Usare il dominio `www`: l'apice `unmarker.it` reindirizza e non è l'endpoint
diretto per le consegne Stripe. Nessuna registrazione OSS/IOSS o estera aggiunta.
Stripe Tax registra la posizione fiscale esistente; gli adempimenti societari
restano gestiti dall'amministratore con il commercialista.

Il pannello dell'account mostra **Pagamenti e Payouts attivi**, nessuna attività
di verifica pendente. Le ricevute dei pagamenti riusciti sono state abilitate;
quelle dei rimborsi erano già abilitate. Assistenza: `help@nomadesrl.it`.
Descrittore: `UNMARKER.IT`. Il telefono non viene mostrato sulle ricevute.
Privacy e condizioni puntano alle pagine `/legal/privacy` e
`/legal/sponsorship-terms` del dominio `www`.

## Segreti e permessi

Le chiavi sono state lette dal file locale `.env.production` dell'amministratore
e salvate come **Secret solo in Vercel Production**. Non inserire segreti nel
repository o nei documenti. Il Checkout ospitato non richiede la chiave
pubblicabile nel frontend.

Chiave backend limitata `Unmarker.it Vercel Production API Key`:

- Scrittura: Customers, Tax IDs, Checkout Sessions.
- Lettura: Charges/Refunds, Events, Payment Disputes, Payment Intents, Products,
  Prices, Tax Settings/Registrations.
- Nessun permesso di scrittura su rimborsi, bonifici o gestione webhook.
- La lettura del profilo account non è concessa: verificarne lo stato dal
  pannello Stripe, senza ampliare i permessi dell'applicazione per questo scopo.

Vercel Production contiene i riferimenti account/prezzo, le chiavi Stripe,
`STRIPE_WEBHOOK_SECRET`, `SPONSOR_SESSION_SECRET`, `CRON_SECRET` e
`SPONSOR_APP_URL=https://www.unmarker.it`. I segreti di sessione e cron sono
casuali e distinti da quelli della Preview. Gli eventi acquisto server usano
la stessa chiave progetto PostHog già configurata per il frontend, con endpoint
EU; il consenso continua a essere verificato prima dell'invio.

`SPONSOR_ALLOW_LIVE_PAYMENTS=false` resta impostato durante la preparazione.
Non usarlo come pausa vendite a servizio avviato: blocca anche webhook e
riconciliazione, non soltanto nuovi acquisti.

`SPONSOR_APPROVED_BILLING_COUNTRIES` è configurata, su conferma
dell'amministratore, per i 27 Paesi UE (Italia inclusa), Regno Unito (`GB`),
Svizzera (`CH`), Stati Uniti (`US`) e Canada (`CA`).

## Controlli eseguiti

- Lettura via chiave limitata di prezzo/prodotto, impostazioni e registrazioni
  Tax, eventi e contestazioni riuscita.
- Checkout Session **live** creata con prezzo reale, `mode=payment`,
  `automatic_tax.enabled=true`, `managed_payments.enabled=false`; subito
  scaduta tramite API. Stato finale `expired`, pagamento `unpaid`.
- Questo controllo prova creazione/scadenza e permessi; non sostituisce la
  verifica di un pagamento reale, del calcolo IVA con indirizzo cliente e
  della consegna del webhook dopo il deployment.
- Variabili Vercel Production presenti; nessuna sostituzione delle credenziali
  sandbox della Preview.

Eventi del webhook:

```text
checkout.session.completed
checkout.session.expired
checkout.session.async_payment_succeeded
checkout.session.async_payment_failed
payment_intent.succeeded
charge.refunded
charge.dispute.created
charge.dispute.closed
```

## Sequenza per l'apertura

1. Mantenere `SPONSOR_APPROVED_BILLING_COUNTRIES` con l'elenco ISO dei Paesi
   scelti e già configurati per il lancio. La registrazione fiscale in Stripe non coincide con
   questo elenco: non aggiungere registrazioni estere solo per aprire un Paese.
2. Verificare che il deployment includa il supporto alle chiavi `rk_live_`,
   i documenti approvati e le migrazioni già applicate al database Production.
3. Impostare `SPONSOR_ALLOW_LIVE_PAYMENTS=true` in Production e distribuire il
   codice approvato. Verificare catalogo, form, pagine legali e origine `www`.
4. Abilitare la destinazione webhook sopra e verificare una consegna `2xx`.
5. Verificare il cron Vercel `/api/sponsors?action=reconcile` ogni 5 minuti:
   autorizzazione con `CRON_SECRET`, risposta 200 senza failures.
6. Verificare il flusso pubblico fino al riepilogo del Checkout live, senza
   inserire una carta o confermare un pagamento: controllare prezzo e imposte,
   quindi annullare la sessione dal sito. Verificare la consegna firmata
   `checkout.session.expired`, la risposta `2xx` e il rilascio dello slot.
   Verificare anche una riconciliazione autenticata senza errori.
7. Mantenere i test di pagamento completo, autenticazione, rimborso e dispute
   nella sandbox della Preview. Stripe vieta di testare in live usando dati
   reali dei metodi di pagamento; non fare auto-acquisti da rimborsare, neppure
   per importi simbolici. [Documentazione Stripe sui test](https://docs.stripe.com/testing).
   Alla prima vendita autentica controllare ricevuta, pubblicazione e
   registrazione amministrativa. Il controllo senza addebito non certifica
   l'intero percorso di un pagamento riuscito live.

Il backend verifica un imponibile esatto di 500 EUR e l'assenza di sconti:
un prezzo temporaneo da 1 EUR o un coupon non sono scorciatoie compatibili con
l'integrazione. Non cambiare queste verifiche per simulare pagamenti live.

La conferma contrattuale e la fattura restano gestite manualmente con la
procedura del README e Fatture in Cloud, come concordato. Il progetto non
genera automaticamente fatture fiscali o invii SdI.
