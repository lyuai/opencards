import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { Brand } from "./brand";
import { apiUrl } from "./config";

type Card = { id: string; rank: string; suit: string };
type Combo = { type: string; size: number; power: number };
type Action = { index: number; seat: string; kind: "play" | "pass"; cards?: Card[]; combination?: Combo };
type LegalAction = { index: number; kind: "play" | "pass"; codes?: string[]; cards?: Card[]; combination?: Combo };
type LastDeal = {
  number: number; finished: string[]; winnerTeam: "you" | "opponent"; yourTeamWon: boolean;
  kind: string; levelGain: number; yourLevel: string; opponentLevel: string; matchOver: boolean;
};
type AIAdvice = { provider: string; recommendation: string; cardIds: string[]; combination?: Combo; rationale: string; alternatives: string[]; assumptions: string[]; confidence: number; moveAnalyses: { index: number; seat: string; summary: string; impact: string }[] };
type ChatMessage = { role: "user" | "assistant"; content: string };
type ThreadItem =
  | { id: string; kind: "advice"; advice: AIAdvice; cards: Card[]; dealNumber: number }
  | { id: string; kind: "chat"; role: "user" | "assistant"; content: string };
type ReviewAction = { kind: "play" | "pass"; cards: Card[]; combination?: Combo | null; label: string };
type SeatId = "south" | "west" | "north" | "east";
type ReviewTurn = {
  index: number; played: ReviewAction; advice: ReviewAction | null; followed: boolean;
  coveredPartner: boolean; wentOut: boolean; verdict: string; note: string; hand?: Card[];
};
type ReviewDeal = {
  number: number; finished: string[]; winnerTeam: "you" | "opponent" | null; yourTeamWon: boolean | null;
  kind: string | null; levelGain: number; yourLevel: string; opponentLevel: string; matchOver: boolean;
  yourFinish: string | null; levelRank?: string; openingHands?: Record<SeatId, Card[]>;
  history: Action[]; yourTurns: ReviewTurn[]; open?: boolean;
};
type Review = {
  deals: ReviewDeal[];
  summary: { yourTurns: number; followed: number; advised: number; partnerCovers: number; headline: string; detail: string };
};
type SavedMatch = {
  id: string; createdAt: string; winnerTeam: "you" | "opponent" | null; yourLevel: string | null;
  opponentLevel: string | null; gameOver: boolean; headline: string; review?: Review;
};
type Game = {
  id: string; game: "guandan"; levelRank: string; yourSeat: "south"; yourHand: Card[];
  counts: Record<"south" | "west" | "north" | "east", number>;
  turn: "south" | "west" | "north" | "east"; currentPlay?: Action;
  history: Action[]; finished: string[]; gameOver: boolean; createdAt: string;
  waitingForHuman: boolean; legalActions: LegalAction[]; dealNumber: number;
  playTeam: "you" | "opponent"; yourLevel: string; opponentLevel: string;
  winnerTeam: "you" | "opponent" | null; lastDeal: LastDeal | null; review: Review;
  settings: { seed: number | null; opponentPolicy: string };
};

const seats = [
  { id: "north", label: "对家", role: "队友", className: "north" },
  { id: "west", label: "上家", role: "对方", className: "west" },
  { id: "east", label: "下家", role: "对方", className: "east" },
  { id: "south", label: "你", role: "人类", className: "south" },
] as const;
const seatLabels: Record<string, string> = { south: "你", west: "上家", north: "对家", east: "下家" };
const finishLabels = ["头游", "二游", "三游", "末游"];
const kindLabels: Record<string, string> = { double_up: "双上", first_third: "头游三游", first_fourth: "头游末游" };

function cardCode(card: Card) { return card.id.split(":")[1]; }
function sortedCodes(codes: string[]) { return [...codes].sort().join(","); }
const verdictClass: Record<string, string> = { 压对家: "bad", 一致: "good", 不同: "diff", 走牌: "out", 自打: "solo" };

function comboLabel(value?: string) {
  const labels: Record<string, string> = {
    single: "单张", pair: "对子", triple: "三张", full_house: "三带二", straight: "顺子",
    consecutive_pairs: "三连对", consecutive_triples: "钢板", straight_flush: "同花顺",
    rank_bomb: "炸弹", joker_bomb: "四王",
  };
  return labels[value ?? ""] ?? "出牌";
}

export function CoachLab() {
  const api = apiUrl;
  const [game, setGame] = useState<Game | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [coachLoading, setCoachLoading] = useState(false);
  const [aiAdvice, setAIAdvice] = useState<AIAdvice | null>(null);
  const [copilotTab, setCopilotTab] = useState<"coach" | "history">("coach");
  const [reviewOpen, setReviewOpen] = useState(false);
  const [savedMatches, setSavedMatches] = useState<SavedMatch[]>([]);
  const [archive, setArchive] = useState<SavedMatch | null>(null);
  const [thread, setThread] = useState<ThreadItem[]>([]);
  const [chatDraft, setChatDraft] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [dealSeed, setDealSeed] = useState("");
  const [autoCoach, setAutoCoach] = useState(true);
  const [confirmPlay, setConfirmPlay] = useState(false);
  const [compactCards, setCompactCards] = useState(false);
  const [reasoningEffort, setReasoningEffort] = useState("medium");
  const [coachingStyle, setCoachingStyle] = useState("detailed");
  const [error, setError] = useState("");
  const [seatPlays, setSeatPlays] = useState<Partial<Record<Game["turn"], Action>>>({});
  const [aiThinkingSeat, setAIThinkingSeat] = useState<Game["turn"] | null>(null);
  const [dealNotice, setDealNotice] = useState<LastDeal | null>(null);
  const coachPanelRef = useRef<HTMLDivElement>(null);
  const coachTurnKey = useRef("");
  const hintIndex = useRef(0);
  const dragMode = useRef<"select" | "deselect" | null>(null);
  const dragged = useRef(new Set<string>());

  const dealCards = useCallback(async () => {
    setLoading(true); setError(""); setSelected([]); setAIAdvice(null); setThread([]); setSeatPlays({}); setDealNotice(null); setReviewOpen(false); setArchive(null); setCopilotTab("coach");
    coachTurnKey.current = "";
    try {
      const response = await fetch(`${api}/v1/games/guandan/deals`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ opponentPolicy: "danzero", seed: dealSeed === "" ? null : Number(dealSeed) }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "无法开局");
      setGame(body);
      hintIndex.current = 0;
      void requestCoach(body);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "无法开局");
    } finally {
      setLoading(false);
    }
  }, [api, autoCoach, dealSeed]);

  const loadSavedMatches = useCallback(async () => {
    try {
      const response = await fetch(`${api}/v1/games/guandan/matches`);
      const body = await response.json();
      if (response.ok) setSavedMatches(body.matches ?? []);
    } catch {
      setSavedMatches([]);
    }
  }, [api]);

  useEffect(() => { void loadSavedMatches(); }, [loadSavedMatches]);
  useEffect(() => { if (game?.gameOver) void loadSavedMatches(); }, [game?.gameOver, loadSavedMatches]);

  async function openSavedMatch(id: string) {
    try {
      const response = await fetch(`${api}/v1/games/guandan/matches/${id}`);
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "找不到这局复盘");
      setArchive(body);
      setReviewOpen(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "找不到这局复盘");
    }
  }

  useEffect(() => {
    if (copilotTab !== "coach" || (thread.length === 0 && !chatLoading && !coachLoading)) return;
    const frame = requestAnimationFrame(() => {
      const panel = coachPanelRef.current;
      panel?.scrollTo({ top: panel.scrollHeight, behavior: "smooth" });
    });
    return () => cancelAnimationFrame(frame);
  }, [thread, chatLoading, coachLoading, copilotTab]);

  useEffect(() => {
    if (!game || game.gameOver || game.waitingForHuman) {
      setAIThinkingSeat(null);
      return;
    }
    let cancelled = false;
    const actingSeat = game.turn === "south" ? null : game.turn;
    setAIThinkingSeat(actingSeat);
    const delay = 850;
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch(`${api}/v1/games/guandan/deals/${game.id}/ai-actions`, { method: "POST" });
        const body = await response.json();
        if (!response.ok) throw new Error(body.error ?? "AI 出牌失败");
        if (cancelled) return;
        placeLatestAction(game, body);
        setGame(body);
        if (body.waitingForHuman) void requestCoach(body);
      } catch (caught) {
        if (!cancelled) setError(caught instanceof Error ? caught.message : "AI 出牌失败");
      } finally {
        if (!cancelled) setAIThinkingSeat(null);
      }
    }, delay);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [api, game?.id, game?.history.length, game?.turn, game?.waitingForHuman, game?.dealNumber, game?.gameOver]);

  useEffect(() => {
    if (!autoCoach || !game?.waitingForHuman || game.gameOver) return;
    void requestCoach(game);
  }, [autoCoach, game?.id, game?.waitingForHuman, game?.history.length, game?.dealNumber]);

  function placeLatestAction(previous: Game, next: Game) {
    if (next.gameOver) setReviewOpen(true);
    if (next.lastDeal && next.lastDeal.number !== (previous.lastDeal?.number ?? -1)) {
      setDealNotice(next.lastDeal);
      setSeatPlays({});
      setSelected([]);
      setAIAdvice(null);
      hintIndex.current = 0;
    }
    if (next.dealNumber !== previous.dealNumber) {
      setSeatPlays({});
      const action = next.history.at(-1);
      if (action) setSeatPlays({ [action.seat]: action });
      return;
    }
    const action = next.history.at(-1);
    if (!action) return;
    setSeatPlays((current) => ({ ...(previous.currentPlay ? current : {}), [action.seat]: action }));
  }

  async function act(pass: boolean, cards: string[] = selected) {
    if (!game) return;
    setLoading(true); setError("");
    if (confirmPlay && !window.confirm(pass ? "确定不出？" : `打出 ${cards.length} 张牌？`)) {
      setLoading(false);
      return;
    }
    try {
      const response = await fetch(`${api}/v1/games/guandan/deals/${game.id}/actions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cardIds: pass ? [] : cards, pass }),
      });
      const body = await response.json();
      if (response.status === 404 && body.error === "game not found") {
        await dealCards();
        setError("上一局因服务重启失效，已重新开局。");
        return;
      }
      if (!response.ok) throw new Error(body.error ?? "出牌不合法");
      placeLatestAction(game, body);
      setGame(body);
      setSelected([]);
      setAIAdvice(null);
      hintIndex.current = 0;
      void requestCoach(body);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "出牌不合法");
    } finally {
      setLoading(false);
    }
  }

  async function requestCoach(nextGame: Game, force = false) {
    if (!nextGame.waitingForHuman || nextGame.gameOver || (!autoCoach && !force)) return;
    const turnKey = `${nextGame.id}:${nextGame.dealNumber}:${nextGame.history.length}`;
    if (!force && coachTurnKey.current === turnKey) return;
    coachTurnKey.current = turnKey;
    setCoachLoading(true);
    try {
      const response = await fetch(`${api}/v1/games/guandan/deals/${nextGame.id}/coach`, { method: "POST" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "教练暂不可用");
      const cards = body.cardIds.map((id: string) => nextGame.yourHand.find((card) => card.id === id)).filter((card: Card | undefined): card is Card => Boolean(card));
      setAIAdvice(body);
      setThread((current) => [...current, { id: `${turnKey}:${current.length}`, kind: "advice", advice: body, cards, dealNumber: nextGame.dealNumber }]);
    } catch (caught) {
      if (coachTurnKey.current === turnKey) coachTurnKey.current = "";
      if (force || autoCoach) setError(caught instanceof Error ? caught.message : "教练暂不可用");
    } finally {
      setCoachLoading(false);
    }
  }

  async function askAICoach() { if (game) await requestCoach(game, true); }

  async function sendCopilotMessage(message = chatDraft) {
    const clean = message.trim();
    if (!game || !clean || chatLoading) return;
    const history = thread.flatMap((item) => item.kind === "chat" ? [{ role: item.role, content: item.content }] : []);
    const userItem: ThreadItem = { id: `chat-${thread.length}-user`, kind: "chat", role: "user", content: clean };
    setThread((current) => [...current, userItem]);
    setChatDraft("");
    setChatLoading(true);
    try {
      const response = await fetch(`${api}/v1/games/guandan/deals/${game.id}/copilot/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: clean, conversation: history, reasoningEffort, coachingStyle }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "教练暂时答不上来");
      setThread((current) => [...current, { id: `chat-${current.length}-assistant`, kind: "chat", role: "assistant", content: body.content }]);
    } catch (caught) {
      setThread((current) => [...current, { id: `chat-${current.length}-error`, kind: "chat", role: "assistant", content: caught instanceof Error ? caught.message : "教练暂时答不上来" }]);
    } finally {
      setChatLoading(false);
    }
  }

  const legalActions = game?.legalActions ?? [];
  const canPass = legalActions.some((action) => action.kind === "pass");
  const playActions = legalActions.filter((action): action is LegalAction & { codes: string[] } => action.kind === "play" && Boolean(action.codes));
  const matchedAction = useMemo(() => {
    if (!game || selected.length === 0) return null;
    const selectedKey = sortedCodes(selected.map((id) => game.yourHand.find((card) => card.id === id)).filter((card): card is Card => Boolean(card)).map(cardCode));
    return playActions.find((action) => sortedCodes(action.codes) === selectedKey) ?? null;
  }, [game, playActions, selected]);

  function applyCard(id: string, mode: "select" | "deselect") {
    setSelected((current) => {
      if (mode === "select") return current.includes(id) ? current : [...current, id];
      return current.filter((item) => item !== id);
    });
  }

  function cardIdAtPoint(x: number, y: number) {
    const node = document.elementFromPoint(x, y)?.closest("[data-card-id]");
    return node instanceof HTMLElement ? node.dataset.cardId ?? null : null;
  }

  function startDrag(event: React.PointerEvent<HTMLDivElement>) {
    if (!game?.waitingForHuman) return;
    const id = cardIdAtPoint(event.clientX, event.clientY);
    if (!id) return;
    event.preventDefault();
    try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* ignore */ }
    const mode = selected.includes(id) ? "deselect" : "select";
    dragMode.current = mode;
    dragged.current = new Set([id]);
    applyCard(id, mode);
  }

  function moveDrag(event: React.PointerEvent<HTMLDivElement>) {
    if (!dragMode.current) return;
    const id = cardIdAtPoint(event.clientX, event.clientY);
    if (!id || dragged.current.has(id)) return;
    dragged.current.add(id);
    applyCard(id, dragMode.current);
  }

  function endDrag() {
    dragMode.current = null;
    dragged.current = new Set();
  }

  function cycleHint() {
    if (!game || playActions.length === 0) return;
    const action = playActions[hintIndex.current % playActions.length];
    hintIndex.current += 1;
    const remaining = [...action.codes];
    const ids: string[] = [];
    for (const card of game.yourHand) {
      const code = cardCode(card);
      const index = remaining.indexOf(code);
      if (index >= 0) {
        ids.push(card.id);
        remaining.splice(index, 1);
      }
    }
    setSelected(ids);
  }

  const yourTurn = Boolean(game?.waitingForHuman && !game.gameOver);
  const coachCards = aiAdvice?.cardIds.map((id) => game?.yourHand.find((card) => card.id === id)).filter((card): card is Card => Boolean(card)) ?? [];
  const handGroups = game?.yourHand.reduce<Card[][]>((groups, card) => {
    const current = groups.at(-1);
    if (current?.[0]?.rank === card.rank) current.push(card); else groups.push([card]);
    return groups;
  }, []) ?? [];
  const selectedIllegal = yourTurn && selected.length > 0 && !matchedAction;
  const tablePlay = game?.currentPlay;
  const statusText = game?.gameOver
    ? (game.winnerTeam === "you" ? "你们过级获胜" : "对家过级获胜")
    : yourTurn
      ? "轮到你出牌"
      : `${seatLabels[game?.turn ?? ""] ?? "AI"} ${aiThinkingSeat ? "思考中" : "出牌中"}`;

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (!yourTurn || loading) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("textarea, input, select")) return;
      if (event.key === "Enter" && matchedAction) {
        event.preventDefault();
        void act(false);
      }
      if (event.key === "Escape") {
        event.preventDefault();
        setSelected([]);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [yourTurn, loading, matchedAction]);

  const review = game?.review ?? archive?.review;
  if (reviewOpen && review) {
    return <ReviewView
      review={review}
      gameOver={game?.gameOver ?? Boolean(archive?.gameOver)}
      winner={game?.winnerTeam ?? archive?.winnerTeam ?? null}
      onClose={() => { setReviewOpen(false); setArchive(null); }}
      onReplay={() => void dealCards()}
    />;
  }

  return <main className="arena">
    <div className="playWorkspace">
      <section className={`gameArea ${compactCards ? "compactCards" : ""}`} aria-label="掼蛋牌桌">
        <header>
          <Brand />
          <div className="dealBar">
            <b>{game ? statusText : "准备开局"}</b>
            <span>{game ? `第 ${game.dealNumber} 副 · 打 ${game.levelRank} · 我方 ${game.yourLevel} / 对方 ${game.opponentLevel}` : "你坐南家，对家是队友"}</span>
          </div>
          <div className="headerActions">
            <button className="settingsToggle" aria-label="怎么打" aria-expanded={helpOpen} onClick={() => { setHelpOpen((open) => !open); setSettingsOpen(false); }}>?</button>
            <button className="settingsToggle" aria-label="对局设置" aria-expanded={settingsOpen} onClick={() => { setSettingsOpen((open) => !open); setHelpOpen(false); }}>⚙</button>
            {game && Boolean(game.review?.deals.length) && <button className="secondary" type="button" onClick={() => setReviewOpen(true)}>复盘</button>}
            {game && <button className="secondary" type="button" disabled={loading || Boolean(aiThinkingSeat)} onClick={() => void dealCards()}>重新开局</button>}
          </div>
        </header>
        <div className="table">
          {seats.map((seat) => (
            <Player
              key={seat.id}
              className={seat.className}
              label={seat.label}
              role={seat.role}
              count={game?.counts[seat.id] ?? 0}
              active={game?.turn === seat.id}
              thinking={aiThinkingSeat === seat.id}
              action={seatPlays[seat.id]}
              finish={game?.finished.indexOf(seat.id) ?? -1}
            />
          ))}
          <SeatPlay action={yourTurn ? undefined : seatPlays.south} className="southPlay" />
          <div className="tableCenter">
            <b>{tablePlay ? comboLabel(tablePlay.combination?.type) : "任意合法牌型领出"}</b>
            <span>{tablePlay ? `${seatLabels[tablePlay.seat]} 控牌` : "新一轮"}</span>
          </div>
          <div className="tableHand">
            <div className="tableActions">
              <button className="secondary" disabled={!yourTurn || loading || playActions.length === 0} onClick={cycleHint}>提示</button>
              <button className="secondary" disabled={!yourTurn || loading || !canPass} onClick={() => void act(true)}>不出</button>
              <button className="primary" disabled={!yourTurn || loading || !matchedAction} onClick={() => void act(false)}>{loading ? "出牌中…" : "出牌"}</button>
            </div>
            {game && game.counts.south === 0 && !game.gameOver ? <p className="handEmpty">你已经出完，等待本副结束</p> : (
              <div className="hand" aria-label="你的手牌" onPointerDown={startDrag} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={endDrag}>
                {handGroups.map((cards) => (
                  <div className="cardStack" key={cards[0].rank}>
                    {cards.map((card) => (
                      <CardButton
                        card={card}
                        wild={card.rank === game?.levelRank && card.suit === "♥"}
                        recommended={aiAdvice?.cardIds.includes(card.id) ?? false}
                        selected={selected.includes(card.id)}
                        key={card.id}
                        disabled={!yourTurn}
                        onToggle={() => applyCard(card.id, selected.includes(card.id) ? "deselect" : "select")}
                      />
                    ))}
                  </div>
                ))}
              </div>
            )}
            {selectedIllegal && <p className="playHint">这手不是当前合法牌型。点「提示」轮换可出组合，Esc 取消选择。</p>}
            {yourTurn && matchedAction && <p className="playHint">已选 {comboLabel(matchedAction.combination?.type)}，回车出牌。</p>}
            {yourTurn && selected.length === 0 && !coachLoading && <p className="playHint">点选或滑动选牌。教练只标黄，不会替你出。</p>}
          </div>
        </div>
        {dealNotice && !game?.gameOver && (
          <div className="tableOverlay" role="status">
            <div>
              <small>第 {dealNotice.number} 副结束</small>
              <h2>{dealNotice.yourTeamWon ? "我方升过这副" : "对方升过这副"}</h2>
              <p>{kindLabels[dealNotice.kind] ?? "本副结束"}，升 {dealNotice.levelGain} 级。进贡已自动完成。</p>
              <p>完成顺序：{dealNotice.finished.map((seat, index) => `${finishLabels[index]} ${seatLabels[seat]}`).join(" · ")}</p>
              <div className="overlayActions">
                <button className="secondary" type="button" onClick={() => { setDealNotice(null); setReviewOpen(true); }}>先看复盘</button>
                <button className="primary" type="button" onClick={() => setDealNotice(null)}>继续下一副</button>
              </div>
            </div>
          </div>
        )}
        {game?.gameOver && (
          <div className="resultBar" role="status">
            <div>
              <b>{game.winnerTeam === "you" ? "你们过级获胜" : "对方过级获胜"}</b>
              <span>{game.review?.summary.headline ?? `我方 ${game.yourLevel} · 对方 ${game.opponentLevel}`}</span>
            </div>
            <button className="secondary" type="button" onClick={() => setReviewOpen(true)}>看复盘</button>
            <button className="primary" type="button" disabled={loading} onClick={() => void dealCards()}>再来一局</button>
          </div>
        )}
        {error && <p className="error" role="alert"><span>{error}</span><button type="button" onClick={() => setError("")} aria-label="关闭">×</button></p>}
        {!game && (
          <div className="lobby" role="dialog" aria-labelledby="lobby-title">
            <div className="lobbyCard">
              <i className="brandMark lg" aria-hidden="true" />
              <small>OPENCARDS</small>
              <h1 id="lobby-title">坐下，打一局掼蛋</h1>
              <p>你坐南家，对家是队友。三个电脑座位都是 DanZero，教练看着公开牌面给建议。</p>
              <button className="primary" type="button" disabled={loading} onClick={() => void dealCards()}>{loading ? "正在发牌…" : "开始对局"}</button>
              <button className="textLink" type="button" onClick={() => setHelpOpen(true)}>先看怎么打</button>
              {savedMatches.length > 0 && (
                <div className="savedMatches">
                  <small>最近对局</small>
                  {savedMatches.map((item) => (
                    <button type="button" key={item.id} onClick={() => void openSavedMatch(item.id)}>
                      <b>{item.gameOver ? (item.winnerTeam === "you" ? "获胜" : item.winnerTeam === "opponent" ? "失利" : "结束") : "进行中"}</b>
                      <span>{item.headline}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
        {helpOpen && (
          <div className="helpSheet" role="dialog" aria-labelledby="help-title">
            <div>
              <small>怎么打</small>
              <h2 id="help-title">选牌、跟牌、听教练</h2>
              <ol>
                <li>点选或滑动选牌，合法组合才会点亮「出牌」。</li>
                <li>跟牌必须压过当前牌型，否则点「不出」。</li>
                <li>「提示」轮换当前能出的牌；右侧建议只作参考，点「打出建议」才出。</li>
                <li>打过 A 的一方获胜。复盘是单独一桌，四家手牌都会摊开，可以一手一手回放。</li>
              </ol>
              <button className="primary" type="button" onClick={() => setHelpOpen(false)}>知道了</button>
            </div>
          </div>
        )}
        {settingsOpen && <section className="gameSettings" aria-label="对局设置">
          <label>教练讲解<select value={coachingStyle} onChange={(event) => setCoachingStyle(event.target.value)}><option value="direct">直接</option><option value="detailed">详细</option><option value="socratic">追问</option></select></label>
          <label><input type="checkbox" checked={autoCoach} onChange={(event) => { setAutoCoach(event.target.checked); if (!event.target.checked) setAIAdvice(null); }} />每手自动给建议</label>
          <label><input type="checkbox" checked={confirmPlay} onChange={(event) => setConfirmPlay(event.target.checked)} />出牌前确认</label>
          <label><input type="checkbox" checked={compactCards} onChange={(event) => setCompactCards(event.target.checked)} />紧凑手牌</label>
          <details>
            <summary>高级</summary>
            <label>讲解深度<select value={reasoningEffort} onChange={(event) => setReasoningEffort(event.target.value)}><option value="low">快</option><option value="medium">均衡</option><option value="high">深入</option></select></label>
            <label>重放种子<input inputMode="numeric" value={dealSeed} onChange={(event) => setDealSeed(event.target.value.replace(/\D/g, ""))} placeholder="随机" /></label>
          </details>
          <button className="primary" onClick={() => { setSettingsOpen(false); void dealCards(); }}>{game ? "按此设置重开" : "按此设置开局"}</button>
        </section>}
      </section>
      <aside className="copilot" aria-label="教练">
        <div className="copilotTabs">
          <button className={copilotTab === "coach" ? "active" : ""} onClick={() => setCopilotTab("coach")}>教练</button>
          <button className={copilotTab === "history" ? "active" : ""} onClick={() => setCopilotTab("history")}>记录 <small>{game?.history.length ?? 0}</small></button>
        </div>
        {copilotTab === "coach" ? <>
          <div className="coachPanel" ref={coachPanelRef}>
            {thread.length === 0 && !coachLoading && <div className="coachEmpty">{game ? (autoCoach ? "轮到你时会自动给出建议。" : <button className="secondary" onClick={() => void askAICoach()}>看这一手怎么打</button>) : "开局之后，这里会告诉你这一手更稳妥的打法。"}</div>}
            <div className="chatThread">
              {thread.map((item) => item.kind === "advice"
                ? <AdviceMessage key={item.id} item={item} />
                : <div className={`chatMessage ${item.role}`} key={item.id}>{item.role === "assistant" ? <div className="md"><ReactMarkdown>{item.content}</ReactMarkdown></div> : item.content}</div>)}
              {coachLoading && <div className="coachThinking"><i /><span>正在看这一手怎么打…</span></div>}
              {chatLoading && <div className="chatMessage assistant">正在想…</div>}
            </div>
          </div>
          {aiAdvice && <div className="coachQuickActions">{aiAdvice.cardIds.length === 0 ? <button className="primary" onClick={() => void act(true)}>按建议不出</button> : <><button className="secondary" onClick={() => setSelected(aiAdvice.cardIds)}>高亮</button><button className="primary" onClick={() => void act(false, aiAdvice.cardIds)}>打出建议</button></>}</div>}
          <form className="copilotComposer" onSubmit={(event) => { event.preventDefault(); void sendCopilotMessage(); }}>
            <textarea aria-label="问教练" rows={2} value={chatDraft} onChange={(event) => setChatDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void sendCopilotMessage(); } }} placeholder="问这一手怎么打…" />
            <button type="submit" aria-label="发送" disabled={!chatDraft.trim() || chatLoading}>↑</button>
          </form>
        </> : <section className="history" aria-label="出牌记录">
          <div className="actionLog">{game?.history.map((action) => <div className="logRow" key={action.index}><span>#{action.index}</span><b>{seatLabels[action.seat]}</b>{action.kind === "pass" ? <i>不出</i> : <><em>{comboLabel(action.combination?.type)}</em><div className="playedCards">{action.cards?.map((card) => <MiniCard card={card} key={card.id} />)}</div></>}</div>)}</div>
        </section>}
      </aside>
    </div>
  </main>;
}

function takeCodes(hand: Card[], codes: string[]) {
  const left = [...hand];
  for (const code of codes) {
    const index = left.findIndex((card) => cardCode(card) === code);
    if (index >= 0) left.splice(index, 1);
  }
  return left;
}

function markedIds(hand: Card[], codes: string[]) {
  const left = [...codes];
  const ids = new Set<string>();
  for (const card of hand) {
    const index = left.indexOf(cardCode(card));
    if (index >= 0) {
      ids.add(card.id);
      left.splice(index, 1);
    }
  }
  return ids;
}

function groupHand(hand: Card[]) {
  return hand.reduce<Card[][]>((groups, card) => {
    const current = groups.at(-1);
    if (current?.[0]?.rank === card.rank) current.push(card); else groups.push([card]);
    return groups;
  }, []);
}

function handsBefore(deal: ReviewDeal, index: number): Record<SeatId, Card[]> {
  const opening = deal.openingHands ?? { south: [], west: [], north: [], east: [] };
  const hands: Record<SeatId, Card[]> = {
    south: [...(opening.south ?? [])],
    west: [...(opening.west ?? [])],
    north: [...(opening.north ?? [])],
    east: [...(opening.east ?? [])],
  };
  for (const action of deal.history) {
    if (action.index >= index) break;
    if (action.kind !== "play" || !action.cards?.length) continue;
    const seat = action.seat as SeatId;
    hands[seat] = takeCodes(hands[seat], action.cards.map(cardCode));
  }
  return hands;
}

function ReviewView({ review, gameOver, winner, onClose, onReplay }: {
  review: Review; gameOver: boolean; winner: "you" | "opponent" | null;
  onClose: () => void; onReplay: () => void;
}) {
  const deals = review.deals.filter((item) => item.history.length || item.openingHands);
  const lastDeal = deals.at(-1);
  const [dealNumber, setDealNumber] = useState(lastDeal?.number ?? 1);
  const deal = deals.find((item) => item.number === dealNumber) ?? lastDeal;
  const [step, setStep] = useState(Math.max(deal?.history.length ?? 1, 1));
  const total = Math.max(deal?.history.length ?? 1, 1);

  function go(delta: number) {
    if (!deal) return;
    const next = step + delta;
    if (next < 1) {
      const previous = deals[deals.findIndex((item) => item.number === deal.number) - 1];
      if (previous) { setDealNumber(previous.number); setStep(Math.max(previous.history.length, 1)); }
      return;
    }
    if (next > total) {
      const following = deals[deals.findIndex((item) => item.number === deal.number) + 1];
      if (following) { setDealNumber(following.number); setStep(1); }
      return;
    }
    setStep(next);
  }

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "ArrowLeft") { event.preventDefault(); go(-1); }
      if (event.key === "ArrowRight") { event.preventDefault(); go(1); }
      if (event.key === "Escape" && !gameOver) onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (!deal) {
    return <main className="arena reviewArena"><div className="reviewEmptyPage">这一局还没有可以回放的出牌。<button className="secondary" type="button" onClick={onClose}>回到牌桌</button></div></main>;
  }

  const action = deal.history[Math.min(step, total) - 1];
  const hands = handsBefore(deal, action?.index ?? 1);
  const playedIds = action?.kind === "play" ? markedIds(hands[action.seat as SeatId] ?? [], (action.cards ?? []).map(cardCode)) : new Set<string>();
  const turn = deal.yourTurns.find((item) => item.index === action?.index);
  const adviceIds = turn?.advice?.cards?.length ? markedIds(hands.south, turn.advice.cards.map(cardCode)) : new Set<string>();
  const finished = (Object.keys(hands) as SeatId[]).filter((seat) => hands[seat].length === 0 && deal.history.some((item) => item.seat === seat && item.index < (action?.index ?? 1) && item.kind === "play"));

  return <main className="arena reviewArena" aria-label="复盘">
    <header className="reviewHeader">
      <Brand />
      <div className="dealBar">
        <b>{gameOver ? (winner === "you" ? "复盘 · 你们过级获胜" : "复盘 · 对方过级获胜") : "复盘"}</b>
        <span>第 {deal.number} 副 · 打 {deal.levelRank ?? "2"} · {action ? `${seatLabels[action.seat]} ${action.kind === "pass" ? "不出" : comboLabel(action.combination?.type)}` : "起手"} · {step}/{total}</span>
      </div>
      <div className="headerActions">
        <button className="secondary" type="button" onClick={onClose}>{gameOver ? "看结果" : "回到牌桌"}</button>
        <button className="primary" type="button" onClick={onReplay}>再来一局</button>
      </div>
    </header>
    <div className="reviewTable">
      {seats.filter((seat) => seat.id !== "south").map((seat) => (
        <div className={`reviewSeat ${seat.className} ${action?.seat === seat.id ? "activePlayer" : ""}`} key={seat.id}>
          <div className="reviewSeatMeta">
            <b>{seat.label}</b>
            <span>{hands[seat.id].length} 张</span>
            <em>{finished.includes(seat.id) ? "已出完" : action?.seat === seat.id ? "这一手" : seat.role}</em>
          </div>
          <div className="reviewSeatHand">{hands[seat.id].map((card) => <MiniCard card={card} key={card.id} played={playedIds.has(card.id)} />)}</div>
        </div>
      ))}
      <div className="tableCenter">
        <b>{action ? (action.kind === "pass" ? "不出" : comboLabel(action.combination?.type)) : "起手"}</b>
        <span>{action ? `${seatLabels[action.seat]} 第 ${action.index} 手` : "还没出牌"}</span>
        {action?.kind === "play" && <div className="playedCards reviewCenterCards">{action.cards?.map((card) => <MiniCard card={card} key={card.id} />)}</div>}
      </div>
      <div className="reviewSouth">
        <div className="reviewSeatMeta">
          <b>你</b>
          <span>{hands.south.length} 张</span>
          <em>{finished.includes("south") ? "已出完" : action?.seat === "south" ? "这一手" : "南家"}</em>
        </div>
        <div className="hand reviewSouthHand" aria-label="复盘时你的手牌">
          {groupHand(hands.south).map((cards) => (
            <div className="cardStack" key={cards[0].rank}>
              {cards.map((card) => (
                <CardButton
                  card={card}
                  wild={card.rank === deal.levelRank && card.suit === "♥"}
                  recommended={adviceIds.has(card.id)}
                  selected={playedIds.has(card.id)}
                  key={card.id}
                  disabled
                  onToggle={() => undefined}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
    <footer className="reviewDock">
      <div className="reviewDockCopy">
        <small>{review.summary.headline}</small>
        {turn ? <p><b>{turn.verdict}</b> {turn.note}{turn.advice && !turn.followed ? ` 教练：${turn.advice.label}` : ""}</p> : <p>{action ? `${seatLabels[action.seat]}${action.kind === "pass" ? "不出。" : `出了 ${comboLabel(action.combination?.type)}。`}` : review.summary.detail}</p>}
      </div>
      <div className="reviewDockActions">
        {deals.length > 1 && <label>副<select value={deal.number} onChange={(event) => { setDealNumber(Number(event.target.value)); setStep(1); }}>{deals.map((item) => <option key={item.number} value={item.number}>第 {item.number} 副</option>)}</select></label>}
        <button className="secondary" type="button" disabled={step <= 1 && deal.number === deals[0]?.number} onClick={() => go(-1)}>上一手</button>
        <button className="primary" type="button" disabled={step >= total && deal.number === deals.at(-1)?.number} onClick={() => go(1)}>下一手</button>
      </div>
    </footer>
  </main>;
}

function Player({ className, label, role, count, active, thinking, action, finish }: { className: string; label: string; role: string; count: number; active: boolean; thinking: boolean; action?: Action; finish: number }) {
  return <div className={`player ${className} ${active ? "activePlayer" : ""}`}>
    <b>{label}</b>
    <span>{count} 张</span>
    <em>{finish >= 0 ? finishLabels[finish] : thinking ? "思考中…" : active ? "出牌" : role}</em>
    <SeatPlay action={action} />
  </div>;
}
function SeatPlay({ action, className = "" }: { action?: Action; className?: string }) {
  if (!action) return null;
  return <div className={`seatPlay ${className}`} key={action.index}>{action.kind === "pass" ? <i>不出</i> : action.cards?.map((card) => <MiniCard card={card} key={card.id} />)}</div>;
}
function CardButton({ card, wild, recommended, selected, disabled, onToggle }: { card: Card; wild: boolean; recommended: boolean; selected: boolean; disabled: boolean; onToggle: () => void }) {
  const red = card.suit === "♥" || card.suit === "♦", joker = card.suit === "★", goldJoker = joker && card.rank === "RJ";
  const mark = jokerMark(card);
  return <button type="button" data-card-id={card.id} disabled={disabled} aria-pressed={selected} aria-label={`${joker ? (goldJoker ? "大王" : "小王") : `${card.rank} ${card.suit}`}${wild ? " 逢人配" : ""}`} className={`playingCard ${red ? "red" : ""} ${joker ? "joker" : ""} ${goldJoker ? "goldJoker" : ""} ${wild ? "wild" : ""} ${recommended ? "recommended" : ""}`} onKeyDown={(event) => {
    if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onToggle(); }
  }}>
    <span>{joker ? mark : card.rank}{!joker && <i>{card.suit}</i>}</span>
    <i>{joker ? mark : card.suit}</i>
    {wild && <small>逢人配</small>}
  </button>;
}
function AdviceMessage({ item }: { item: Extract<ThreadItem, { kind: "advice" }> }) {
  return (
    <div className="chatMessage assistant advice">
      <small>第 {item.dealNumber} 副 · 这一手</small>
      <h3>{item.advice.cardIds.length === 0 ? "建议不出" : `建议出 ${item.cards.map(cardText).join(" ")}`}</h3>
      {item.cards.length > 0 && <div className="recommendedCards">{item.cards.map((card) => <MiniCard card={card} key={card.id} />)}</div>}
      {item.advice.rationale && <p>{item.advice.rationale}</p>}
      {item.advice.alternatives.length > 0 && <ul>{item.advice.alternatives.map((entry) => <li key={entry}>{entry}</li>)}</ul>}
    </div>
  );
}

function MiniCard({ card, played = false }: { card: Card; played?: boolean }) {
  const joker = card.suit === "★";
  const tone = joker ? (card.rank === "RJ" ? "gold" : "silver") : (card.suit === "♥" || card.suit === "♦") ? "red" : "";
  const mark = jokerMark(card);
  return (
    <span className={`miniCard ${tone}${played ? " playedNow" : ""}`}>
      <b>{joker ? mark : card.rank}</b>
      <i>{joker ? mark : card.suit}</i>
    </span>
  );
}
function jokerMark(card: Card) { return card.rank === "RJ" ? "★" : "☆"; }
function cardText(card: Card) { return card.suit === "★" ? jokerMark(card) : `${card.rank}${card.suit}`; }
