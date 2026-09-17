# Fatturazione e rimborsi: decisioni e modifiche necessarie

Specifiche del 17 settembre 2026; nessuna fattura creata, importata o inviata.

## Anagrafica ed export

Il cedente è NOMADE - S.R.L. / NoMaDe S.r.l., P. IVA e CF 07505480488,
Via Luigi Salvatore Cherubini 10, 50121 Firenze (FI), Italia. Il campione XML
usa FPR12, TD01, EUR e RF01. Confermare il regime fiscale con il commercialista.

Il campione usa `Numero=3_info` e data 2026-09-16. Il sezionale richiesto è `_info`;
il prossimo candidato è `4_info`, non assegnato in questa attività. Non ricavare
il numero fattura dal nome file o dal ProgressivoInvio: sono identificatori distinti.

La numerazione è condivisa: ricontrollare l'ultimo numero in FIC prima
dell'assegnazione, coordinare emissioni manuali/CLI, memorizzare l'associazione
acquisto-numero e non riemettere dopo un retry. Gestire anno e sezionale
esplicitamente. Non affidarsi al semplice `max + 1` di un database Unmarker
che non conosce le fatture emesse altrove.

Percorso concordato: export amministrativo → anteprima/import con
`fattureincloud-cli` → verifica umana → invio SdI da FIC. La CLI ricrea il
documento tramite API; l'import XML standard di FIC non consente l'invio allo SdI.

Campi da ricostruire per ogni acquisto, senza copiarli dal campione:

- Cliente, indirizzo, paese, identificativo fiscale/professionale, recapito fattura,
  codice destinatario/PEC applicabili. Il codice destinatario nel campione
  appartiene al destinatario di quella fattura: non è una costante di NoMaDe.
- Data e numero corretti, descrizione e intervallo della sponsorizzazione,
  importi, imposta/natura e riferimenti del pagamento.
- Pagamento già eseguito: il campione riporta MP01 e una scadenza futura;
  non copiarli per un acquisto Stripe con carta. Per carte il tracciato prevede
  MP08; verificare anche la mappatura dello stato pagato nel gestionale.
- Progressivo trasmissione e identificatori univoci secondo il processo
  di esportazione/invio scelto; nessun riuso indiscriminato del valore `0` del campione.

[Specifiche FatturaPA](https://www.fatturapa.gov.it/export/documenti/Specifiche_tecniche_del_formato_FatturaPA_V1.3.1.pdf),
[FIC: XML esterni](https://developers.fattureincloud.it/docs/guides/externally-generated-xml/),
[CLI](https://github.com/16bitsrl/fattureincloud-cli).

## IVA: matrice da validare

| Acquirente           | Impostazione di lavoro                                  | Verifica prima del live                                                                  |
| -------------------- | ------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Italia, B2B          | 500 € + IVA ordinaria 22% = 610 €, ove applicabile      | Eventuali regimi/territori/eccezioni e dati fiscali                                      |
| UE fuori Italia, B2B | Normalmente territorialità del cliente e reverse charge | Status, identificativo IVA/VIES e requisiti applicabili; fallback a revisione se incerti |
| Extra UE, B2B        | Normalmente fuori campo IVA italiana per territorialità | Prova della qualità professionale, territorio effettivo, eventuali obblighi locali       |

Non classificare come B2B qualsiasi visitatore che spunta una casella. Per estero
non imporre il formato della P. IVA italiana; in caso di verifica non riuscita
non assegnare automaticamente né esenzione né IVA italiana senza regola approvata.
La correzione della fattura dopo l'incasso non sostituisce un totale corretto
e trasparente prima del pagamento.

Confermare natura XML, diciture, bollo e adempimenti esteri con il commercialista.
Le fatture delle commissioni Stripe sono un flusso separato: Giuseppe usa TD17,
da applicare ai documenti effettivi con il trattamento fiscale appropriato.

## Rimborsi e cancellazioni

Tre casi distinti da rappresentare nel sistema:

1. **Checkout non pagato:** annullamento senza rimborso, rilascio della prenotazione
   dopo conferma Stripe, come nel flusso attuale.
2. **Campagna pagata, cancellazione volontaria:** rimozione su richiesta verificata,
   nessun rimborso per ripensamento; pagamento e documenti restano registrati.
   Non classificare la richiesta come downtime né come pagamento fallito.
3. **Disservizio:** rimborso economico del periodo di mancata pubblicazione;
   se la campagna riprende, mantenerla attiva sino alla scadenza originale.

Proposta operativa per il pro-rata: intervalli UTC di downtime verificati,
intersecati con inizio/fine della campagna e uniti per evitare sovrapposizioni.
Base imponibile rimborsabile = 500 × secondi di downtime / 2.592.000.
Includere le frazioni di giorno; arrotondare alla fine, non ogni ora.
Applicare le rettifiche IVA della vendita originaria, sottrarre rimborsi già
riconosciuti per gli stessi intervalli e non superare il corrispettivo pagato.

Esempio: 72 ore di downtime su 720 → 50 € imponibili. Con IVA 22% originariamente
applicata: rimborso complessivo 61 € e corrispondente nota di credito. Per una
vendita senza IVA addebitata non aggiungere IVA al rimborso.

**Modifica bloccante prima del live:** attualmente `syncSponsorPurchase` revoca
la campagna per qualsiasi importo rimborsato. Occorre distinguere la compensazione
parziale per downtime da rimborso integrale, risoluzione e contestazione.
Persistenza del motivo, importo, intervalli e identificativo Stripe con idempotenza;
webhook e riconciliazione devono convergere alla stessa decisione, anche se il
rimborso parte dal pannello Stripe. I casi non classificabili richiedono revisione,
senza inventare il motivo in base al solo importo.

L'export per le note di credito deve riferirsi alla fattura originaria e mantenere
la sequenza concordata con FIC. Nessun secondo addebito per una fattura già pagata.

## Verifiche tecniche da aggiungere

- Totale 610 € per il caso italiano approvato; casi esteri coerenti con la matrice.
- I controlli attuali `unit_amount` e `amount_total` a 50000 centesimi vanno
  separati in imponibile, imposta e totale verificati lato server.
- Export e re-export idempotenti; import ripetuto non crea una seconda fattura.
- Numerazione condivisa con un'emissione manuale concorrente in FIC.
- Rimborso downtime parziale lascia attiva la campagna; ripetizione del webhook
  non rimborsa due volte e non cambia la scadenza.
- Intervalli sovrapposti, frazioni di giorno, cambio ora legale, campagne già
  scadute e rimborsi precedenti.
- Cancellazione pagata senza rimborso rimane rimossa dopo riconciliazione.
- Accesso amministrativo agli XML: nessun dato fiscale nel catalogo pubblico,
  nei log o negli eventi PostHog.
