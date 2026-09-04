"use client";

import { useMemo, useState } from "react";

type CoachResult = { recommendation: string; rationale: string; alternatives: string[]; assumptions: string[]; confidence: number; citationIds: string[]; provider: string };
type Card = { id: string; rank: string; suit: string; red?: boolean; joker?: boolean };
type LegalPlay = { label: string; cards: string[]; tone: "shed" | "shape" | "control" };

const hand: Card[] = [
  { id: "3s", rank: "3", suit: "♠" }, { id: "3h", rank: "3", suit: "♥", red: true },
  { id: "7s", rank: "7", suit: "♠" }, { id: "7h", rank: "7", suit: "♥", red: true },
  { id: "7d", rank: "7", suit: "♦", red: true }, { id: "9c", rank: "9", suit: "♣" },
  { id: "9d", rank: "9", suit: "♦", red: true }, { id: "as", rank: "A", suit: "♠" },
  { id: "bj", rank: "JOKER", suit: "★", joker: true }
];
const plays: LegalPlay[] = [
  { label: "Play pair 3s", cards: ["3s", "3h"], tone: "shape" },
  { label: "Play pair 9s", cards: ["9c", "9d"], tone: "shape" },
  { label: "Play triple 7s", cards: ["7s", "7h", "7d"], tone: "shed" },
  { label: "Play full house 777+99", cards: ["7s", "7h", "7d", "9c", "9d"], tone: "shed" },
  { label: "Play single A", cards: ["as"], tone: "control" },
  { label: "Play black joker", cards: ["bj"], tone: "control" }
];
const sample = {
  game: "guandan", ruleset: "competition-draft-2026-09",
  position: "Our team is level 2. I lead with 9 cards. My partner has 3 cards; opponents have 8 and 12. Known hand: 3♠ 3♥ 7♠ 7♥ 7♦ 9♣ 9♦ A♠ BJ.",
  legalActions: plays.map(play => play.label), playerGoal: "Help my partner finish first without wasting control cards."
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
  const selectedPlay = useMemo(() => plays.find(play => sameCards(play.cards, selected)), [selected]);

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
    setFeedbackState(response.ok ? "Saved for review — it will not silently alter the rules." : "Could not save feedback.");
  }

  return <main>
    <nav><div className="brand"><span>OC</span><div><b>OpenCards</b><small>AI coaching table</small></div></div><div className="round"><span>LEVEL</span><b>2</b><i>Hand 6 · You lead</i></div></nav>
    <div className="workspace">
      <section className="gameArea" aria-label="Guandan card table">
        <div className="table"><Player seat="Partner" count={3} team active/><Player seat="West" count={8}/><div className="tableCenter"><span>掼蛋</span><b>Your lead</b><small>Choose a legal combination</small></div><Player seat="East" count={12}/><div className="you"><span>You</span><b>9 cards</b></div></div>
        <div className="hand" aria-label="Your hand">{hand.map((card, index) => <button key={card.id} type="button" aria-pressed={selected.includes(card.id)} aria-label={`${card.rank} ${card.suit}`} className={`playingCard ${card.red ? "red" : ""} ${card.joker ? "joker" : ""}`} style={{ "--offset": index - 4 } as React.CSSProperties} onClick={() => setSelected(current => current.includes(card.id) ? current.filter(item => item !== card.id) : [...current, card.id])}><span className="corner">{card.rank}<i>{card.suit}</i></span><strong>{card.joker ? "JOKER" : card.suit}</strong><span className="corner bottom">{card.rank}<i>{card.suit}</i></span></button>)}</div>
        <div className="playTray"><div><p className="micro">Legal plays</p><div className="playOptions">{plays.map(play => <button type="button" key={play.label} className={selectedPlay?.label === play.label ? "chosen" : ""} onClick={() => { setSelected(play.cards); setFeedbackState(""); }}><i data-tone={play.tone}/>{play.label.replace("Play ", "")}</button>)}</div></div><button className="primary" disabled={loading || !selectedPlay} onClick={analyse}>{loading ? "Coach is thinking…" : "Analyse this turn"}</button></div>
        {error && <p className="error">{error}. Is the Go API running?</p>}
      </section>
      <aside aria-live="polite"><div className="coachTitle"><span className="coachMark">AI</span><div><b>Turn coach</b><small>{result ? result.provider : "Ready to analyse"}</small></div></div>
        {!result ? <div className="empty"><div className="pulse"/><h2>Make your move</h2><p>Select a legal play from your hand, then ask the coach to compare it against every alternative.</p></div> : <><div className="resultHead"><span className="badge">Recommendation</span><span>{Math.round(result.confidence * 100)}% confidence</span></div><h2 className="recommendation">{result.recommendation.replace("Play ", "")}</h2><div className="recommendedCards">{plays.find(play => play.label === result.recommendation)?.cards.map(id => { const card = hand.find(item => item.id === id)!; return <span className={card.red ? "red" : ""} key={id}>{card.rank}{card.suit}</span>; })}</div><p className="rationale">{result.rationale}</p><details><summary>Assumptions and uncertainty</summary><ul>{result.assumptions.map(item => <li key={item}>{item}</li>)}</ul></details><p className="citations">Sources · {result.citationIds.join(" · ")}</p><div className="feedback"><label>Something wrong?<textarea value={feedback} onChange={event => setFeedback(event.target.value)} rows={3} placeholder="Explain the missed tactic or rule…"/></label><button onClick={correct} type="button">Submit correction</button><small>{feedbackState}</small></div></>}
      </aside>
    </div>
  </main>;
}

function Player({ seat, count, team, active }: { seat: string; count: number; team?: boolean; active?: boolean }) {
  return <div className={`player player${seat} ${team ? "teammate" : ""}`}><div className="avatar">{seat.slice(0, 1)}</div><span>{seat}{team && <em>Partner</em>}</span><b>{count}</b><div className="cardStack">{[0, 1, 2].map(card => <i key={card}/>)}</div>{active && <small>3 cards left</small>}</div>;
}
function sameCards(a: string[], b: string[]) { return a.length === b.length && a.every(card => b.includes(card)); }
