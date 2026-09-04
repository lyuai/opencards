const games = [
  { name: "掼蛋", status: "Rules research", detail: "Partnership trick-climbing and level progression" },
  { name: "KARDS", status: "Protocol design", detail: "Replay analysis and tactical coaching" }
];

export default function Home() {
  return (
    <main>
      <header>
        <p className="eyebrow">OpenCards</p>
        <h1>Understand every play.</h1>
        <p className="lede">
          Replay real matches, pause at any decision, compare legal moves, and ask
          an AI coach to explain the tradeoffs with evidence.
        </p>
      </header>
      <section aria-labelledby="games-heading">
        <div className="sectionTitle">
          <h2 id="games-heading">Coaching labs</h2>
          <span>Foundation milestone</span>
        </div>
        <div className="grid">
          {games.map((game) => (
            <article key={game.name}>
              <div><h3>{game.name}</h3><small>{game.status}</small></div>
              <p>{game.detail}</p>
              <button disabled>Open lab soon</button>
            </article>
          ))}
        </div>
      </section>
      <section className="workflow" aria-labelledby="workflow-heading">
        <h2 id="workflow-heading">The coaching loop</h2>
        <ol>
          <li><b>Observe</b><span>Import a replay or permitted video source.</span></li>
          <li><b>Reconstruct</b><span>Validate every action against the game engine.</span></li>
          <li><b>Coach</b><span>Explore alternatives with cited rules and strategy.</span></li>
          <li><b>Correct</b><span>Capture feedback as reviewable evidence.</span></li>
        </ol>
      </section>
    </main>
  );
}
