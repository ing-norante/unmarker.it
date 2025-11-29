export function Header() {
  return (
    <header className="space-y-4">
      <div className="flex items-start justify-between">
        <h1 className="border-foreground border-b-8 pb-2 text-6xl font-black tracking-tighter uppercase">
          Unmarker
          <br />
          It
        </h1>
      </div>
      <p className="border-foreground border-l-4 pl-4 text-xl leading-relaxed font-medium">
        Shake off invisible AI watermarks. <br />
        <span className="bg-yellow-300 px-1 font-bold text-black dark:bg-yellow-400">
          100% client-side.
        </span>
        <br />
        Nothing leaves your browser.
      </p>
    </header>
  );
}
