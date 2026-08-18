from __future__ import annotations

from dataclasses import dataclass


GROUPS: dict[str, tuple[tuple[str, ...], ...]] = {
    "en": (
        ("important", "relevant", "significant"),
        ("use", "utilize", "employ"),
        ("show", "indicate", "demonstrate"),
        ("clear", "plain", "definite"),
        ("quick", "rapid", "fast"),
        ("small", "minor", "limited"),
        ("large", "substantial", "considerable"),
        ("method", "technique", "procedure"),
        ("result", "outcome", "finding"),
        ("choose", "select", "pick"),
        ("begin", "start", "commence"),
        ("end", "finish", "conclude"),
        ("safe", "secure", "protected"),
        ("keep", "preserve", "retain"),
        ("create", "build", "produce"),
        ("improve", "enhance", "refine"),
        ("reduce", "decrease", "lower"),
        ("however", "nevertheless", "yet"),
        ("therefore", "consequently", "thus"),
        ("system", "service", "platform"),
        ("data", "information", "details"),
        ("user", "customer", "person"),
        ("text", "passage", "content"),
        ("accurate", "precise", "correct"),
        ("simple", "straightforward", "direct"),
        ("complex", "difficult", "intricate"),
        ("check", "verify", "inspect"),
        ("problem", "challenge", "difficulty"),
        ("value", "benefit", "merit"),
        ("process", "procedure", "workflow"),
        ("different", "distinct", "separate"),
        ("common", "frequent", "widespread"),
    ),
    "it": (
        ("importante", "rilevante", "significativo"),
        ("usare", "utilizzare", "impiegare"),
        ("mostra", "indica", "dimostra"),
        ("chiaro", "evidente", "ovvio"),
        ("rapido", "veloce", "celere"),
        ("piccolo", "minore", "limitato"),
        ("grande", "sostanziale", "considerevole"),
        ("metodo", "approccio", "criterio"),
        ("risultato", "esito", "prodotto"),
        ("scegliere", "selezionare", "preferire"),
        ("iniziare", "cominciare", "partire"),
        ("finire", "terminare", "concludere"),
        ("sicuro", "protetto", "affidabile"),
        ("testare", "valutare", "esaminare"),
        ("mantenere", "preservare", "conservare"),
        ("creare", "costruire", "produrre"),
        ("migliorare", "perfezionare", "raffinare"),
        ("ridurre", "diminuire", "abbassare"),
        ("tuttavia", "comunque", "eppure"),
        ("quindi", "pertanto", "dunque"),
        ("sistema", "servizio", "meccanismo"),
        ("dati", "elementi", "valori"),
        ("utente", "cliente", "persona"),
        ("testo", "brano", "contenuto"),
        ("accurato", "preciso", "corretto"),
        ("semplice", "lineare", "essenziale"),
        ("complesso", "difficile", "articolato"),
        ("controllare", "verificare", "ispezionare"),
        ("problema", "quesito", "dilemma"),
        ("valore", "beneficio", "vantaggio"),
        ("processo", "flusso", "percorso"),
        ("diverso", "distinto", "alternativo"),
        ("comune", "frequente", "diffuso"),
    ),
}


@dataclass(frozen=True)
class VariantLexicon:
    groups: dict[str, tuple[tuple[str, ...], ...]]

    @classmethod
    def default(cls) -> "VariantLexicon":
        return cls(GROUPS)

    def alternatives(self, word: str, language: str) -> tuple[str, ...]:
        lowered = word.lower()
        for group in self.groups.get(language, ()):
            if lowered in group:
                return group
        return ()

    def canonical(self, word: str, language: str) -> str:
        alternatives = self.alternatives(word, language)
        return alternatives[0] if alternatives else word.lower()

    def prior(self, word: str, language: str) -> float:
        alternatives = self.alternatives(word, language)
        if not alternatives:
            return 1.0
        rank = alternatives.index(word.lower())
        return (1.0, 0.55, 0.3)[rank]
