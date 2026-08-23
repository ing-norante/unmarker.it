import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type DragEvent,
} from "react";
import { parseAuditCsv, reviewedFileName, serializeAuditCsv } from "./csv";
import { createParallelDiff, type DiffSegment } from "./diff";
import {
  getReviewStatus,
  isRating,
  matchesFilter,
  parseAuditFlag,
  summarizeAudit,
  type AuditRecord,
  type Rating,
  type RatingField,
  type ReviewFilter,
} from "./model";
import {
  createSession,
  fingerprintCsv,
  loadLastSession,
  loadSession,
  saveSession,
  type AuditSession,
} from "./storage";

const FILTERS: { value: ReviewFilter; label: string }[] = [
  { value: "all", label: "Tutti" },
  { value: "open", label: "Da fare" },
  { value: "complete", label: "Valutati" },
  { value: "errors", label: "Con errori" },
];

const MEANING_LABELS = [
  "Significato alterato",
  "Perdita sostanziale",
  "Idea centrale intatta",
  "Quasi equivalente",
  "Equivalente",
];

const FLUENCY_LABELS = [
  "Illeggibile",
  "Molto innaturale",
  "Comprensibile",
  "Scorrevole",
  "Naturale",
];

function wordCount(text: string): number {
  return text.trim() ? text.trim().split(/\s+/u).length : 0;
}

function languageLabel(language: string): string {
  const normalized = language.toLocaleLowerCase();
  if (normalized === "it") return "Italiano";
  if (normalized === "en") return "English";
  return language.toLocaleUpperCase();
}

function statusLabel(row: AuditRecord): string {
  const status = getReviewStatus(row);
  if (status === "complete") return "Valutato";
  if (status === "partial") return "Parziale";
  return "Da fare";
}

function renderDiff(segments: DiffSegment[]) {
  return segments.map((segment, index) => (
    <span className={`diff-${segment.kind}`} key={`${segment.kind}-${index}`}>
      {segment.value}
    </span>
  ));
}

function RatingScale({
  field,
  label,
  value,
  labels,
  shortcut,
  onChange,
}: {
  field: RatingField;
  label: string;
  value: string;
  labels: string[];
  shortcut: string;
  onChange: (value: Rating) => void;
}) {
  const selectedIndex = value ? Number(value) - 1 : -1;

  return (
    <fieldset className="rating-field">
      <legend>
        <span>{label}</span>
        <kbd>{shortcut}</kbd>
      </legend>
      <div className="rating-scale" role="radiogroup" aria-label={label}>
        {(["1", "2", "3", "4", "5"] as Rating[]).map((rating, index) => (
          <button
            aria-checked={value === rating}
            aria-label={`${label}: ${rating}, ${labels[index]}`}
            className={
              value === rating ? "rating-button is-selected" : "rating-button"
            }
            key={rating}
            onClick={() => onChange(rating)}
            role="radio"
            type="button"
          >
            {rating}
          </button>
        ))}
      </div>
      <div className="rating-caption" aria-live="polite">
        <span>1 · {labels[0]}</span>
        <strong>
          {selectedIndex >= 0 ? labels[selectedIndex] : "Nessun voto"}
        </strong>
        <span>5 · {labels[4]}</span>
      </div>
      <input name={field} readOnly type="hidden" value={value} />
    </fieldset>
  );
}

function TextPanel({
  eyebrow,
  text,
  segments,
  accent,
}: {
  eyebrow: string;
  text: string;
  segments: DiffSegment[] | null;
  accent: "source" | "candidate";
}) {
  return (
    <article className={`text-panel text-panel-${accent}`}>
      <header>
        <span className="panel-index" aria-hidden="true">
          {accent === "source" ? "A" : "B"}
        </span>
        <div>
          <p>{eyebrow}</p>
          <span>{wordCount(text)} parole</span>
        </div>
      </header>
      <div className="review-text">
        {segments ? renderDiff(segments) : text}
      </div>
    </article>
  );
}

function EmptyState({
  dragging,
  onBrowse,
  onDrop,
  onDragState,
}: {
  dragging: boolean;
  onBrowse: () => void;
  onDrop: (file: File) => void;
  onDragState: (value: boolean) => void;
}) {
  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    onDragState(false);
    const file = event.dataTransfer.files[0];
    if (file) onDrop(file);
  };

  return (
    <main className="welcome-shell">
      <section className="welcome-copy">
        <p className="section-kicker">Human quality gate / 01</p>
        <h1>
          Leggi. Confronta.
          <br />
          <em>Decidi.</em>
        </h1>
        <p className="welcome-lede">
          Un banco di revisione locale per valutare preservazione del
          significato, fluidità ed errori fattuali senza rompere il blind test.
        </p>
        <ol className="process-line" aria-label="Flusso di revisione">
          <li>
            <span>01</span> Importa il CSV cieco
          </li>
          <li>
            <span>02</span> Valuta con mouse o tastiera
          </li>
          <li>
            <span>03</span> Esporta il foglio completato
          </li>
        </ol>
      </section>

      <section className="intake-card" aria-labelledby="intake-title">
        <div className="intake-stamp" aria-hidden="true">
          LOCAL
          <br />
          ONLY
        </div>
        <p className="section-kicker">Inizia una sessione</p>
        <h2 id="intake-title">Apri il foglio di audit</h2>
        <p>
          Sono accettati <code>manual-audit.csv</code> e{" "}
          <code>human-review.csv</code>. Il file non lascia mai il browser.
        </p>
        <div
          className={dragging ? "drop-zone is-dragging" : "drop-zone"}
          onClick={onBrowse}
          onDragEnter={(event) => {
            event.preventDefault();
            onDragState(true);
          }}
          onDragLeave={(event) => {
            event.preventDefault();
            onDragState(false);
          }}
          onDragOver={(event) => event.preventDefault()}
          onDrop={handleDrop}
          role="button"
          tabIndex={0}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") onBrowse();
          }}
        >
          <span className="drop-arrow" aria-hidden="true">
            ↓
          </span>
          <strong>{dragging ? "Rilascia qui" : "Trascina il CSV"}</strong>
          <span>oppure fai clic per sceglierlo</span>
        </div>
        <div className="privacy-note">
          <span className="privacy-dot" aria-hidden="true" />
          Dati e progressi restano su questo dispositivo
        </div>
      </section>
    </main>
  );
}

export default function App() {
  const [session, setSession] = useState<AuditSession | null>(() =>
    loadLastSession(),
  );
  const [filter, setFilter] = useState<ReviewFilter>("all");
  const [showDiff, setShowDiff] = useState(true);
  const [dragging, setDragging] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [autosaveOk, setAutosaveOk] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const notify = useCallback((text: string) => {
    setMessage(text);
    window.setTimeout(() => setMessage(null), 2600);
  }, []);

  const commitSession = useCallback((nextSession: AuditSession) => {
    setAutosaveOk(saveSession(nextSession));
    setSession(nextSession);
  }, []);

  const importFile = useCallback(
    async (file: File) => {
      setImportError(null);
      try {
        const contents = await file.text();
        const document = parseAuditCsv(contents);
        const identifier = await fingerprintCsv(contents);
        const existing = loadSession(identifier);
        commitSession(
          existing ?? createSession(identifier, file.name, document),
        );
        setFilter("all");
        notify(
          existing
            ? "Sessione locale ripristinata"
            : `${document.rows.length} record caricati`,
        );
      } catch (error) {
        setImportError(
          error instanceof Error
            ? error.message
            : "Impossibile leggere il CSV.",
        );
      } finally {
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    },
    [commitSession, notify],
  );

  const activeRow = useMemo(() => {
    if (!session) return null;
    return (
      session.rows.find((row) => row.review_id === session.activeReviewId) ??
      session.rows[0] ??
      null
    );
  }, [session]);

  const updateActiveRow = useCallback(
    (updates: Record<string, string>) => {
      if (!session || !activeRow) return;
      const timestamp = new Date().toISOString();
      commitSession({
        ...session,
        updatedAt: timestamp,
        rows: session.rows.map((row) =>
          row.review_id === activeRow.review_id ? { ...row, ...updates } : row,
        ),
      });
    },
    [activeRow, commitSession, session],
  );

  const move = useCallback(
    (direction: -1 | 1) => {
      if (!session || !activeRow) return;
      const visible = session.rows.filter((row) => matchesFilter(row, filter));
      if (!visible.length) {
        notify("Nessun record in questo filtro");
        return;
      }

      const visibleIndex = visible.findIndex(
        (row) => row.review_id === activeRow.review_id,
      );
      let target: AuditRecord | undefined;
      if (visibleIndex >= 0) {
        target = visible[visibleIndex + direction];
      } else {
        const currentIndex = session.rows.findIndex(
          (row) => row.review_id === activeRow.review_id,
        );
        const ordered = direction === 1 ? visible : [...visible].reverse();
        target = ordered.find((row) => {
          const index = session.rows.findIndex(
            (candidate) => candidate.review_id === row.review_id,
          );
          return direction === 1 ? index > currentIndex : index < currentIndex;
        });
      }

      if (!target) {
        notify(
          direction === 1 ? "Hai raggiunto la fine" : "Sei al primo record",
        );
        return;
      }
      commitSession({
        ...session,
        activeReviewId: target.review_id,
        updatedAt: new Date().toISOString(),
      });
    },
    [activeRow, commitSession, filter, notify, session],
  );

  const setRating = useCallback(
    (field: RatingField, value: Rating) => updateActiveRow({ [field]: value }),
    [updateActiveRow],
  );

  const setFlag = useCallback(
    (hasError: boolean) =>
      updateActiveRow({ factual_or_polarity_error: String(hasError) }),
    [updateActiveRow],
  );

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!activeRow) return;
      const target = event.target as HTMLElement | null;
      const isTyping =
        target?.tagName === "TEXTAREA" ||
        target?.tagName === "INPUT" ||
        target?.isContentEditable;

      if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
        event.preventDefault();
        if (getReviewStatus(activeRow) === "complete") move(1);
        else notify("Completa i tre controlli prima di avanzare");
        return;
      }
      if (isTyping) return;

      const digit = event.code.match(/^Digit([1-5])$/u)?.[1] as
        Rating | undefined;
      if (digit && !event.metaKey && !event.ctrlKey && !event.shiftKey) {
        event.preventDefault();
        setRating(
          event.altKey ? "fluency_1_to_5" : "meaning_preservation_1_to_5",
          digit,
        );
        return;
      }
      if (!event.metaKey && !event.ctrlKey && !event.altKey) {
        if (event.key.toLocaleLowerCase() === "e") {
          event.preventDefault();
          setFlag(true);
        } else if (event.key.toLocaleLowerCase() === "c") {
          event.preventDefault();
          setFlag(false);
        } else if (event.key === "ArrowLeft") {
          event.preventDefault();
          move(-1);
        } else if (event.key === "ArrowRight") {
          event.preventDefault();
          move(1);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeRow, move, notify, setFlag, setRating]);

  const summary = useMemo(() => summarizeAudit(session?.rows ?? []), [session]);
  const visibleRows = useMemo(
    () => session?.rows.filter((row) => matchesFilter(row, filter)) ?? [],
    [filter, session],
  );
  const sourceText =
    activeRow && session ? activeRow[session.sourceColumn] : "";
  const parallelDiff = useMemo(
    () =>
      activeRow && showDiff
        ? createParallelDiff(sourceText, activeRow.candidate_text)
        : null,
    [activeRow, showDiff, sourceText],
  );

  const exportCsv = () => {
    if (!session) return;
    const blob = new Blob([serializeAuditCsv(session)], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = reviewedFileName(session.fileName);
    link.click();
    URL.revokeObjectURL(url);
    notify(
      summary.complete === summary.total
        ? "Audit completo esportato"
        : "Bozza CSV esportata",
    );
  };

  const openFilePicker = () => fileInputRef.current?.click();
  const progress = summary.total ? (summary.complete / summary.total) * 100 : 0;
  const activeNumber = activeRow
    ? (session?.rows.findIndex(
        (row) => row.review_id === activeRow.review_id,
      ) ?? -1) + 1
    : 0;
  const activeFlag = activeRow
    ? parseAuditFlag(activeRow.factual_or_polarity_error)
    : "unset";

  return (
    <div className="app-frame">
      <input
        accept=".csv,text/csv"
        className="visually-hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void importFile(file);
        }}
        ref={fileInputRef}
        type="file"
      />

      <header className="brand-bar">
        <a
          className="wordmark"
          href="https://www.unmarker.it"
          rel="noreferrer"
          target="_blank"
        >
          <span className="wordmark-block" aria-hidden="true" />
          <span>unmarker.it</span>
        </a>
        <p>
          Review desk <span>/</span> blinded evaluation
        </p>
        {session && (
          <div
            className="autosave-state"
            title={
              autosaveOk ? "Salvato nel browser" : "Salvataggio non disponibile"
            }
          >
            <span className={autosaveOk ? "save-light is-on" : "save-light"} />
            {autosaveOk ? "Autosave locale" : "Autosave non disponibile"}
          </div>
        )}
      </header>

      {!session || !activeRow ? (
        <EmptyState
          dragging={dragging}
          onBrowse={openFilePicker}
          onDragState={setDragging}
          onDrop={(file) => void importFile(file)}
        />
      ) : (
        <main className="audit-shell">
          <header className="audit-toolbar">
            <div className="file-heading">
              <p className="section-kicker">Sessione attiva</p>
              <h1>{session.fileName}</h1>
            </div>
            <div
              aria-label={`${summary.complete} record completati su ${summary.total}`}
              className="progress-block"
              style={{ "--progress": `${progress}%` } as CSSProperties}
            >
              <div className="progress-copy">
                <span>Avanzamento</span>
                <strong>
                  {summary.complete}
                  <i>/</i>
                  {summary.total}
                </strong>
              </div>
              <div className="progress-track">
                <span />
              </div>
            </div>
            <div className="toolbar-actions">
              <button
                className="button-quiet"
                onClick={openFilePicker}
                type="button"
              >
                Cambia CSV
              </button>
              <button
                className="button-export"
                onClick={exportCsv}
                type="button"
              >
                <span>Esporta CSV</span>
                <span aria-hidden="true">↗</span>
              </button>
            </div>
          </header>

          <div className="audit-workspace">
            <aside className="record-rail" aria-label="Record dell’audit">
              <div
                className="filter-tabs"
                role="group"
                aria-label="Filtra record"
              >
                {FILTERS.map((item) => (
                  <button
                    className={filter === item.value ? "is-active" : ""}
                    key={item.value}
                    onClick={() => setFilter(item.value)}
                    type="button"
                  >
                    {item.label}
                  </button>
                ))}
              </div>
              <div className="record-count">{visibleRows.length} record</div>
              <nav className="record-list">
                {visibleRows.map((row) => {
                  const status = getReviewStatus(row);
                  const index = session.rows.findIndex(
                    (candidate) => candidate.review_id === row.review_id,
                  );
                  return (
                    <button
                      aria-current={
                        row.review_id === activeRow.review_id
                          ? "true"
                          : undefined
                      }
                      className={
                        row.review_id === activeRow.review_id
                          ? "record-item is-current"
                          : "record-item"
                      }
                      key={row.review_id}
                      onClick={() =>
                        commitSession({
                          ...session,
                          activeReviewId: row.review_id,
                          updatedAt: new Date().toISOString(),
                        })
                      }
                      type="button"
                    >
                      <span
                        className={`status-mark status-${status}`}
                        aria-label={statusLabel(row)}
                      />
                      <strong>{String(index + 1).padStart(2, "0")}</strong>
                      <span>{row.language.toLocaleUpperCase()}</span>
                      <small>
                        {row.meaning_preservation_1_to_5 || "–"} ·{" "}
                        {row.fluency_1_to_5 || "–"}
                      </small>
                    </button>
                  );
                })}
                {!visibleRows.length && (
                  <p className="empty-filter">
                    Nessun record corrisponde al filtro.
                  </p>
                )}
              </nav>
              <div className="rail-summary">
                <span>
                  <i className="summary-dot dot-empty" /> {summary.empty} da
                  fare
                </span>
                <span>
                  <i className="summary-dot dot-partial" /> {summary.partial}{" "}
                  parziali
                </span>
                <span>
                  <i className="summary-dot dot-error" /> {summary.errors}{" "}
                  errori
                </span>
              </div>
            </aside>

            <section className="comparison-stage">
              <header className="record-heading">
                <div>
                  <p className="section-kicker">
                    Record {String(activeNumber).padStart(2, "0")} /{" "}
                    {String(summary.total).padStart(2, "0")}
                  </p>
                  <h2>{activeRow.review_id}</h2>
                </div>
                <div className="record-meta">
                  <span>{languageLabel(activeRow.language)}</span>
                  <button
                    aria-pressed={showDiff}
                    className={showDiff ? "diff-toggle is-on" : "diff-toggle"}
                    onClick={() => setShowDiff((value) => !value)}
                    type="button"
                  >
                    <span aria-hidden="true" /> Evidenzia differenze
                  </button>
                </div>
              </header>

              <div className="text-grid">
                <TextPanel
                  accent="source"
                  eyebrow="Testo sorgente"
                  segments={parallelDiff?.source ?? null}
                  text={sourceText}
                />
                <TextPanel
                  accent="candidate"
                  eyebrow="Riscrittura candidata"
                  segments={parallelDiff?.candidate ?? null}
                  text={activeRow.candidate_text}
                />
              </div>
            </section>

            <aside
              className="score-desk"
              aria-label="Valutazione del record corrente"
            >
              <div className="score-heading">
                <p className="section-kicker">Scheda di giudizio</p>
                <span
                  className={`score-status score-status-${getReviewStatus(activeRow)}`}
                >
                  {statusLabel(activeRow)}
                </span>
              </div>

              <RatingScale
                field="meaning_preservation_1_to_5"
                label="Preservazione del significato"
                labels={MEANING_LABELS}
                onChange={(value) =>
                  setRating("meaning_preservation_1_to_5", value)
                }
                shortcut="1–5"
                value={
                  isRating(activeRow.meaning_preservation_1_to_5)
                    ? activeRow.meaning_preservation_1_to_5
                    : ""
                }
              />

              <RatingScale
                field="fluency_1_to_5"
                label="Fluidità"
                labels={FLUENCY_LABELS}
                onChange={(value) => setRating("fluency_1_to_5", value)}
                shortcut="⌥ 1–5"
                value={
                  isRating(activeRow.fluency_1_to_5)
                    ? activeRow.fluency_1_to_5
                    : ""
                }
              />

              <fieldset className="error-field">
                <legend>
                  <span>Errore fattuale o di polarità?</span>
                  <small>
                    Fatto aggiunto/alterato, negazione invertita o affermazione
                    contraddetta.
                  </small>
                </legend>
                <div className="binary-choice">
                  <button
                    aria-pressed={activeFlag === "correct"}
                    className={
                      activeFlag === "correct"
                        ? "choice-correct is-selected"
                        : "choice-correct"
                    }
                    onClick={() => setFlag(false)}
                    type="button"
                  >
                    <kbd>C</kbd>
                    <span>
                      <strong>No</strong>
                      <small>Contenuto corretto</small>
                    </span>
                  </button>
                  <button
                    aria-pressed={activeFlag === "error"}
                    className={
                      activeFlag === "error"
                        ? "choice-error is-selected"
                        : "choice-error"
                    }
                    onClick={() => setFlag(true)}
                    type="button"
                  >
                    <kbd>E</kbd>
                    <span>
                      <strong>Sì</strong>
                      <small>Errore materiale</small>
                    </span>
                  </button>
                </div>
              </fieldset>

              <label className="notes-field">
                <span>
                  Note <small>facoltative</small>
                </span>
                <textarea
                  onChange={(event) =>
                    updateActiveRow({ notes: event.target.value })
                  }
                  placeholder="Annota omissioni, fatti alterati o passaggi dubbi…"
                  rows={4}
                  value={activeRow.notes}
                />
              </label>

              <div className="score-actions">
                <button
                  aria-label="Record precedente"
                  className="nav-arrow"
                  onClick={() => move(-1)}
                  type="button"
                >
                  ←
                </button>
                <button
                  className="button-next"
                  onClick={() => {
                    if (getReviewStatus(activeRow) === "complete") move(1);
                    else notify("Completa i tre controlli prima di avanzare");
                  }}
                  type="button"
                >
                  Salva e continua <span aria-hidden="true">→</span>
                </button>
              </div>
            </aside>
          </div>

          <footer className="shortcut-bar" aria-label="Scorciatoie da tastiera">
            <span>
              <kbd>1–5</kbd> Significato
            </span>
            <span>
              <kbd>⌥ 1–5</kbd> Fluidità
            </span>
            <span>
              <kbd>C / E</kbd> Corretto / errore
            </span>
            <span>
              <kbd>← →</kbd> Naviga
            </span>
            <span>
              <kbd>⌘ ↵</kbd> Continua
            </span>
          </footer>
        </main>
      )}

      {importError && (
        <div className="error-banner" role="alert">
          <div>
            <strong>CSV non valido</strong>
            <span>{importError}</span>
          </div>
          <button
            aria-label="Chiudi errore"
            onClick={() => setImportError(null)}
            type="button"
          >
            ×
          </button>
        </div>
      )}
      {message && (
        <div className="toast" role="status">
          {message}
        </div>
      )}
    </div>
  );
}
