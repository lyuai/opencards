"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

type Card = { id: string; rank: string; suit: string };
type Combo = { type: string; size: number; power: number };
type Action = { index: number; seat: string; kind: "play" | "pass"; cards?: Card[]; combination?: Combo };
type AIAdvice = { provider: string; recommendation: string; cardIds: string[]; combination?: Combo; rationale: string; alternatives: string[]; assumptions: string[]; confidence: number };
type Game = {
  id: string; game: "guandan"; levelRank: string; yourSeat: "south"; yourHand: Card[];
  counts: Record<"south" | "west" | "north" | "east", number>;
  turn: "south" | "west" | "north" | "east"; currentPlay?: Action;
  history: Action[]; finished: string[]; gameOver: boolean; createdAt: string;
};

const seats = [
  { id: "north", label: "Partner", className: "north" }, { id: "west", label: "West", className: "west" },
  { id: "east", label: "East", className: "east" }, { id: "south", label: "You", className: "south" },
] as const;
const seatLabels: Record<string, string> = { south: "你（南）", west: "西家", north: "队友（北）", east: "东家" };

export function CoachLab() {
  const api = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080";
  const [game, setGame] = useState<Game | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [coachLoading, setCoachLoading] = useState(false);
  const [aiAdvice, setAIAdvice] = useState<AIAdvice | null>(null);
  const [error, setError] = useState("");

  const dealCards = useCallback(async () => {
    setLoading(true); setError(""); setSelected([]); setAIAdvice(null);
    try {
      const response = await fetch(`${api}/v1/games/guandan/deals`, { method: "POST" });
      const body = await response.json(); if (!response.ok) throw new Error(body.error ?? "Could not deal cards"); setGame(body);
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
      if (!response.ok) throw new Error(body.error ?? "Illegal action"); setGame(body); setSelected([]); setAIAdvice(null);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Illegal action"); }
    finally { setLoading(false); }
  }

  async function askAICoach() {
    if (!game) return; setCoachLoading(true); setError("");
    try {
      const response=await fetch(`${api}/v1/games/guandan/deals/${game.id}/coach`,{method:"POST"});
      const body=await response.json(); if(!response.ok) throw new Error(body.error??"AI coach unavailable"); setAIAdvice(body);
    } catch(caught){setError(caught instanceof Error?caught.message:"AI coach unavailable");}
    finally{setCoachLoading(false);}
  }

  const yourTurn = game?.turn === "south" && !game.gameOver;
  const coachCards = aiAdvice?.cardIds.map((id) => game?.yourHand.find((card) => card.id === id)).filter((card): card is Card => Boolean(card)) ?? [];
  return <main>
    <header><b>OpenCards</b><nav><Link className="active" href="/">Play</Link><Link href="/training">Training</Link></nav><span>掼蛋 · 打{game?.levelRank ?? "2"} · {game?.id ?? "Preparing table"}</span></header>
    <div className="playWorkspace">
      <section className="gameArea" aria-label="Guandan card table">
        <div className="dealBar"><div><b>{game?.gameOver ? "本局结束" : yourTurn ? "当前：你出牌" : `当前：${seatLabels[game?.turn ?? ""] ?? "AI"} 出牌`}</b><span>每局首家由正式引擎决定 · 逆时针：南 → 东 → 北 → 西</span></div><button className="secondary" type="button" disabled={loading} onClick={dealCards}>重新发牌</button></div>
        <div className="turnOrder" aria-label="出牌顺序"><span className={game?.turn === "south" ? "current" : ""}>1 你（南）</span><i>→</i><span className={game?.turn === "east" ? "current" : ""}>2 东家</span><i>→</i><span className={game?.turn === "north" ? "current" : ""}>3 队友（北）</span><i>→</i><span className={game?.turn === "west" ? "current" : ""}>4 西家</span></div>
        <div className="table">
          {seats.map((seat) => <Player key={seat.id} className={seat.className} label={seat.label} count={game?.counts[seat.id] ?? 0} active={game?.turn === seat.id}/>) }
          <div className="tableCenter"><b>{game?.currentPlay ? comboLabel(game.currentPlay.combination?.type) : "Lead any legal play"}</b><div className="centerCards">{game?.currentPlay?.cards?.map((card) => <MiniCard card={card} key={card.id}/>)}</div><span>{game?.currentPlay ? `${seatLabels[game.currentPlay.seat]} played` : "Fresh trick"}</span></div>
        </div>
        <div className="handLabel"><b>Your hand</b><span>{game?.yourHand.length ?? 0} cards · {selected.length} selected</span></div>
        <div className="hand" aria-label="Your hand">{game?.yourHand.map((card) => <CardButton card={card} wild={card.rank === game.levelRank && card.suit === "♥"} recommended={aiAdvice?.cardIds.includes(card.id) ?? false} selected={selected.includes(card.id)} key={card.id} onClick={() => yourTurn && setSelected((current) => current.includes(card.id) ? current.filter((id) => id !== card.id) : [...current, card.id])}/>)}</div>
        <div className="playControls">
          <button className="secondary" disabled={!yourTurn || loading || !game?.currentPlay} onClick={() => void act(true)}>Pass</button>
          <button className="primary" disabled={!yourTurn || loading || selected.length === 0} onClick={() => void act(false)}>{loading ? "Playing…" : "Play selected"}</button>
        </div>
        <div className="coachRequest"><div><b>DanZero 学习型 AI 教练</b><span>预训练价值网络读取正式引擎状态，并在完整合法动作集合中决策。</span></div><button className="primary" disabled={!yourTurn||coachLoading} onClick={()=>void askAICoach()}>{coachLoading?"策略计算中…":"咨询 AI 教练"}</button></div>
        {aiAdvice && <div className="coachHint"><div className="coachAdvice"><b>AI 教练 · {aiAdvice.provider}</b><h3>{aiAdvice.cardIds.length===0?"建议不出":`建议出 ${coachCards.map(cardText).join(" ")} · ${comboLabel(aiAdvice.combination?.type)}`}</h3><div className="recommendedCards">{coachCards.map((card)=><MiniCard card={card} key={card.id}/>)}</div><span>{aiAdvice.rationale}</span><small>动作由 DanZero 学习策略从正式引擎的 actionList 中选择，不是提示词或手写技巧。</small></div><div className="coachButtons">{aiAdvice.cardIds.length===0?<button className="primary" onClick={()=>void act(true)}>按建议不出</button>:<><button className="secondary" onClick={()=>setSelected(aiAdvice.cardIds)}>选中建议牌</button><button className="primary" onClick={()=>void act(false,aiAdvice.cardIds)}>按建议出牌</button></>}</div></div>}
        {error && <p className="error">{error}</p>}
        <section className="history" aria-label="Complete play history"><div className="historyTitle"><b>出牌记录 <em>从早到晚</em></b><span>{game?.history.length ?? 0} 次行动</span></div><div className="actionLog">{game?.history.map((action) => <div className="logRow" key={action.index}><span>#{action.index}</span><b>{seatLabels[action.seat]}</b>{action.kind === "pass" ? <i>不出</i> : <><em>{comboLabel(action.combination?.type)}</em><div className="playedCards">{action.cards?.map((card) => <MiniCard card={card} key={card.id}/>)}</div></>}</div>)}</div></section>
      </section>
    </div>
  </main>;
}

function Player({ className, label, count, active }: { className: string; label: string; count: number; active: boolean }) { return <div className={`player ${className} ${active ? "activePlayer" : ""}`}><b>{label}</b><span>{count} 张</span>{active ? <em>当前出牌</em> : label !== "You" && <em>{label === "Partner" ? "AI 队友" : "AI 对手"}</em>}</div>; }
function CardButton({ card, wild, recommended, selected, onClick }: { card: Card; wild: boolean; recommended: boolean; selected: boolean; onClick: () => void }) { const red=card.suit==="♥"||card.suit==="♦", joker=card.suit==="★"; return <button type="button" aria-pressed={selected} aria-label={`${card.rank} ${card.suit}${wild ? " 万能牌" : ""}`} className={`playingCard ${red?"red":""} ${joker?"joker":""} ${wild?"wild":""} ${recommended?"recommended":""}`} onClick={onClick}><span>{card.rank}</span><i>{card.suit}</i>{wild&&<small>配</small>}</button>; }
function MiniCard({ card }: { card: Card }) { return <span className={card.suit==="♥"||card.suit==="♦"?"red":""}>{card.rank}{card.suit}</span>; }
function cardText(card: Card) { return `${card.rank}${card.suit}`; }
function comboLabel(value?: string) { const labels: Record<string,string>={single:"单张",pair:"对子",triple:"三张",full_house:"三带二",straight:"顺子",consecutive_pairs:"三连对",consecutive_triples:"钢板",straight_flush:"同花顺",rank_bomb:"炸弹",joker_bomb:"天王炸"}; return labels[value ?? ""] ?? "出牌"; }
