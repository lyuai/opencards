"use client";

import { useMemo, useState } from "react";

type CoachResult = { recommendation: string; rationale: string; alternatives: string[]; assumptions: string[]; confidence: number; citationIds: string[]; provider: string };
type Card = { id: string; rank: string; suit: string; red?: boolean; joker?: boolean };
type LegalPlay = { label: string; cards: string[] };
type Turn = { player: string; cards?: Card[]; note?: string };

const hand: Card[] = [
  { id: "3s", rank: "3", suit: "♠" }, { id: "3h", rank: "3", suit: "♥", red: true },
  { id: "7s", rank: "7", suit: "♠" }, { id: "7h", rank: "7", suit: "♥", red: true },
  { id: "7d", rank: "7", suit: "♦", red: true }, { id: "9c", rank: "9", suit: "♣" },
  { id: "9d", rank: "9", suit: "♦", red: true }, { id: "as", rank: "A", suit: "♠" },
  { id: "bj", rank: "JOKER", suit: "★", joker: true },
];
const plays: LegalPlay[] = [
  { label: "Play pair 3s", cards: ["3s", "3h"] },
  { label: "Play pair 9s", cards: ["9c", "9d"] },
  { label: "Play triple 7s", cards: ["7s", "7h", "7d"] },
  { label: "Play full house 777+99", cards: ["7s", "7h", "7d", "9c", "9d"] },
  { label: "Play single A", cards: ["as"] },
  { label: "Play black joker", cards: ["bj"] },
];
const playHistory: Turn[] = [
  { player: "West", cards: [{ id: "w4s", rank: "4", suit: "♠" }, { id: "w4h", rank: "4", suit: "♥", red: true }] },
  { player: "Partner", cards: [{ id: "p6c", rank: "6", suit: "♣" }, { id: "p6d", rank: "6", suit: "♦", red: true }], note: "Won trick" },
  { player: "East" },
  { player: "You" },
];
const sample = {
  game: "guandan", ruleset: "competition-draft-2026-09",
  position: "Our team is level 2. I lead with 9 cards. My partner has 3 cards; opponents have 8 and 12. Known hand: 3♠ 3♥ 7♠ 7♥ 7♦ 9♣ 9♦ A♠ BJ. Last trick: West played 4♠ 4♥, Partner played 6♣ 6♦ and won, East passed, I passed.",
  legalActions: plays.map((play) => play.label), playerGoal: "Help my partner finish first without wasting control cards.",
};

export function CoachLab() {
  const [selected, setSelected] = useState<string[]>(plays[0].cards);
  const [result, setResult] = useState<CoachResult | null>(null);
  const [recommendationID, setRecommendationID] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [feedbackState, setFeedbackState] = useState("");
  const api = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080";
  const selectedPlay = useMemo(() => plays.find((play) => sameCards(play.cards, selected)), [selected]);

  async function analyse() {
    setLoading(true); setError(""); setFeedbackState("");
    try {
      const response = await fetch(`${api}/v1/coach`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...sample, position: `${sample.position} I am currently considering: ${selectedPlay?.label ?? "a non-canonical card selection"}.` }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Analysis failed");
      setResult(body.result); setRecommendationID(body.id);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Analysis failed"); }
    finally { setLoading(false); }
  }

  async function correct() {
    if (!feedback.trim()) return;
    const response = await fetch(`${api}/v1/feedback`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ recommendationId: recommendationID, verdict: "incorrect", comment: feedback, suggestedAction: selectedPlay?.label ?? "" }) });
    setFeedbackState(response.ok ? "Saved for review." : "Could not save feedback.");
  }

  return <main>
    <header><b>OpenCards</b><span>掼蛋 · Level 2 · Hand 6 · You lead</span></header>
    <div className="workspace">
      <section className="gameArea" aria-label="Guandan card table">
        <div className="table">
          <Player className="north" seat="Partner" count={3}/><Player className="west" seat="West" count={8}/>
          <div className="tableCenter"><b>Your turn</b><span>Select a legal play</span></div>
          <Player className="east" seat="East" count={12}/><Player className="south" seat="You" count={9}/>
        </div>
        <section className="history" aria-label="Cards played in the previous trick">
          <div className="historyTitle"><b>Previous trick</b><span>Partner won · You lead</span></div>
          <div className="turns">{playHistory.map((turn) => <div className="turn" key={turn.player}>
            <span className="turnPlayer">{turn.player}</span>
            {turn.cards ? <div className="playedCards">{turn.cards.map((card) => <span className={card.red ? "red" : ""} key={card.id}>{card.rank}{card.suit}</span>)}</div> : <i>Pass</i>}
            {turn.note && <small>{turn.note}</small>}
          </div>)}</div>
        </section>
        <div className="hand" aria-label="Your hand">{hand.map((card) => <button key={card.id} type="button" aria-pressed={selected.includes(card.id)} aria-label={`${card.rank} ${card.suit}`} className={`playingCard ${card.red ? "red" : ""} ${card.joker ? "joker" : ""}`} onClick={() => setSelected((current) => current.includes(card.id) ? current.filter((item) => item !== card.id) : [...current, card.id])}><span>{card.rank}</span><i>{card.suit}</i></button>)}</div>
        <div className="actions">
          <div className="playOptions" aria-label="Legal plays">{plays.map((play) => <button type="button" key={play.label} className={selectedPlay?.label === play.label ? "chosen" : ""} onClick={() => { setSelected(play.cards); setFeedbackState(""); }}>{play.label.replace("Play ", "")}</button>)}</div>
          <button className="primary" disabled={loading || !selectedPlay} onClick={analyse}>{loading ? "Analysing…" : "Ask coach"}</button>
        </div>
        {error && <p className="error">{error}. Is the Go API running?</p>}
      </section>
      <aside aria-live="polite">
        <div className="coachTitle"><b>AI coach</b><small>{result ? result.provider : "Ready"}</small></div>
        {!result ? <div className="empty"><h2>No analysis yet</h2><p>Choose a legal play and ask the coach to compare your options.</p></div> : <div className="result">
          <div className="resultHead"><span>Recommendation</span><span>{Math.round(result.confidence * 100)}% confidence</span></div>
          <h2>{result.recommendation.replace("Play ", "")}</h2>
          <div className="recommendedCards">{plays.find((play) => play.label === result.recommendation)?.cards.map((id) => { const card = hand.find((item) => item.id === id)!; return <span className={card.red ? "red" : ""} key={id}>{card.rank}{card.suit}</span>; })}</div>
          <p className="rationale">{result.rationale}</p>
          <details><summary>Assumptions</summary><ul>{result.assumptions.map((item) => <li key={item}>{item}</li>)}</ul></details>
          <p className="citations">Sources: {result.citationIds.join(", ")}</p>
          <div className="feedback"><label>Correct the coach<textarea value={feedback} onChange={(event) => setFeedback(event.target.value)} rows={3} placeholder="What tactic or rule was missed?"/></label><button onClick={correct} type="button">Submit correction</button><small>{feedbackState}</small></div>
        </div>}
      </aside>
    </div>
  </main>;
}

function Player({ className, seat, count }: { className: string; seat: string; count: number }) { return <div className={`player ${className}`}><b>{seat}</b><span>{count} cards</span></div>; }
function sameCards(a: string[], b: string[]) { return a.length === b.length && a.every((card) => b.includes(card)); }
