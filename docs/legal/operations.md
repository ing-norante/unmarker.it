# Pubblicazione v1.0.0 e gestione minima

Data confermata dal titolare: **18 settembre 2026**. Le condizioni commerciali
sono approvate dal titolare. Questo registro interno non è una pagina pubblica.

## Confini della verifica

- Durata dal pagamento, 720 ore, 500 EUR più imposte, B2B, nessun rinnovo,
  accettazioni distinte e rimborso parziale senza disattivazione sono implementati.
- Ricevuta allegata del 17 settembre: esempio Stripe da 19,99 EUR con descrizione
  generica. Non dimostra una conferma completa di acquisto sponsor. Contiene ancora
  un telefono personale e un recapito diverso da help@nomadesrl.it: aggiornare i
  dettagli pubblici Stripe prima del lancio, verificando la ricevuta di un vero
  checkout sandbox. Nessun dato personale del PDF è copiato nel repository.
- Art. 4: inviare, anche manualmente, conferma con riferimento, campagna, importi,
  inizio/fine e copia delle condizioni accettate (snapshot dell'ordine). La ricevuta
  Stripe può accompagnarla. Il backend non invia ancora questa conferma.
  `pnpm sponsors:confirmation` prepara testo e termini accettati per l'invio manuale.
- Art. 6: la richiesta arriva via email. `pnpm sponsors:stop` registra una cessazione
  persistente, indipendente dallo stato Stripe, che sopravvive a riconciliazione e
  webhook. Seguire la [procedura amministrativa](./manual-sponsor-administration.md).
  Migrare prima il database dell'ambiente su cui si distribuisce la nuova API.
- FIC, numerazione `_info`, note di credito e calcolo downtime restano manuali per
  scelta del titolare; non sono richiesti nuovi automatismi per pubblicare le pagine.
- `SPONSOR_TERMS_PUBLISHED` resta false fino a verifica della pubblicazione effettiva
  e chiusura dei punti operativi sopra. La versione accettata è v1.0.0; il testo/hash
  sono conservati per ordine. Nessuna modifica alle credenziali o alle abilitazioni live.

## Conservazione: attività dell'amministratore

La tabella privacy è una politica operativa, **non un job di cancellazione già
installato**. Non sono stati eliminati ordini, clienti Stripe o dati PostHog.

- Ogni mese: esaminare ordini chiusi senza pagamento e materiali scaduti, eliminare
  quelli prossimi al termine di 90 giorni. Verificare Stripe prima di cancellare
  un ordine; escludere pagamenti, dispute e casi da riconciliare. Considerare anche
  copie locali, export e clienti Stripe non più necessari, nel rispetto dei vincoli
  del fornitore. Non cancellare alla cieca record con riferimenti fiscali.
- Ogni mese: eliminare corrispondenza ordinaria chiusa da 12 mesi anche da cestino
  e copie gestite direttamente. Conservare separatamente prove fiscali/contrattuali.
- Conservare fatture e prove essenziali per 10 anni, con eccezioni documentate per
  accertamenti/contenziosi. Per i materiali pubblicitari, distinguere copia operativa
  e prove effettivamente necessarie del contratto: evitare duplicati indefiniti.
- PostHog: Free confermato dal titolare. Il progetto 104940 ha replay disabilitato;
  il connettore non espone `event_retention_months`/`events_retention_enforced`.
  Prima del lancio verificare l'effettiva applicazione della retention. La finestra
  di 12 mesi non è una prova di cancellazione; ripetere almeno annualmente la verifica
  e gestire dati eccedenti con gli strumenti/supporto del fornitore. Non simulare un
  limite più breve con il filtro temporale di una dashboard. Non attivare un piano
  paid (retention diversa) senza riesaminare informativa e necessità.
- Registrare finestre effettive di log e backup Vercel/Neon/Aruba. La privacy usa
  criteri per i log infrastrutturali e non inventa una durata unica non verificata.
- Le richieste privacy sono gestite dall'amministratore via help@nomadesrl.it su
  Aruba. Verificare l'identità in modo proporzionato, rispondere di regola entro
  un mese e documentare eventuali proroghe/obblighi di conservazione. La revoca
  analytics non equivale a richiesta di cancellazione retroattiva.

## Accordi e versioni

Il titolare ha confermato i fornitori. Conservare privatamente gli accordi effettivi,
le eventuali nomine e le garanzie sui trasferimenti. Per PostHog il testo pubblico
del DPA non è da solo un accordo sottoscritto: usare la copia conclusa nell'account.
Nessuna firma o conclusione di accordi è stata effettuata dall'agente.

Le pagine `/legal/*` sono HTML statico, senza SDK analytics, con `noindex, follow`
nel documento e negli header Vercel. Non sono bloccate nel robots.txt. Le condizioni
restano in un unico Markdown inglese: la pagina rimborsi estrae le clausole 6 e 7
e il backend salva quel medesimo testo. Le versioni italiane restano nell'archivio
interno del repository. Al prossimo aggiornamento conservare la versione precedente
e cambiare versione dei termini; non azzerare i rifiuti cookie per modifiche editoriali.

## Fonti

- [PostHog: retention](https://posthog.com/docs/data/events-retention)
- [PostHog: cancellazione](https://posthog.com/docs/privacy/data-storage)
- [PostHog: DPA](https://posthog.com/dpa)
- [GDPR](https://eur-lex.europa.eu/legal-content/IT/TXT/?uri=CELEX:32016R0679)
- [Codice civile, art. 2220](https://www.normattiva.it/uri-res/N2Ls?urn:nir:stato:regio.decreto:1942-03-16;262~art2220!vig=)
