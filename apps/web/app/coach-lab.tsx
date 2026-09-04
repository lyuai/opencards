"use client";

import { FormEvent, useState } from "react";

type CoachResult = {
  recommendation: string; rationale: string; alternatives: string[];
  assumptions: string[]; confidence: number; citationIds: string[]; provider: string;
};

const sample = {
  game: "guandan",
  ruleset: "competition-draft-2026-09",
  position: "Our team is level 2. I lead with 9 cards. My partner has 3 cards; opponents have 8 and 12. Known hand: 3♠ 3♥ 7♠ 7♥ 7♦ 9♣ 9♦ A♠ BJ.",
  legalActions: ["Play pair 3s", "Play pair 9s", "Play triple 7s", "Play full house 777+99", "Play single A", "Play black joker"],
  playerGoal: "Help my partner finish first without wasting control cards."
};

export function CoachLab() {
  const [position, setPosition] = useState(sample.position);
  const [goal, setGoal] = useState(sample.playerGoal);
  const [result, setResult] = useState<CoachResult | null>(null);
  const [recommendationID, setRecommendationID] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [feedbackState, setFeedbackState] = useState("");
  const api = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080";

  async function analyse(event: FormEvent) {
    event.preventDefault(); setLoading(true); setError(""); setFeedbackState("");
    try {
      const response = await fetch(`${api}/v1/coach`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...sample, position, playerGoal: goal })
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Analysis failed");
      setResult(body.result); setRecommendationID(body.id);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Analysis failed"); }
    finally { setLoading(false); }
  }

  async function correct() {
    if (!feedback.trim()) return;
    const response = await fetch(`${api}/v1/feedback`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ recommendationId: recommendationID, verdict: "incorrect", comment: feedback, suggestedAction: "" })
    });
    setFeedbackState(response.ok ? "Saved for review — it will not silently alter the rules." : "Could not save feedback.");
  }

  return <main>
    <header><p className="eyebrow">OpenCards · AI prototype</p><h1>Pause. Think. Improve.</h1>
      <p className="lede">A real coaching request grounded in engine-supplied legal actions, with explicit uncertainty and a correction loop.</p></header>
    <div className="lab">
      <form onSubmit={analyse}>
        <label>Game position<textarea value={position} onChange={e => setPosition(e.target.value)} rows={7} /></label>
        <label>Coaching goal<textarea value={goal} onChange={e => setGoal(e.target.value)} rows={3} /></label>
        <div className="actions"><span>{sample.legalActions.length} verified legal actions</span><button className="primary" disabled={loading}>{loading ? "Thinking…" : "Ask AI coach"}</button></div>
        {error && <p className="error">{error}. Is the Go API running?</p>}
      </form>
      <aside aria-live="polite">
        {!result ? <div className="empty"><span>AI</span><p>Your recommendation will appear here.</p></div> : <>
          <div className="resultHead"><span className="badge">{result.provider}</span><span>{Math.round(result.confidence * 100)}% confidence</span></div>
          <p className="label">Recommended play</p><h2 className="recommendation">{result.recommendation}</h2>
          <p className="rationale">{result.rationale}</p>
          <h3>Assumptions</h3><ul>{result.assumptions.map(item => <li key={item}>{item}</li>)}</ul>
          <p className="citations">Knowledge: {result.citationIds.join(", ")}</p>
          <div className="feedback"><label>Coach is wrong?<textarea value={feedback} onChange={e => setFeedback(e.target.value)} rows={3} placeholder="Explain the missed tactic or rule…" /></label><button onClick={correct} type="button">Submit correction</button><small>{feedbackState}</small></div>
        </>}
      </aside>
    </div>
  </main>;
}
