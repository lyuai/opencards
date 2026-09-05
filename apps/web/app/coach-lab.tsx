"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

type Card = { id: string; rank: string; suit: string };
type Combo = { type: string; size: number; power: number };
type Action = { index: number; seat: string; kind: "play" | "pass"; cards?: Card[]; combination?: Combo };
type AIAdvice = { provider: string; recommendation: string; cardIds: string[]; combination?: Combo; rationale: string; alternatives: string[]; assumptions: string[]; confidence: number; moveAnalyses: { index: number; seat: string; summary: string; impact: string }[] };
type Game = {
  id: string; game: "guandan"; levelRank: string; yourSeat: "south"; yourHand: Card[];
  counts: Record<"south" | "west" | "north" | "east", number>;
  turn: "south" | "west" | "north" | "east"; currentPlay?: Action;
  history: Action[]; finished: string[]; gameOver: boolean; createdAt: string;
};

const seats = [
  { id: "north", label: "Partner", role: "AI Teammate", className: "north" }, { id: "west", label: "West", role: "AI Opponent", className: "west" },
  { id: "east", label: "East", role: "AI Opponent", className: "east" }, { id: "south", label: "You", role: "Human", className: "south" },
] as const;
const seatLabels: Record<string, string> = { south: "You", west: "West", north: "Partner", east: "East" };

export function CoachLab() {
  const api = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080";
  const [game, setGame] = useState<Game | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [coachLoading, setCoachLoading] = useState(false);
  const [aiAdvice, setAIAdvice] = useState<AIAdvice | null>(null);
  const [copilotTab, setCopilotTab] = useState<"coach" | "history">("coach");
  const [error, setError] = useState("");

  const dealCards = useCallback(async () => {
    setLoading(true); setError(""); setSelected([]); setAIAdvice(null);
    try {
      const response = await fetch(`${api}/v1/games/guandan/deals`, { method: "POST" });
      const body = await response.json(); if (!response.ok) throw new Error(body.error ?? "Could not deal cards"); setGame(body); void requestCoach(body);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not deal cards"); }
    finally { setLoading(false); }
  }, [api]);
  useEffect(() => { void dealCards(); }, [dealCards]);

  async function act(pass: boolean, cards: string[] = selected) {
    if (!game) return; setLoading(true); setError("");
    try {
      const response = await fetch(`${api}/v1/games/guandan/deals/${game.id}/actions`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cardIds: pass ? [] : cards, pass }) });
      const body = await response.json();
      if (response.status === 404 && body.error === "game not found") { await dealCards(); setError("The previous game expired after a server restart, so a new hand was dealt."); return; }
      if (!response.ok) throw new Error(body.error ?? "Illegal action"); setGame(body); setSelected([]); setAIAdvice(null); void requestCoach(body);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Illegal action"); }
    finally { setLoading(false); }
  }

  async function requestCoach(nextGame: Game) {
    if (nextGame.turn !== "south" || nextGame.gameOver) return;
    setCoachLoading(true);
    try {
      const response=await fetch(`${api}/v1/games/guandan/deals/${nextGame.id}/coach`,{method:"POST"});
      const body=await response.json(); if(!response.ok) throw new Error(body.error??"AI coach unavailable"); setAIAdvice(body);
    } catch(caught){setError(caught instanceof Error?caught.message:"AI coach unavailable");}
    finally{setCoachLoading(false);}
  }

  async function askAICoach() { if (game) await requestCoach(game); }

  const yourTurn = game?.turn === "south" && !game.gameOver;
  const coachCards = aiAdvice?.cardIds.map((id) => game?.yourHand.find((card) => card.id === id)).filter((card): card is Card => Boolean(card)) ?? [];
  const handGroups = game?.yourHand.reduce<Card[][]>((groups, card) => {
    const current = groups.at(-1);
    if (current?.[0]?.rank === card.rank) current.push(card); else groups.push([card]);
    return groups;
  }, []) ?? [];
  return <main>
    <header><b>OpenCards Arena</b><nav><Link className="active" href="/">Arena</Link><Link href="/training">Training</Link></nav><span>Guandan · Rank {game?.levelRank ?? "2"} · {game?.id ?? "Preparing table"}</span></header>
    <div className="playWorkspace">
      <section className="gameArea" aria-label="Guandan card table">
        <div className="dealBar"><div><b>{game?.gameOver ? "Game over" : yourTurn ? "Your turn" : `${seatLabels[game?.turn ?? ""] ?? "AI"} to play`}</b><span>Opening seat is engine-selected · Counter-clockwise: South → East → North → West</span></div><button className="secondary" type="button" disabled={loading} onClick={dealCards}>New Deal</button></div>
        <div className="turnOrder" aria-label="Turn order"><span className={game?.turn === "south" ? "current" : ""}>You · South</span><i>→</i><span className={game?.turn === "east" ? "current" : ""}>East</span><i>→</i><span className={game?.turn === "north" ? "current" : ""}>Partner · North</span><i>→</i><span className={game?.turn === "west" ? "current" : ""}>West</span></div>
        <div className="table">
          {seats.map((seat) => <Player key={seat.id} className={seat.className} label={seat.label} role={seat.role} count={game?.counts[seat.id] ?? 0} active={game?.turn === seat.id}/>) }
          <div className="tableCenter"><b>{game?.currentPlay ? comboLabel(game.currentPlay.combination?.type) : "Lead any legal play"}</b><div className="centerCards">{game?.currentPlay?.cards?.map((card) => <MiniCard card={card} key={card.id}/>)}</div><span>{game?.currentPlay ? `${seatLabels[game.currentPlay.seat]} played` : "Fresh trick"}</span></div>
          <div className="tableActions">
            <button className="secondary" disabled={!yourTurn || loading || !game?.currentPlay} onClick={() => void act(true)}>Pass</button>
            <button className="primary" disabled={!yourTurn || loading || selected.length === 0} onClick={() => void act(false)}>{loading ? "Playing…" : "Play Selected"}</button>
          </div>
          <div className="tableHand">
            <div className="handLabel"><b>Your Hand</b><span>{game?.yourHand.length ?? 0} cards · {selected.length} selected</span></div>
            <div className="hand" aria-label="Your hand">{handGroups.map((cards) => <div className="cardStack" key={cards[0].rank}>{cards.map((card) => <CardButton card={card} wild={card.rank === game?.levelRank && card.suit === "♥"} recommended={aiAdvice?.cardIds.includes(card.id) ?? false} selected={selected.includes(card.id)} key={card.id} onClick={() => yourTurn && setSelected((current) => current.includes(card.id) ? current.filter((id) => id !== card.id) : [...current, card.id])}/>)}</div>)}</div>
          </div>
        </div>
        {error && <p className="error">{error}</p>}
        <aside className="copilot" aria-label="AI Copilot">
          <div className="copilotTabs"><button className={copilotTab === "coach" ? "active" : ""} onClick={() => setCopilotTab("coach")}>AI Coach</button><button className={copilotTab === "history" ? "active" : ""} onClick={() => setCopilotTab("history")}>History <small>{game?.history.length ?? 0}</small></button></div>
          {copilotTab === "coach" ? <div className="coachPanel">
            <div className="coachPanelHead"><div><b>DanZero Copilot</b><span>Continuously evaluates the public state and legal action space</span></div><button className="secondary" disabled={!yourTurn||coachLoading} onClick={()=>void askAICoach()}>{coachLoading?"Analyzing…":"Refresh"}</button></div>
            {coachLoading && !aiAdvice && <div className="coachThinking"><i/><span>Enumerating legal moves, comparing policy values, and reading the table…</span></div>}
            {aiAdvice ? <div className="coachAnalysis"><section className="moveFeed"><b>Table Read</b>{aiAdvice.moveAnalyses.map((item)=><article key={item.index}><span>#{item.index} · {seatLabels[item.seat]}</span><strong>{item.summary}</strong><p>{item.impact}</p></article>)}</section><span className="analysisLabel">RECOMMENDATION · {aiAdvice.confidence > 0 ? `${Math.round(aiAdvice.confidence * 100)}% CONFIDENCE` : "UNCALIBRATED POLICY PICK"}</span><h3>{aiAdvice.cardIds.length===0?"Pass this turn":`Play ${coachCards.map(cardText).join(" ")}`}</h3><div className="recommendedCards">{coachCards.map((card)=><MiniCard card={card} key={card.id}/>)}</div><section><b>Why this move</b><p>{aiAdvice.rationale}</p></section>{aiAdvice.alternatives.length > 0 && <section><b>Alternatives</b><ul>{aiAdvice.alternatives.map((item)=><li key={item}>{item}</li>)}</ul></section>}{aiAdvice.assumptions.length > 0 && <section><b>Assumptions</b><ul>{aiAdvice.assumptions.map((item)=><li key={item}>{item}</li>)}</ul></section>}<div className="coachButtons">{aiAdvice.cardIds.length===0?<button className="primary" onClick={()=>void act(true)}>Follow: Pass</button>:<><button className="secondary" onClick={()=>setSelected(aiAdvice.cardIds)}>Highlight Cards</button><button className="primary" onClick={()=>void act(false,aiAdvice.cardIds)}>Play This Move</button></>}</div><small className="modelNote">{aiAdvice.provider} · learned policy over the complete legal action set</small></div> : !coachLoading && <div className="coachEmpty">The coach starts automatically when it is your turn.</div>}
          </div> : <section className="history" aria-label="Complete play history"><div className="historyTitle"><b>Complete Record <em>oldest first</em></b><span>{game?.history.length ?? 0} actions</span></div><div className="actionLog">{game?.history.map((action) => <div className="logRow" key={action.index}><span>#{action.index}</span><b>{seatLabels[action.seat]}</b>{action.kind === "pass" ? <i>Pass</i> : <><em>{comboLabel(action.combination?.type)}</em><div className="playedCards">{action.cards?.map((card) => <MiniCard card={card} key={card.id}/>)}</div></>}</div>)}</div></section>}
        </aside>
      </section>
    </div>
  </main>;
}

function Player({ className, label, role, count, active }: { className: string; label: string; role: string; count: number; active: boolean }) { return <div className={`player ${className} ${active ? "activePlayer" : ""}`}><b>{label}</b><span>{count} 张</span><em>{active ? "当前出牌" : role}</em></div>; }
function CardButton({ card, wild, recommended, selected, onClick }: { card: Card; wild: boolean; recommended: boolean; selected: boolean; onClick: () => void }) { const red=card.suit==="♥"||card.suit==="♦", joker=card.suit==="★"; return <button type="button" aria-pressed={selected} aria-label={`${card.rank} ${card.suit}${wild ? " wild card" : ""}`} className={`playingCard ${red?"red":""} ${joker?"joker":""} ${wild?"wild":""} ${recommended?"recommended":""}`} onClick={onClick}><span>{card.rank}</span><i>{card.suit}</i>{wild&&<small>WILD</small>}</button>; }
function MiniCard({ card }: { card: Card }) { return <span className={card.suit==="♥"||card.suit==="♦"?"red":""}>{card.rank}{card.suit}</span>; }
function cardText(card: Card) { return `${card.rank}${card.suit}`; }
function comboLabel(value?: string) { const labels: Record<string,string>={single:"Single",pair:"Pair",triple:"Triple",full_house:"Full House",straight:"Straight",consecutive_pairs:"Consecutive Pairs",consecutive_triples:"Plate",straight_flush:"Straight Flush",rank_bomb:"Bomb",joker_bomb:"Joker Bomb"}; return labels[value ?? ""] ?? "Play"; }
