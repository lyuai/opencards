"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

type Card = { id: string; rank: string; suit: string };
type Combo = { type: string; size: number; power: number };
type Action = { index: number; seat: string; kind: "play" | "pass"; cards?: Card[]; combination?: Combo };
type AIAdvice = { provider: string; recommendation: string; cardIds: string[]; combination?: Combo; rationale: string; alternatives: string[]; assumptions: string[]; confidence: number; moveAnalyses: { index: number; seat: string; summary: string; impact: string }[] };
type ChatMessage = { role: "user" | "assistant"; content: string };
type Game = {
  id: string; game: "guandan"; levelRank: string; yourSeat: "south"; yourHand: Card[];
  counts: Record<"south" | "west" | "north" | "east", number>;
  turn: "south" | "west" | "north" | "east"; currentPlay?: Action;
  history: Action[]; finished: string[]; gameOver: boolean; createdAt: string;
  settings: { seed: number | null; opponentPolicy: string };
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
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatDraft, setChatDraft] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [dealSeed, setDealSeed] = useState("");
  const [autoCoach, setAutoCoach] = useState(true);
  const [confirmPlay, setConfirmPlay] = useState(false);
  const [compactCards, setCompactCards] = useState(false);
  const [reasoningEffort, setReasoningEffort] = useState("medium");
  const [coachingStyle, setCoachingStyle] = useState("detailed");
  const [error, setError] = useState("");

  const dealCards = useCallback(async () => {
    setLoading(true); setError(""); setSelected([]); setAIAdvice(null); setChatMessages([]);
    try {
      const response = await fetch(`${api}/v1/games/guandan/deals`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ opponentPolicy: "danzero", seed: dealSeed === "" ? null : Number(dealSeed) }) });
      const body = await response.json(); if (!response.ok) throw new Error(body.error ?? "Could not deal cards"); setGame(body); void requestCoach(body);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not deal cards"); }
    finally { setLoading(false); }
  }, [api, autoCoach, dealSeed]);
  useEffect(() => { void dealCards(); }, []); // Deal once; the current settings apply to later actions and deals.

  async function act(pass: boolean, cards: string[] = selected) {
    if (!game) return; setLoading(true); setError("");
    if (confirmPlay && !window.confirm(pass ? "Pass this turn?" : `Play ${cards.length} selected card${cards.length === 1 ? "" : "s"}?`)) { setLoading(false); return; }
    try {
      const response = await fetch(`${api}/v1/games/guandan/deals/${game.id}/actions`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cardIds: pass ? [] : cards, pass }) });
      const body = await response.json();
      if (response.status === 404 && body.error === "game not found") { await dealCards(); setError("The previous game expired after a server restart, so a new hand was dealt."); return; }
      if (!response.ok) throw new Error(body.error ?? "Illegal action"); setGame(body); setSelected([]); setAIAdvice(null); void requestCoach(body);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Illegal action"); }
    finally { setLoading(false); }
  }

  async function requestCoach(nextGame: Game, force = false) {
    if (nextGame.turn !== "south" || nextGame.gameOver || (!autoCoach && !force)) return;
    setCoachLoading(true);
    try {
      const response=await fetch(`${api}/v1/games/guandan/deals/${nextGame.id}/coach`,{method:"POST"});
      const body=await response.json(); if(!response.ok) throw new Error(body.error??"AI coach unavailable"); setAIAdvice(body);
    } catch(caught){setError(caught instanceof Error?caught.message:"AI coach unavailable");}
    finally{setCoachLoading(false);}
  }

  async function askAICoach() { if (game) await requestCoach(game, true); }

  async function sendCopilotMessage(message = chatDraft) {
    const clean = message.trim();
    if (!game || !clean || chatLoading) return;
    const nextMessages: ChatMessage[] = [...chatMessages, { role: "user", content: clean }];
    setChatMessages(nextMessages); setChatDraft(""); setChatLoading(true);
    try {
      const response = await fetch(`${api}/v1/games/guandan/deals/${game.id}/copilot/messages`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: clean, conversation: chatMessages, reasoningEffort, coachingStyle }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Copilot unavailable");
      setChatMessages([...nextMessages, { role: "assistant", content: body.content }]);
    } catch (caught) {
      setChatMessages([...nextMessages, { role: "assistant", content: caught instanceof Error ? caught.message : "Copilot unavailable" }]);
    } finally { setChatLoading(false); }
  }

  const yourTurn = game?.turn === "south" && !game.gameOver;
  const coachCards = aiAdvice?.cardIds.map((id) => game?.yourHand.find((card) => card.id === id)).filter((card): card is Card => Boolean(card)) ?? [];
  const handGroups = game?.yourHand.reduce<Card[][]>((groups, card) => {
    const current = groups.at(-1);
    if (current?.[0]?.rank === card.rank) current.push(card); else groups.push([card]);
    return groups;
  }, []) ?? [];
  return <main>
    <header><nav><Link className="active" href="/">Arena</Link><Link href="/training">Training</Link></nav><button className="settingsToggle" aria-label="Game settings" aria-expanded={settingsOpen} onClick={()=>setSettingsOpen((open)=>!open)}>⚙</button></header>
    <div className="playWorkspace">
      <section className={`gameArea ${compactCards ? "compactCards" : ""}`} aria-label="Guandan card table">
        <div className="dealBar"><b>{game?.gameOver ? "Game over" : yourTurn ? "Your turn" : `${seatLabels[game?.turn ?? ""] ?? "AI"} to play`}</b><button className="secondary" type="button" disabled={loading} onClick={dealCards}>New Deal</button></div>
        <div className="table">
          {seats.map((seat) => <Player key={seat.id} className={seat.className} label={seat.label} role={seat.role} count={game?.counts[seat.id] ?? 0} active={game?.turn === seat.id}/>) }
          <div className="tableCenter"><b>{game?.currentPlay ? comboLabel(game.currentPlay.combination?.type) : "Lead any legal play"}</b><div className="centerCards">{game?.currentPlay?.cards?.map((card) => <MiniCard card={card} key={card.id}/>)}</div><span>{game?.currentPlay ? `${seatLabels[game.currentPlay.seat]} played` : "Fresh trick"}</span></div>
          <div className="tableHand"><div className="tableActions"><button className="secondary" disabled={!yourTurn || loading || !game?.currentPlay} onClick={() => void act(true)}>Pass</button><button className="primary" disabled={!yourTurn || loading || selected.length === 0} onClick={() => void act(false)}>{loading ? "Playing…" : "Play Selected"}</button></div><div className="hand" aria-label="Your hand">{handGroups.map((cards) => <div className="cardStack" key={cards[0].rank}>{cards.map((card) => <CardButton card={card} wild={card.rank === game?.levelRank && card.suit === "♥"} recommended={aiAdvice?.cardIds.includes(card.id) ?? false} selected={selected.includes(card.id)} key={card.id} onClick={() => yourTurn && setSelected((current) => current.includes(card.id) ? current.filter((id) => id !== card.id) : [...current, card.id])}/>)}</div>)}</div></div>
        </div>
        {error && <p className="error">{error}</p>}
        <aside className="copilot" aria-label="AI Copilot">
          <div className="copilotTabs"><button className={copilotTab === "coach" ? "active" : ""} onClick={() => setCopilotTab("coach")}>AI Coach</button><button className={copilotTab === "history" ? "active" : ""} onClick={() => setCopilotTab("history")}>History <small>{game?.history.length ?? 0}</small></button></div>
          {copilotTab === "coach" ? <div className="coachPanel">
            {coachLoading && !aiAdvice && <div className="coachThinking"><i/><span>Enumerating legal moves, comparing policy values, and reading the table…</span></div>}
            {aiAdvice ? <div className="coachAnalysis"><section className="moveFeed">{aiAdvice.moveAnalyses.map((item)=><article key={item.index}><span>#{item.index} · {seatLabels[item.seat]}</span><strong>{item.summary}</strong><p>{item.impact}</p></article>)}</section><span className="analysisLabel">{aiAdvice.confidence > 0 ? `${Math.round(aiAdvice.confidence * 100)}% CONFIDENCE` : "UNCALIBRATED POLICY PICK"}</span><h3>{aiAdvice.cardIds.length===0?"Pass this turn":`Play ${coachCards.map(cardText).join(" ")}`}</h3><div className="recommendedCards">{coachCards.map((card)=><MiniCard card={card} key={card.id}/>)}</div><section><p>{aiAdvice.rationale}</p></section>{aiAdvice.alternatives.length > 0 && <section><ul>{aiAdvice.alternatives.map((item)=><li key={item}>{item}</li>)}</ul></section>}{aiAdvice.assumptions.length > 0 && <section><ul>{aiAdvice.assumptions.map((item)=><li key={item}>{item}</li>)}</ul></section>}<div className="coachButtons">{aiAdvice.cardIds.length===0?<button className="primary" onClick={()=>void act(true)}>Follow: Pass</button>:<><button className="secondary" onClick={()=>setSelected(aiAdvice.cardIds)}>Highlight Cards</button><button className="primary" onClick={()=>void act(false,aiAdvice.cardIds)}>Play This Move</button></>}</div><small className="modelNote">Powered by DanZero</small></div> : !coachLoading && <div className="coachEmpty"><button className="secondary" onClick={()=>void askAICoach()}>Analyze this turn</button></div>}
            <div className="chatThread">{chatMessages.map((item, index)=><div className={`chatMessage ${item.role}`} key={index}>{item.content}</div>)}{chatLoading && <div className="chatMessage assistant">Thinking…</div>}</div>
            <form className="copilotComposer" onSubmit={(event)=>{event.preventDefault(); void sendCopilotMessage();}}><textarea aria-label="Ask Arena Copilot" rows={2} value={chatDraft} onChange={(event)=>setChatDraft(event.target.value)} onKeyDown={(event)=>{if(event.key==="Enter"&&!event.shiftKey){event.preventDefault();void sendCopilotMessage();}}} placeholder="Ask about this position…"/><button type="submit" aria-label="Send message" disabled={!chatDraft.trim()||chatLoading}>↑</button></form>
          </div> : <section className="history" aria-label="Complete play history"><div className="actionLog">{game?.history.map((action) => <div className="logRow" key={action.index}><span>#{action.index}</span><b>{seatLabels[action.seat]}</b>{action.kind === "pass" ? <i>Pass</i> : <><em>{comboLabel(action.combination?.type)}</em><div className="playedCards">{action.cards?.map((card) => <MiniCard card={card} key={card.id}/>)}</div></>}</div>)}</div></section>}
        </aside>
        {settingsOpen && <section className="gameSettings" aria-label="Game settings"><label>Coach reasoning<select value={reasoningEffort} onChange={(event)=>setReasoningEffort(event.target.value)}><option value="low">Fast</option><option value="medium">Balanced</option><option value="high">Deep</option></select></label><label>Coaching style<select value={coachingStyle} onChange={(event)=>setCoachingStyle(event.target.value)}><option value="direct">Direct</option><option value="detailed">Detailed</option><option value="socratic">Socratic</option></select></label><label>Replay seed<input inputMode="numeric" value={dealSeed} onChange={(event)=>setDealSeed(event.target.value.replace(/\D/g,""))} placeholder="Random"/></label><label><input type="checkbox" checked={autoCoach} onChange={(event)=>{setAutoCoach(event.target.checked);if(!event.target.checked)setAIAdvice(null);}}/>Automatic coaching</label><label><input type="checkbox" checked={confirmPlay} onChange={(event)=>setConfirmPlay(event.target.checked)}/>Confirm before playing</label><label><input type="checkbox" checked={compactCards} onChange={(event)=>setCompactCards(event.target.checked)}/>Compact hand</label><button className="primary" onClick={()=>setSettingsOpen(false)}>Done</button></section>}
      </section>
    </div>
  </main>;
}

function Player({ className, label, role, count, active }: { className: string; label: string; role: string; count: number; active: boolean }) { return <div className={`player ${className} ${active ? "activePlayer" : ""}`}><b>{label}</b><span>{count} cards</span><em>{active ? "Playing" : role}</em></div>; }
function CardButton({ card, wild, recommended, selected, onClick }: { card: Card; wild: boolean; recommended: boolean; selected: boolean; onClick: () => void }) { const red=card.suit==="♥"||card.suit==="♦", joker=card.suit==="★", goldJoker=joker&&card.rank==="RJ"; return <button type="button" aria-pressed={selected} aria-label={`${card.rank} ${card.suit}${wild ? " wild card" : ""}`} className={`playingCard ${red?"red":""} ${joker?"joker":""} ${goldJoker?"goldJoker":""} ${wild?"wild":""} ${recommended?"recommended":""}`} onClick={onClick}><span>{joker?"JOKER":card.rank}</span><i>{joker?(goldJoker?"★":"☆"):card.suit}</i>{wild?<small>WILD</small>:joker&&<small>{goldJoker?"GOLD":"SILVER"}</small>}</button>; }
function MiniCard({ card }: { card: Card }) { const jokerTone=card.rank==="RJ"?"gold":card.rank==="BJ"?"silver":""; return <span className={jokerTone||((card.suit==="♥"||card.suit==="♦")?"red":"")}>{card.suit==="★"?`${card.rank}★`:`${card.rank}${card.suit}`}</span>; }
function cardText(card: Card) { return `${card.rank}${card.suit}`; }
function comboLabel(value?: string) { const labels: Record<string,string>={single:"Single",pair:"Pair",triple:"Triple",full_house:"Full House",straight:"Straight",consecutive_pairs:"Consecutive Pairs",consecutive_triples:"Plate",straight_flush:"Straight Flush",rank_bomb:"Bomb",joker_bomb:"Joker Bomb"}; return labels[value ?? ""] ?? "Play"; }
