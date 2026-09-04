"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";

type ImportJob = { id: string; status: string; stage: string; progress: number; message?: string; result?: { extractionStatus?: string; message?: string; observations?: unknown[]; stableCandidates?: unknown[]; metrics?: { changedFrames?: number; stableFrames?: number; paidModelCalls?: number } } };

export function ImportLab() {
  const api = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080";
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

  return <main>
    <header><b>OpenCards</b><nav><Link href="/">Play</Link><Link className="active" href="/training">Training</Link></nav><span>Training workspace</span></header>
    <section className="trainingIntro"><small>REPLAY INGESTION</small><h1>Build training material</h1><p>Submit game footage, follow local extraction, and review evidence before a replay enters the coaching library.</p></section>
    <section className="importPanel" aria-label="Video import">
      <form onSubmit={submit}><div><b>Import game video</b><span>The local worker will claim this task.</span></div><input aria-label="Bilibili video URL" value={url} onChange={(event) => setURL(event.target.value)} type="url" required/><button type="submit">Create task</button></form>
      {job && <div className="jobStatus"><span className={`statusDot ${job.status}`}/><b>{job.stage.replaceAll("_", " ")}</b><progress value={job.progress} max="1"/><span>{job.message || `Waiting for a local worker · ${job.id}`}</span>{job.result?.extractionStatus && <em>{job.result.extractionStatus.replaceAll("_", " ")}</em>}</div>}
      {job?.result && <div className="captureSummary"><b>{job.result.stableCandidates?.length ?? 0} stable plays from {job.result.observations?.length ?? 0} table changes</b><span>{job.result.message}</span><span>{job.result.metrics?.paidModelCalls ?? 0} paid AI calls</span></div>}
      {error && <p className="error">{error}. Is the Go API running?</p>}
    </section>
    <section className="captureSteps"><b>Ingestion order</b><ol><li>Reuse the local media cache when available.</li><li>Otherwise download publicly accessible media directly.</li><li>Use the authenticated browser capture only as fallback.</li></ol><p>Media stays local. Only stable table changes continue to card recognition.</p></section>
  </main>;
}
