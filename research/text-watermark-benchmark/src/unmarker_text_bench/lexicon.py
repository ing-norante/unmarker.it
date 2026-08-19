from __future__ import annotations

from dataclasses import dataclass


GROUPS: dict[str, tuple[tuple[str, ...], ...]] = {
    "en": (
        ("important", "relevant", "significant", "notable"),
        ("use", "utilize", "employ", "apply"),
        ("show", "indicate", "demonstrate", "reveal"),
        ("clear", "plain", "definite", "explicit"),
        ("quick", "rapid", "fast", "swift"),
        ("small", "minor", "limited", "modest"),
        ("large", "substantial", "considerable", "extensive"),
        ("method", "technique", "procedure", "strategy"),
        ("result", "outcome", "finding", "conclusion"),
        ("choose", "select", "pick", "opt"),
        ("begin", "start", "commence", "initiate"),
        ("end", "finish", "conclude", "complete"),
        ("safe", "secure", "protected", "guarded"),
        ("keep", "preserve", "retain", "maintain"),
        ("create", "build", "produce", "generate"),
        ("improve", "enhance", "refine", "optimize"),
        ("reduce", "decrease", "lower", "minimize"),
        ("however", "nevertheless", "yet", "nonetheless"),
        ("therefore", "consequently", "thus", "accordingly"),
        ("system", "service", "platform", "framework"),
        ("data", "information", "details", "evidence"),
        ("user", "customer", "person", "client"),
        ("text", "passage", "content", "material"),
        ("accurate", "precise", "correct", "exact"),
        ("simple", "straightforward", "direct", "uncomplicated"),
        ("complex", "difficult", "intricate", "elaborate"),
        ("check", "verify", "inspect", "review"),
        ("problem", "challenge", "difficulty", "issue"),
        ("value", "benefit", "merit", "advantage"),
        ("process", "operation", "workflow", "sequence"),
        ("different", "distinct", "separate", "varied"),
        ("common", "frequent", "widespread", "typical"),
    ),
    "it": (
        ("importante", "rilevante", "significativo", "notevole"),
        ("usare", "utilizzare", "impiegare", "adoperare"),
        ("mostra", "indica", "dimostra", "evidenzia"),
        ("chiaro", "evidente", "ovvio", "esplicito"),
        ("rapido", "veloce", "celere", "immediato"),
        ("piccolo", "minore", "limitato", "modesto"),
        ("grande", "sostanziale", "considerevole", "ampio"),
        ("metodo", "approccio", "criterio", "procedura"),
        ("risultato", "esito", "prodotto", "conclusione"),
        ("scegliere", "selezionare", "preferire", "adottare"),
        ("iniziare", "cominciare", "partire", "avviare"),
        ("finire", "terminare", "concludere", "completare"),
        ("sicuro", "protetto", "affidabile", "garantito"),
        ("testare", "valutare", "esaminare", "collaudare"),
        ("mantenere", "preservare", "conservare", "trattenere"),
        ("creare", "costruire", "produrre", "generare"),
        ("migliorare", "perfezionare", "raffinare", "ottimizzare"),
        ("ridurre", "diminuire", "abbassare", "minimizzare"),
        ("tuttavia", "comunque", "eppure", "nondimeno"),
        ("quindi", "pertanto", "dunque", "perciò"),
        ("sistema", "servizio", "meccanismo", "piattaforma"),
        ("dati", "elementi", "valori", "informazioni"),
        ("utente", "cliente", "persona", "fruitore"),
        ("testo", "brano", "contenuto", "materiale"),
        ("accurato", "preciso", "corretto", "esatto"),
        ("semplice", "lineare", "essenziale", "diretto"),
        ("complesso", "difficile", "articolato", "elaborato"),
        ("controllare", "verificare", "ispezionare", "rivedere"),
        ("problema", "quesito", "dilemma", "difficoltà"),
        ("valore", "beneficio", "vantaggio", "utilità"),
        ("processo", "flusso", "percorso", "iter"),
        ("diverso", "distinto", "alternativo", "differente"),
        ("comune", "frequente", "diffuso", "usuale"),
    ),
}


@dataclass(frozen=True)
class VariantLexicon:
    groups: dict[str, tuple[tuple[str, ...], ...]]

    @classmethod
    def default(cls) -> "VariantLexicon":
        return cls(GROUPS)

    def alternatives(self, word: str, language: str) -> tuple[str, ...]:
        """Return the complete semantic class used only for canonicalization."""
        lowered = word.lower()
        for group in self.groups.get(language, ()):
            if lowered in group:
                return group
        return ()

    def embedding_alternatives(self, word: str, language: str) -> tuple[str, ...]:
        """Candidate set reserved for the controlled watermark embedder.

        The first two variants are never emitted by the controlled rewriter. This
        removes the previous construction where embedder and attacker selected
        from exactly the same candidate set.
        """
        alternatives = self.alternatives(word, language)
        return alternatives[:2] if len(alternatives) >= 4 else ()

    def rewrite_alternatives(self, word: str, language: str) -> tuple[str, ...]:
        """Candidate set reserved for rewrite pipelines and disjoint from embedder output."""
        alternatives = self.alternatives(word, language)
        return alternatives[2:] if len(alternatives) >= 4 else ()

    def candidate_overlap(self, language: str) -> set[str]:
        embedding = {
            candidate
            for group in self.groups.get(language, ())
            for candidate in group[:2]
        }
        rewriting = {
            candidate
            for group in self.groups.get(language, ())
            for candidate in group[2:]
        }
        return embedding & rewriting

    def canonical(self, word: str, language: str) -> str:
        alternatives = self.alternatives(word, language)
        return alternatives[0] if alternatives else word.lower()

    def prior(self, word: str, language: str) -> float:
        alternatives = self.alternatives(word, language)
        if not alternatives:
            return 1.0
        rank = alternatives.index(word.lower())
        return 0.55**rank
