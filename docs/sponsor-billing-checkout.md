# Checkout B2B e Stripe Tax — sandbox

Implementazione del 17 settembre 2026. **Non autorizza il lancio live**.

## Flusso implementato

1. Scheda sponsor: nome pubblico, URL, descrizione, icona.
2. Fatturazione: denominazione/nome professionale, paese, identificativo fiscale
   e tipo, indirizzo, email. Per l'Italia anche codice fiscale, CAP, provincia,
   codice destinatario e PEC facoltativi. Se mancano entrambi i recapiti SdI,
   l'export propone `0000000`; non viene inventato il codice del cliente.
3. Tre conferme separate e non preselezionate: finalità professionale;
   condizioni; approvazione specifica delle clausole 6 e 7. Questa raccolta
   **non certifica** l'efficacia della firma/approvazione ex artt. 1341–1342 c.c.
4. Un Customer Stripe distinto per acquisto conserva l'identità fiscale senza
   sovrascrivere gli acquisti precedenti dello stesso browser. La sessione
   non aggiorna l'indirizzo di fatturazione dal recapito della nuova carta.
5. Stripe Tax calcola le imposte oltre i 500 € imponibili, con prezzo
   `tax_behavior=exclusive` e prodotto `txcd_10701000` (Website Advertising).
   Prima del Checkout si verificano sede italiana, configurazione Tax attiva,
   registrazione IT attiva e codice prodotto. Non usare un'esenzione a zero
   come ripiego per una configurazione mancante.
6. Le partite IVA UE fuori Italia devono risultare `verified` prima di creare
   la sessione di pagamento. `pending` permette di riprovare; una verifica
   fallita richiede correzione/revisione. L'Italia richiede formato/checksum,
   non iscrizione VIES come condizione per una vendita domestica al 22%.
7. La conferma legge i dati canonici Stripe: imponibile, imposta, totale e
   importo incassato devono coincidere. Per l'Italia il test previsto è
   50000 + 11000 = 61000 centesimi. I vecchi acquisti conservano la verifica
   originale a 50000; i rimborsi parziali sono confrontati con il totale incassato.
8. Il database conserva dati di fatturazione, timestamp server delle conferme,
   versione/testo/hash delle condizioni, verifica fiscale e prima fotografia
   del pagamento. Catalogo pubblico e PostHog non ricevono dati fiscali.

I tipi fiscali sono ricavati dalla tabella ufficiale Stripe del 17 settembre
2026. Paesi/tipi non supportati e situazioni particolari richiedono contatto
manuale; non si apre implicitamente la vendita B2C. Extra UE, molti tipi hanno
solo controlli di formato: la raccolta del numero **non prova da sola** lo status
professionale o l'assenza di obblighi fiscali locali. Definire verifiche e paesi
abilitati con il commercialista prima del live.

## Configurazione sandbox effettuata

- Account sandbox: `acct_1UGRgJEO1GBBIQQi`.
- Sede fiscale sandbox: sede NoMaDe a Firenze.
- Registrazione IT standard attiva **solo in sandbox**.
- Prodotto Website Advertising e prezzo `price_1UGRr4EO1GBBIQQijDtIUQo2`
  a 500 EUR con IVA esclusa.
- Nessuna registrazione o modifica di prezzo effettuata nell'account live.

## Migrazione ed export amministrativo

Eseguire `pnpm sponsors:db:migrate` sul database dell'ambiente scelto prima
di distribuire l'API. Aggiunge alle campagne:
`billing_details`, `terms_accepted_at`, `stripe_customer_id`, `billing_snapshot`,
`stripe_price_id`. Le vecchie righe mantengono valori NULL.

```sh
pnpm sponsors:billing:export <purchase-uuid> /percorso/privato/acquisto.json
```

Il comando usa il database e l'account Stripe configurati in `.env`, salva
un file privato (0600) e rifiuta di sovrascrivere un file esistente. L'export
contiene i dati di origine, le condizioni accettate, il pagamento e il totale
aggiornato dei rimborsi. **Non è una fattura XML, non assegna un numero e non
invia nulla a FIC/SdI.** Non salvare export amministrativi nella repository.

Per produrre TD01/TD04 rimangono necessari trattamento IVA/natura/bollo approvati,
coordinamento della numerazione `_info` con FIC, associazione idempotente dei
documenti agli acquisti e verifica degli esiti SdI. `MP08` indica carta; `MP01`
indica contanti e `MP05` bonifico. La ricevuta Stripe non sostituisce la fattura.

## Blocchi prima del live

Il server rifiuta nuovi acquisti live finché `SPONSOR_TERMS_PUBLISHED` è falso.
È intenzionale: la versione attuale è `2026-09-17-draft`, per test. Per il live:

- Pubblicare condizioni/privacy/cookie definitive e aggiornare versione,
  link e testo archiviato in modo coerente; validare approvazioni specifiche.
- Definire i paesi fiscali autorizzati in `SPONSOR_APPROVED_BILLING_COUNTRIES`
  (codici ISO separati da virgola, senza spazi) dopo revisione professionale.
- Configurare Tax e registrazioni nell'account live. La sandbox non li trasferisce.
- Collaudare fattura italiana, UE, extra UE e nota di credito nel gestionale.
- Completare la conferma conservabile da inviare al cliente e la gestione
  operativa di cessazioni volontarie, rimborsi e anomalie fiscali.
- Ripetere acquisto e webhook in Preview dopo questa migrazione.

## Precisazioni sull'analisi esterna

Vendere pubblicità non garantisce l'approvazione Stripe, un MCC o l'assenza di
chargeback. Stripe valuta l'attività e il sito; nessun “90% di protezione” è
quantificabile. Un VIES negativo non trasforma automaticamente ogni soggetto
in consumatore: possono esistere altre prove e casi da esaminare, senza un
fallback automatico “B2C +22%”. Le nature N3.2 (cessioni intracomunitarie) e
N2.1 (territorialità, inclusi servizi art. 7-ter) non sono intercambiabili.

Fonti:
- [Stripe Tax ID e limiti di verifica](https://docs.stripe.com/tax/checkout/tax-ids)
- [Stripe Tax: configurazione](https://docs.stripe.com/tax/set-up)
- [Art. 18, Reg. UE 282/2011](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32011R0282)
- [Stripe: attività vietate/restrizioni](https://stripe.com/legal/restricted-businesses)
- [Specifiche FatturaPA](https://www.fatturapa.gov.it/export/documenti/Specifiche_tecniche_del_formato_FatturaPA_V1.3.1.pdf)

La migrazione è stata applicata al PostgreSQL locale. Riavviare `pnpm sponsors:api`
per caricare il nuovo codice; la Preview richiede ancora migrazione e deploy.

## Verifiche eseguite

- Lint, build con prerender/localizzazione e 168 test generali superati.

- 35 test PostgreSQL: concorrenza, recupero sessioni, verifica IVA UE,
  configurazione fiscale mancante, snapshot privati, legacy e rimborsi.
- Sessione reale nella sandbox creata tramite il servizio: 500 € imponibili,
  110 € IVA italiana, 610 € totali; sessione scaduta volontariamente senza pagamento.
- Modulo di fatturazione collaudato nel browser su una pagina locale temporanea:
  conferme obbligatorie, invio valido con dati fittizi, campi Italia/USA e resa visiva.
  La pagina temporanea è stata rimossa; non effettuava richieste di pagamento.
- Il collaudo browser dell'upload è bloccato dal permesso dell'estensione Chrome
  sui file locali; il flusso completo aggiornato va ancora ripetuto in Preview.

La validazione automatica non attesta l'esistenza dell'impresa italiana,
la correttezza sostanziale dell'anagrafica o l'idoneità fiscale dei paesi esteri.
