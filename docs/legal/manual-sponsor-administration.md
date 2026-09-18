# Conferme e cessazioni manuali

Le operazioni amministrative usano le credenziali del database indicate in `.env`.
Verificare sempre se si tratta di locale, Preview o produzione. I comandi non
inviano email, non emettono fatture e non richiedono rimborsi Stripe.

## Conferma acquisto

1. Dopo la notifica di pagamento riuscito, trovare il riferimento acquisto:
   nella Checkout Session Stripe è `client_reference_id` e nei metadati è
   `unmarker_purchase_id`. Verificare che il pagamento sia effettivamente riuscito.
2. Assicurarsi che webhook o riconciliazione abbiano registrato il pagamento.
3. Generare una cartella privata nuova, ad esempio:

   ```sh
   pnpm sponsors:confirmation UUID_ACQUISTO .sponsor-data/conferma-UUID_ACQUISTO it
   ```

   Usare `en` per il testo della mail in inglese. I termini allegati restano
   esattamente nella lingua e nella versione accettate all'acquisto.

4. Aprire `email.txt`: controllare ambiente TEST/LIVE, stato del pagamento,
   destinatario, campagna, importi e date (in UTC, indicato esplicitamente).
   Se sono intervenuti rimborso, cessazione o contestazione, aggiornare il testo
   della mail per rappresentare anche questi fatti. Il totale è il pagamento
   originario; non è un riepilogo aggiornato dei rimborsi.
5. Da Aruba, comporre una mail **da help@nomadesrl.it** al destinatario indicato.
   Copiare solo l'oggetto e il corpo, non le righe di controllo ambiente/stato.
   Allegare `condizioni-accettate.txt`. Il file è conservabile e contiene il testo
   originale; non sostituirlo con un link alla pagina corrente, che potrà cambiare.
   Il comando verifica l'hash del testo salvato nell'ordine.
6. Inviare senza ritardo dopo la conferma del pagamento. Conservare la mail inviata
   con allegato nel fascicolo dell'ordine; registrare data e riferimento della mail
   per evitare invii duplicati. Eliminare copie locali di lavoro non necessarie.
   La fatturazione segue separatamente il normale processo FIC.

Il comando legge solo il database e prepara file con permessi privati, nella
cartella `.sponsor-data` esclusa da Git. Non modifica l'ordine né assegna numeri
di fattura. Rifiuta un ordine senza pagamento confermato, evidenze incoerenti o
una directory già esistente. L'invio manuale è una procedura da eseguire realmente:
la sola generazione del file non equivale a una conferma inviata.

## Cessazione su richiesta del cliente (art. 6)

Prima verificare che la richiesta provenga dal cliente o da un referente
autorizzato. Conservare la richiesta e assegnarle un riferimento interno breve,
senza copiare il corpo della mail nel database.

```sh
# Anteprima in sola lettura: verificare sponsor, ordine, date e ambiente.
pnpm sponsors:stop UUID_ACQUISTO

# Applicazione sull'ambiente test configurato in .env.
pnpm sponsors:stop UUID_ACQUISTO --operator "Giuseppe" --reference "mail-20260918-001" --apply
```

In produzione occorre aggiungere **`--live`**, oltre a selezionare prima le
credenziali corrette. Il comando rifiuta un'applicazione con modalità incoerente.
Le credenziali amministrative restano esclusivamente sul server/computer
dell'amministratore: nessun nuovo endpoint pubblico consente di fermare campagne.

L'operazione:

- registra data di cessazione, operatore e riferimento della richiesta;
- rimuove lo sponsor dal catalogo e libera lo spazio;
- impedisce la riattivazione tramite webhook, polling dello stato o riconciliazione,
  anche dopo un rimborso parziale o una disputa vinta;
- lascia invariati date originarie, pagamento ed evidenze fiscali;
- non emette automaticamente rimborsi, note di credito o comunicazioni;
- è idempotente: ripeterla non cambia data e riferimento originari;
- rifiuta ordini non pagati e campagne già scadute, salvo una cessazione già registrata.

La sincronizzazione continua a registrare rimborsi/dispute come fatti finanziari
distinti dalla pubblicazione. I browser già aperti recepiscono la rimozione al
successivo aggiornamento riuscito del catalogo (normalmente ogni 15 secondi);
non si possono revocare copie già scaricate o pagine offline.

Rispondere poi al cliente confermando data della cessazione e disciplina applicabile
al caso. Non usare la cessazione volontaria per negare rimborsi dovuti per disservizi.
Non è prevista riattivazione automatica; una nuova campagna richiede un nuovo acquisto.

## Deploy della modifica

Eseguire `pnpm sponsors:db:migrate` sul database corretto **prima** di distribuire
la nuova API. La migrazione aggiunge tre colonne nullable ed è compatibile con la
versione precedente del codice. Non modifica le campagne esistenti.
La migrazione è stata applicata solo al PostgreSQL locale durante lo sviluppo.
