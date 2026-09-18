import { NavLink } from "react-router";
import { FormEvent, useEffect, useState } from "react";
import { apiUrl } from "../config";

type ImportJob = { id: string; status: string; stage: string; progress: number; message?: string; result?: { extractionStatus?: string; message?: string; observations?: unknown[]; stableCandidates?: unknown[]; metrics?: { changedFrames?: number; stableFrames?: number; paidModelCalls?: number }; validation?: { status?: string; message?: string; potentialJumpCuts?: number } } };

export function ImportLab() {
  const api = apiUrl;
  const [url, setURL] = useState("https://www.bilibili.com/video/BV1Cztq6EE5G/");
  const [job, setJob] = useState<ImportJob | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!job || job.status === "completed" || job.status === "failed") return;
    const timer = window.setInterval(async () => {
      const response = await fetch(`${api}/v1/imports/${job.id}`);
      if (response.ok) setJob(await response.json());
    }, 1500);
    return () => window.clearInterval(timer);
  }, [api, job]);

  async function submit(event: FormEvent) {
    event.preventDefault(); setError("");
    try {
      const response = await fetch(`${api}/v1/imports`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ game: "guandan", source: { provider: "bilibili", url } }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Could not create import");
      setJob(body);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not create import"); }
  }

  return <main className="training">
    <header><b>OpenCards</b><nav><NavLink className={({ isActive }) => isActive ? "active" : ""} to="/">Arena</NavLink><NavLink className={({ isActive }) => isActive ? "active" : ""} to="/training">训练</NavLink></nav><span>训练台</span></header>
    <section className="trainingIntro"><small>录像接入</small><h1>整理训练素材</h1><p>提交对局录像，走本地抽取，确认证据后再进入教练库。</p></section>
    <section className="importPanel" aria-label="视频导入">
      <form onSubmit={submit}><div><b>导入对局视频</b><span>本地 worker 会领取这个任务。</span></div><input aria-label="Bilibili 视频链接" value={url} onChange={(event) => setURL(event.target.value)} type="url" required/><button type="submit">创建任务</button></form>
      {job && <div className="jobStatus"><span className={`statusDot ${job.status}`}/><b>{job.stage.replaceAll("_", " ")}</b><progress value={job.progress} max="1"/><span>{job.message || `Waiting for a local worker · ${job.id}`}</span>{job.result?.extractionStatus && <em>{job.result.extractionStatus.replaceAll("_", " ")}</em>}</div>}
      {job?.result && <div className="captureSummary"><b>{job.result.stableCandidates?.length ?? 0} stable candidates from {job.result.observations?.length ?? 0} table changes</b><span>{job.result.validation?.message ?? job.result.message}</span><span>{job.result.validation?.potentialJumpCuts ?? 0} possible jump cuts · {job.result.metrics?.paidModelCalls ?? 0} paid AI calls</span></div>}
      {error && <p className="error">{error}。API 是否在跑？</p>}
    </section>
    <section className="captureSteps"><b>接入顺序</b><ol><li>能复用本地媒体缓存就先复用。</li><li>否则直接下载公开可访问的媒体。</li><li>只有前两步不行时，才用登录后的浏览器抓取。</li></ol><p>媒体留在本地。只有稳定的桌面变化才会进入识牌。</p></section>
  </main>;
}
