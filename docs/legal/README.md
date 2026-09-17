# Documenti legali e amministrativi Unmarker

Bozze del 17 settembre 2026, non pubblicate. I testi descrivono il servizio da
portare in produzione; non attestano che le modifiche tecniche siano già attive.

## Documenti

- [Condizioni sponsor B2B](./sponsor-terms.it.md): include cancellazioni e downtime.
- [Informativa privacy](./privacy.it.md): bozza da completare con configurazioni
  effettive, retention e accordi dei fornitori.
- [Cookie policy e specifica del banner](./cookies.it.md).
- [Fatturazione e rimborsi: specifica operativa](./billing-and-refunds.md).

## Dati confermati

Fonte societaria: visura del Registro Imprese di Firenze estratta il 1 settembre
2026, fornita dall'utente. Fonte fiscale: XML di esempio, cedente NoMaDe S.r.l.,
regime RF01, fattura `3_info` del 16 settembre 2026. Non sono stati copiati qui
i dati del cliente, dei soci o i documenti integrali.

| Campo                    | Valore                                                                        |
| ------------------------ | ----------------------------------------------------------------------------- |
| Denominazione in visura  | NOMADE - S.R.L.                                                               |
| Nome commerciale usato   | NoMaDe S.r.l.                                                                 |
| Sede                     | Via Luigi Salvatore Cherubini 10, 50121 Firenze (FI), Italia                  |
| P. IVA e codice fiscale  | 07505480488                                                                   |
| Registro Imprese         | Firenze, numero 07505480488                                                   |
| REA                      | FI - 708292                                                                   |
| Capitale sociale         | 100.000,00 €, interamente versato                                             |
| Assistenza               | help@nomadesrl.it                                                             |
| PEC                      | info@pec.nomadesrl.it                                                         |
| Clienti ammessi          | Aziende e liberi professionisti, per finalità professionali                   |
| Mercati richiesti        | Italia, UE, extra UE, nei limiti delle restrizioni applicabili                |
| Prezzo                   | 500 € imponibili per 30 giorni, più IVA ove dovuta                            |
| Sezionale                | `_info`, condiviso con le altre fatture della società che lo usano            |
| Ultimo numero comunicato | `3_info`; successivo candidato `4_info`, da ricontrollare prima di assegnarlo |
| Cancellazione volontaria | Nessun rimborso per semplice ripensamento, fatti salvi i diritti inderogabili |
| Disservizi               | Rimborso proporzionale al downtime della campagna                             |

Per la privacy si propone lo stesso recapito di assistenza, senza inventare un
indirizzo dedicato o un DPO non comunicato.

## Verifiche residue concrete

1. Legale: qualificazione del contratto pubblicitario, cancellazioni B2B, rimedi
   per inadempimento e modalità di eventuale approvazione specifica delle clausole
   ai sensi degli artt. 1341-1342 c.c. Una checkbox generica non va descritta come
   sufficiente per qualsiasi clausola. Nessuna esclusione di dolo/colpa grave.
2. Commercialista: regole IVA per clienti italiani/UE/extra UE e prova della
   qualità professionale. La visura riporta attività immobiliari e programmazione
   informatica (ATECO secondario 62.10.00): confermare se la vendita di spazi
   pubblicitari richiede aggiornamenti dell'attività dichiarata.
3. Privacy: audit delle impostazioni PostHog live, durate di conservazione,
   replay, fornitori, regioni e garanzie per trasferimenti. Nessun valore mancante
   viene presentato come verificato.
4. Sviluppo: B2B/IVA, numerazione coordinata, export amministrativo e cancellazione
   di campagne pagate senza rimborso. La sincronizzazione dei rimborsi parziali
   senza revoca è implementata; calcolo downtime e note di credito restano da fare.
5. Prima della pubblicazione: rimuovere le note redazionali soltanto dopo aver
   risolto i punti, aggiungere data di efficacia e traduzioni coerenti con le
   lingue del checkout. Conservare la versione dei termini accettata dall'acquirente.

## Riferimenti per la revisione

- [Definizioni del Codice del consumo, art. 3](https://www.normattiva.it/uri-res/N2Ls?urn%3Anir%3Astato%3Adecreto.legislativo%3A2005-09-06%3B206~art3-com1-letc=): conta la finalità professionale dell'acquisto.
- [Recesso del consumatore, art. 52](https://www.normattiva.it/uri-res/N2Ls?urn%3Anir%3Astato%3Adecreto.legislativo%3A2005-09-06%3B206%3B~art52%21vig=): non estendere automaticamente il periodo di ripensamento ai contratti B2B.
- [Codice civile, art. 1229](https://www.brocardi.it/codice-civile/libro-quarto/titolo-i/capo-iii/art1229.html): limiti inderogabili agli esoneri di responsabilità.
- [Codice civile, art. 1453](https://www.brocardi.it/codice-civile/libro-quarto/titolo-ii/capo-xiv/sezione-i/art1453.html): rimedi per l'inadempimento, distinti dalla rinuncia volontaria del cliente.
- [Codice civile, art. 1341](https://www.brocardi.it/codice-civile/libro-quarto/titolo-ii/capo-ii/sezione-i/art1341.html): condizioni generali e approvazioni specifiche.
- [Garante: informativa e diritti](https://www.garanteprivacy.it/regolamentoue/diritti-degli-interessati).
- [Garante: cookie](https://www.garanteprivacy.it/faq/cookie).
