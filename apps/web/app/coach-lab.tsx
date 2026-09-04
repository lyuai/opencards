"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

type Card = { id: string; rank: string; suit: string };
type Combo = { type: string; size: number; power: number };
type Action = { index: number; seat: string; kind: "play" | "pass"; cards?: Card[]; combination?: Combo };
type Coach = { available: boolean; action?: "play" | "pass"; cardIds?: string[]; combination?: Combo; reason?: string };
type Game = {
  id: string; game: "guandan"; yourSeat: "south"; yourHand: Card[];
  counts: Record<"south" | "west" | "north" | "east", number>;
  turn: "south" | "west" | "north" | "east"; currentPlay?: Action;
  history: Action[]; finished: string[]; gameOver: boolean; coach: Coach; createdAt: string;
};

const seats = [
  { id: "north", label: "Partner", className: "north" }, { id: "west", label: "West", className: "west" },
  { id: "east", label: "East", className: "east" }, { id: "south", label: "You", className: "south" },
] as const;
const seatLabels: Record<string, string> = { south: "You", west: "West", north: "Partner", east: "East" };

export function CoachLab() {
  const api = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080";
  const [game, setGame] = useState<Game | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const dealCards = useCallback(async () => {
    setLoading(true); setError(""); setSelected([]);
    try {
      const response = await fetch(`${api}/v1/games/guandan/deals`, { method: "POST" });
      const body = await response.json(); if (!response.ok) throw new Error(body.error ?? "Could not deal cards"); setGame(body);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not deal cards"); }
    finally { setLoading(false); }
  }, [api]);
  useEffect(() => { void dealCards(); }, [dealCards]);

  async function act(pass: boolean) {
    if (!game) return; setLoading(true); setError("");
    try {
      const response = await fetch(`${api}/v1/games/guandan/deals/${game.id}/actions`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cardIds: pass ? [] : selected, pass }) });
      const body = await response.json();
      if (response.status === 404 && body.error === "game not found") { await dealCards(); setError("The previous game expired after a server restart, so a new hand was dealt."); return; }
      if (!response.ok) throw new Error(body.error ?? "Illegal action"); setGame(body); setSelected([]);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Illegal action"); }
    finally { setLoading(false); }
  }

  const yourTurn = game?.turn === "south" && !game.gameOver;
  return <main>
    <header><b>OpenCards</b><nav><Link className="active" href="/">Play</Link><Link href="/training">Training</Link></nav><span>掼蛋 prototype · {game?.id ?? "Preparing table"}</span></header>
    <div className="playWorkspace">
      <section className="gameArea" aria-label="Guandan card table">
        <div className="dealBar"><div><b>{game?.gameOver ? "Hand complete" : yourTurn ? "Your turn" : `${seatLabels[game?.turn ?? ""] ?? "AI"} is thinking`}</b><span>Two decks · four players · AI partner and opponents</span></div><button className="secondary" type="button" disabled={loading} onClick={dealCards}>New deal</button></div>
        <div className="table">
          {seats.map((seat) => <Player key={seat.id} className={seat.className} label={seat.label} count={game?.counts[seat.id] ?? 0} active={game?.turn === seat.id}/>) }
          <div className="tableCenter"><b>{game?.currentPlay ? comboLabel(game.currentPlay.combination?.type) : "Lead any legal play"}</b><div className="centerCards">{game?.currentPlay?.cards?.map((card) => <MiniCard card={card} key={card.id}/>)}</div><span>{game?.currentPlay ? `${seatLabels[game.currentPlay.seat]} played` : "Fresh trick"}</span></div>
        </div>
        <div className="handLabel"><b>Your hand</b><span>{game?.yourHand.length ?? 0} cards · {selected.length} selected</span></div>
        <div className="hand" aria-label="Your hand">{game?.yourHand.map((card) => <CardButton card={card} selected={selected.includes(card.id)} key={card.id} onClick={() => yourTurn && setSelected((current) => current.includes(card.id) ? current.filter((id) => id !== card.id) : [...current, card.id])}/>)}</div>
        <div className="playControls">
          <button className="secondary" disabled={!yourTurn || loading || !game?.currentPlay} onClick={() => void act(true)}>Pass</button>
          <button className="primary" disabled={!yourTurn || loading || selected.length === 0} onClick={() => void act(false)}>{loading ? "Playing…" : "Play selected"}</button>
        </div>
        {game?.coach.available && <div className="coachHint"><div><b>AI coach</b><span>{game.coach.reason}</span></div><button className="secondary" onClick={() => setSelected(game.coach.cardIds ?? [])}>{game.coach.action === "pass" ? "Recommends pass" : `Select ${comboLabel(game.coach.combination?.type)}`}</button></div>}
        {error && <p className="error">{error}</p>}
        <section className="history" aria-label="Complete play history"><div className="historyTitle"><b>Play history <em>Live game</em></b><span>{game?.history.length ?? 0} actions</span></div><div className="actionLog">{game?.history.slice().reverse().map((action) => <div className="logRow" key={action.index}><span>#{action.index}</span><b>{seatLabels[action.seat]}</b>{action.kind === "pass" ? <i>Pass</i> : <><em>{comboLabel(action.combination?.type)}</em><div className="playedCards">{action.cards?.map((card) => <MiniCard card={card} key={card.id}/>)}</div></>}</div>)}</div></section>
      </section>
    </div>
  </main>;
}

function Player({ className, label, count, active }: { className: string; label: string; count: number; active: boolean }) { return <div className={`player ${className} ${active ? "activePlayer" : ""}`}><b>{label}</b><span>{count} cards</span>{label !== "You" && <em>{label === "Partner" ? "AI teammate" : "AI opponent"}</em>}</div>; }
function CardButton({ card, selected, onClick }: { card: Card; selected: boolean; onClick: () => void }) { const red=card.suit==="♥"||card.suit==="♦", joker=card.suit==="★"; return <button type="button" aria-pressed={selected} aria-label={`${card.rank} ${card.suit}`} className={`playingCard ${red?"red":""} ${joker?"joker":""}`} onClick={onClick}><span>{card.rank}</span><i>{card.suit}</i></button>; }
function MiniCard({ card }: { card: Card }) { return <span className={card.suit==="♥"||card.suit==="♦"?"red":""}>{card.rank}{card.suit}</span>; }
function comboLabel(value?: string) { return (value ?? "play").replaceAll("_", " "); }
