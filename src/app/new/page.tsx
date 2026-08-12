"use client";

import { FormEvent, useEffect, useState } from "react";
import { LanguageSwitch, useLocale } from "../../ui/use-locale";

type Candidate = { date: string; time: string };

const copy = {
  fi: { brand: "milloin", title: "Luo kysely", intro: "Valitse ajat, jaa linkki ja katso mikä sopii.", name: "Otsikko", placeholder: "Esim. saunailta", location: "Paikka (valinnainen)", duration: "Kesto", candidates: "Ehdotetut ajat", day: "Päivä", time: "Aika", add: "Lisää aika", remove: "Poista", submit: "Luo kysely", login: "Kirjaudu Googlella", auth: "Kyselyn luominen vaatii kirjautumisen.", error: "Kyselyä ei voitu luoda." },
  en: { brand: "milloin", title: "Create poll", intro: "Pick times, share the link and see what works.", name: "Title", placeholder: "e.g. sauna night", location: "Location (optional)", duration: "Duration", candidates: "Suggested times", day: "Date", time: "Time", add: "Add time", remove: "Remove", submit: "Create poll", login: "Sign in with Google", auth: "Creating a poll requires sign-in.", error: "Could not create the poll." },
};

export default function NewPollPage() {
  const { locale, setLocale } = useLocale();
  const t = copy[locale];
  const [title, setTitle] = useState("");
  const [location, setLocation] = useState("");
  const [durationMinutes, setDuration] = useState(60);
  const [candidates, setCandidates] = useState<Candidate[]>([{ date: "", time: "18:00" }]);
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/auth/session", { cache: "no-store" }).then((r) => r.json()).then((data) => setAuthenticated(data.authenticated === true)).catch(() => setAuthenticated(false));
  }, []);

  const updateCandidate = (index: number, field: keyof Candidate, value: string) =>
    setCandidates((all) => all.map((candidate, i) => (i === index ? { ...candidate, [field]: value } : candidate)));

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    if (!title.trim() || candidates.some((candidate) => !candidate.date || !candidate.time)) return;
    setBusy(true);
    try {
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "Europe/Helsinki";
      const response = await fetch("/api/v1/polls", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: title.trim(), location: location.trim() || undefined, timezone, durationMinutes }),
      });
      if (response.status === 401) { setAuthenticated(false); return; }
      if (!response.ok) throw new Error("create failed");
      const created = await response.json();
      for (const [index, candidate] of candidates.entries()) {
        const slot = await fetch(`/api/v1/polls/${created.publicToken}/slots`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ id: `slot-${index + 1}`, startsAtUtc: new Date(`${candidate.date}T${candidate.time}:00`).toISOString() }),
        });
        if (!slot.ok) throw new Error("slot failed");
      }
      window.location.assign(`/p/${created.publicToken}/admin`);
    } catch { setError(t.error); } finally { setBusy(false); }
  }

  return (
    <main className="page-shell">
      <header className="topbar"><a href="/" className="brand">{t.brand}</a><LanguageSwitch locale={locale} setLocale={setLocale} /></header>
      <section className="panel narrow">
        <h1>{t.title}</h1><p className="muted">{t.intro}</p>
        {authenticated === false ? <div className="notice"><p>{t.auth}</p><a className="primary" href="/api/auth/google/start">{t.login}</a></div> : null}
        <form onSubmit={submit} className="form-stack">
          <label>{t.name}<input aria-label={t.name} required value={title} placeholder={t.placeholder} onChange={(e) => setTitle(e.target.value)} /></label>
          <label>{t.location}<input value={location} onChange={(e) => setLocation(e.target.value)} /></label>
          <label>{t.duration}<select value={durationMinutes} onChange={(e) => setDuration(Number(e.target.value))}><option value={30}>30 min</option><option value={60}>60 min</option><option value={90}>90 min</option><option value={120}>120 min</option></select></label>
          <fieldset><legend>{t.candidates}</legend>
            <div className="candidate-list">{candidates.map((candidate, index) => <div className="candidate-row" key={index}>
              <label>{t.day} {index + 1}<input aria-label={`${t.day} ${index + 1}`} type="date" required value={candidate.date} onChange={(e) => updateCandidate(index, "date", e.target.value)} /></label>
              <label>{t.time} {index + 1}<input aria-label={`${t.time} ${index + 1}`} type="time" required value={candidate.time} onChange={(e) => updateCandidate(index, "time", e.target.value)} /></label>
              {candidates.length > 1 ? <button type="button" className="text-button danger" onClick={() => setCandidates((all) => all.filter((_, i) => i !== index))}>{t.remove}</button> : null}
            </div>)}</div>
            <button type="button" className="secondary" onClick={() => setCandidates((all) => [...all, { date: "", time: "18:00" }])}>{t.add}</button>
          </fieldset>
          {error ? <p className="error">{error}</p> : null}
          <button className="primary wide" disabled={busy || authenticated === false}>{busy ? "…" : t.submit}</button>
        </form>
      </section>
    </main>
  );
}
