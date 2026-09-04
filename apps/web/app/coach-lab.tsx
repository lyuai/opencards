"use client";

import { useMemo, useState } from "react";

type CoachResult = { recommendation: string; rationale: string; alternatives: string[]; assumptions: string[]; confidence: number; citationIds: string[]; provider: string };
type Card = { id: string; rank: string; suit: string; red?: boolean; joker?: boolean };
type LegalPlay = { label: string; cards: string[] };
type Turn = { player: string; cards?: Card[]; note?: string };
type Trick = { number: number; winner: string; turns: Turn[] };
type PlayerStyle = { label: string; evidence: string; confidence: number };

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
const playHistory: Trick[] = [
  { number: 1, winner: "East", turns: [
    { player: "You", cards: cards("y5s", "5♠") }, { player: "West", cards: cards("w8c", "8♣") },
    { player: "Partner" }, { player: "East", cards: cards("eas", "A♠") },
  ] },
  { number: 2, winner: "Partner", turns: [
    { player: "East", cards: cards("e3c,e3d", "3♣ 3♦") }, { player: "You", cards: cards("y6s,y6h", "6♠ 6♥") },
    { player: "West", cards: cards("w10c,w10d", "10♣ 10♦") }, { player: "Partner", cards: cards("pqc,pqd", "Q♣ Q♦") },
  ] },
  { number: 3, winner: "You", turns: [
    { player: "Partner", cards: cards("p4s,p5h,p6d,p7c,p8s", "4♠ 5♥ 6♦ 7♣ 8♠") }, { player: "East" },
    { player: "You", cards: cards("y8h,y9h,y10s,yjc,yqd", "8♥ 9♥ 10♠ J♣ Q♦") }, { player: "West" },
  ] },
  { number: 4, winner: "West", turns: [
    { player: "You", cards: cards("ykc", "K♣") }, { player: "West", cards: cards("w2h", "2♥") },
    { player: "Partner" }, { player: "East" },
  ] },
  { number: 5, winner: "Partner", turns: [
    { player: "West", cards: cards("w4s,w4h", "4♠ 4♥") }, { player: "Partner", cards: cards("p6c,p6d", "6♣ 6♦") },
    { player: "East" }, { player: "You" },
  ] },
];
const players = ["Partner", "West", "East", "You"];
const startingCounts: Record<string, number> = { Partner: 12, West: 14, East: 15, You: 18 };
const playerStyles = Object.fromEntries(players.map((player) => [player, inferStyle(player, playHistory)])) as Record<string, PlayerStyle>;
const remainingCounts = Object.fromEntries(players.map((player) => [player, startingCounts[player] - playHistory.flatMap((trick) => trick.turns).filter((turn) => turn.player === player).reduce((total, turn) => total + (turn.cards?.length ?? 0), 0)])) as Record<string, number>;
const historyForCoach = playHistory.map((trick) => `Trick ${trick.number}: ${trick.turns.map((turn) => `${turn.player} ${turn.cards?.map((card) => `${card.rank}${card.suit}`).join(" ") ?? "passed"}`).join(", ")}; ${trick.winner} won.`).join(" ");
const stylesForCoach = Object.entries(playerStyles).map(([player, style]) => `${player}: ${style.label}, confidence ${Math.round(style.confidence * 100)}% (${style.evidence})`).join("; ");
const sample = {
  game: "guandan", ruleset: "competition-draft-2026-09",
  position: `Our team is level 2. I lead with ${remainingCounts.You} cards. My partner has ${remainingCounts.Partner} cards; opponents have ${remainingCounts.West} and ${remainingCounts.East}. Known visible hand: 3♠ 3♥ 7♠ 7♥ 7♦ 9♣ 9♦ A♠ BJ. Complete play history: ${historyForCoach} Styles inferred only from this replay: ${stylesForCoach}`,
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
          <Player className="north" seat="Partner"/><Player className="west" seat="West"/>
          <div className="tableCenter"><b>Your turn</b><span>Select a legal play</span></div>
          <Player className="east" seat="East"/><Player className="south" seat="You"/>
        </div>
        <section className="history" aria-label="Complete play history">
          <div className="historyTitle"><b>Play history <em>Manual sample</em></b><span>5 tricks · Partner won last · You lead</span></div>
          <div className="tricks">{playHistory.map((trick) => <div className="trick" key={trick.number}>
            <div className="trickMeta"><b>Trick {trick.number}</b><span>{trick.winner} won</span></div>
            <div className="turns">{trick.turns.map((turn) => <div className="turn" key={turn.player}>
              <span className="turnPlayer">{turn.player}</span>
              {turn.cards ? <div className="playedCards">{turn.cards.map((card) => <span className={card.red ? "red" : ""} key={card.id}>{card.rank}{card.suit}</span>)}</div> : <i>Pass</i>}
            </div>)}</div>
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

function Player({ className, seat }: { className: string; seat: string }) {
  const style = playerStyles[seat];
  return <div className={`player ${className}`} title={style.evidence}><b>{seat}</b><span>{remainingCounts[seat]} cards</span><em>{style.label} · {Math.round(style.confidence * 100)}%</em></div>;
}
function sameCards(a: string[], b: string[]) { return a.length === b.length && a.every((card) => b.includes(card)); }
function cards(ids: string, values: string): Card[] { return values.split(" ").map((value, index) => ({ id: ids.split(",")[index], rank: value.slice(0, -1), suit: value.slice(-1), red: value.endsWith("♥") || value.endsWith("♦") })); }

function inferStyle(player: string, history: Trick[]): PlayerStyle {
  const turns = history.flatMap((trick) => trick.turns).filter((turn) => turn.player === player);
  const plays = turns.filter((turn) => turn.cards?.length);
  const passes = turns.length - plays.length;
  const wins = history.filter((trick) => trick.winner === player).length;
  const cardsPlayed = plays.reduce((total, turn) => total + (turn.cards?.length ?? 0), 0);
  const passRate = turns.length ? passes / turns.length : 0;
  const winRate = turns.length ? wins / turns.length : 0;
  const averageSize = plays.length ? cardsPlayed / plays.length : 0;
  const confidence = Math.min(.85, .2 + turns.length * .07);
  const evidence = `${turns.length} decisions · ${Math.round(passRate * 100)}% pass rate · ${wins} tricks won · ${averageSize.toFixed(1)} cards/play`;

  if (passRate >= .55) return { label: "Selective", evidence, confidence };
  if (winRate >= .35) return { label: "Tempo driver", evidence, confidence };
  if (averageSize >= 2.5) return { label: "Combination shedder", evidence, confidence };
  if (passRate <= .2) return { label: "Frequent challenger", evidence, confidence };
  return { label: "Balanced", evidence, confidence };
}
