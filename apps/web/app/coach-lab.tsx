"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

type Card = { id: string; rank: string; suit: string };
type Deal = {
  id: string; game: "guandan"; deckCount: number; cardCount: number;
  yourSeat: "south"; yourHand: Card[];
  counts: Record<"south" | "west" | "north" | "east", number>;
  createdAt: string;
};

const seats = [
  { id: "north", label: "Partner", className: "north" },
  { id: "west", label: "West", className: "west" },
  { id: "east", label: "East", className: "east" },
  { id: "south", label: "You", className: "south" },
] as const;

export function CoachLab() {
  const api = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080";
  const [deal, setDeal] = useState<Deal | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const dealCards = useCallback(async () => {
    setLoading(true); setError(""); setSelected([]);
    try {
      const response = await fetch(`${api}/v1/games/guandan/deals`, { method: "POST" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Could not deal cards");
      setDeal(body);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not deal cards");
    } finally { setLoading(false); }
  }, [api]);

  useEffect(() => { void dealCards(); }, [dealCards]);

  return <main>
    <header><b>OpenCards</b><nav><Link className="active" href="/">Play</Link><Link href="/training">Training</Link></nav><span>掼蛋 · Two decks · {deal?.id ?? "Preparing table"}</span></header>
    <div className="playWorkspace">
      <section className="gameArea" aria-label="Guandan card table">
        <div className="dealBar"><div><b>Random deal</b><span>108 cards · four players · 27 cards each</span></div><button className="primary" type="button" disabled={loading} onClick={dealCards}>{loading ? "Shuffling…" : "Deal again"}</button></div>
        <div className="table">
          {seats.map((seat) => <Player key={seat.id} className={seat.className} label={seat.label} count={deal?.counts[seat.id] ?? 0}/>) }
          <div className="tableCenter"><b>{deal ? "Cards dealt" : "Shuffling"}</b><span>{deal ? "Select cards from your hand" : "Building two decks…"}</span></div>
        </div>
        <div className="handLabel"><b>Your hand</b><span>{deal?.yourHand.length ?? 0} cards · {selected.length} selected</span></div>
        <div className="hand" aria-label="Your hand">{deal?.yourHand.map((card) => {
          const red = card.suit === "♥" || card.suit === "♦"; const joker = card.suit === "★";
          return <button key={card.id} type="button" aria-pressed={selected.includes(card.id)} aria-label={`${card.rank} ${card.suit}`} className={`playingCard ${red ? "red" : ""} ${joker ? "joker" : ""}`} onClick={() => setSelected((current) => current.includes(card.id) ? current.filter((id) => id !== card.id) : [...current, card.id])}><span>{card.rank}</span><i>{card.suit}</i></button>;
        })}</div>
        <div className="dealNotice"><span>Opponent hands stay hidden from this client.</span><b>Next: identify legal combinations and play the first trick.</b></div>
        {error && <p className="error">{error}. Is the Go API running?</p>}
      </section>
    </div>
  </main>;
}

function Player({ className, label, count }: { className: string; label: string; count: number }) {
  return <div className={`player ${className}`}><b>{label}</b><span>{count} cards</span>{label !== "You" && <em>Hidden hand</em>}</div>;
}
