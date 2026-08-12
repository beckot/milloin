"use client";

import { useParams } from "next/navigation";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { LanguageSwitch, useLocale } from "../../../../ui/use-locale";

type Vote = "YES" | "NO";
type Slot = { id: string; startsAtUtc: string };
type Participant = { id: string; displayName: string; votes: Record<string, Vote> };
type Poll = { id: string; title: string; location?: string; timezone: string; durationMinutes: number; status: "OPEN" | "CLOSED"; winnerSlotId?: string; slots: Slot[]; participants: Participant[] };

const copy = {
  fi: { loading: "Ladataan…", title: "Kyselyn hallinta", share: "Osallistujalinkki", copy: "Kopioi linkki", open: "Avaa osallistujanäkymä", responses: "Vastaukset", yes: "Kyllä", winner: "Valitse voittajaksi", closed: "Kysely suljettu", reopen: "Avaa kysely uudelleen", calendar: "Lataa kalenterimerkintä", add: "Lisää aika", day: "Päivä", time: "Aika", remove: "Poista", empty: "Ei vastauksia vielä." },
  en: { loading: "Loading…", title: "Poll management", share: "Participant link", copy: "Copy link", open: "Open participant view", responses: "Responses", yes: "Yes", winner: "Select as winner", closed: "Poll closed", reopen: "Reopen poll", calendar: "Download calendar event", add: "Add time", day: "Date", time: "Time", remove: "Remove", empty: "No responses yet." },
};

const fmt = (iso: string, locale: "fi" | "en") => new Intl.DateTimeFormat(locale === "fi" ? "fi-FI" : "en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));

export default function AdminPage() {
  const params = useParams<{ token: string }>(); const token = params.token;
  const { locale, setLocale } = useLocale(); const t = copy[locale];
  const [poll, setPoll] = useState<Poll | null>(null);
  const [date, setDate] = useState(""); const [time, setTime] = useState("18:00");
  const refresh = async () => { const r = await fetch(`/api/v1/polls/${token}`, { cache: "no-store" }); if (r.ok) setPoll(await r.json()); };
  useEffect(() => { void refresh(); }, [token]);
  const counts = useMemo(() => Object.fromEntries((poll?.slots || []).map((slot) => [slot.id, poll?.participants.filter((p) => p.votes[slot.id] === "YES").length || 0])), [poll]);
  const mutate = async (path: string, method: string, body?: unknown) => { const r = await fetch(`/api/v1/polls/${token}${path}`, { method, headers: body ? { "content-type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined }); if (r.status === 401) { window.location.href = "/api/auth/google/start"; return; } if (!r.ok) throw new Error("mutation failed"); if (r.status !== 204) setPoll(await r.json()); };
  const publicUrl = typeof window === "undefined" ? `/p/${token}` : `${window.location.origin}/p/${token}`;

  async function addSlot(event: FormEvent) { event.preventDefault(); if (!date || !time) return; await mutate("/slots", "POST", { id: crypto.randomUUID(), startsAtUtc: new Date(`${date}T${time}:00`).toISOString() }); setDate(""); }
  if (!poll) return <main className="page-shell"><p>{t.loading}</p></main>;

  return <main className="page-shell"><header className="topbar"><a className="brand" href="/">milloin</a><LanguageSwitch locale={locale} setLocale={setLocale} /></header><section className="panel">
    <div className="poll-heading"><div><p className="eyebrow">{t.title}</p><h1>{poll.title}</h1></div>{poll.status === "CLOSED" ? <span className="status closed">{t.closed}</span> : null}</div>
    <div className="share-box"><strong>{t.share}</strong><code>{publicUrl}</code><div className="button-row"><button className="secondary" onClick={() => navigator.clipboard.writeText(publicUrl)}>{t.copy}</button><a className="secondary" href={`/p/${token}`}>{t.open}</a></div></div>

    {poll.status === "OPEN" ? <form className="inline-form" onSubmit={addSlot}><label>{t.day}<input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label><label>{t.time}<input type="time" value={time} onChange={(e) => setTime(e.target.value)} /></label><button className="secondary">{t.add}</button></form> : null}

    <div className="admin-slots">{poll.slots.map((slot) => <div className={poll.winnerSlotId === slot.id ? "admin-slot winner-slot" : "admin-slot"} key={slot.id}><div><strong>{fmt(slot.startsAtUtc, locale)}</strong><span>{t.yes}: {counts[slot.id] || 0}/{poll.participants.length}</span></div><div className="button-row">{poll.status === "OPEN" ? <><button className="primary small" aria-label={`${t.winner} ${fmt(slot.startsAtUtc, locale)}`} onClick={() => mutate("/winner", "POST", { slotId: slot.id })}>{t.winner}</button><button className="text-button danger" onClick={() => window.confirm(`${t.remove}?`) && mutate(`/slots/${slot.id}`, "DELETE")}>{t.remove}</button></> : null}</div></div>)}</div>

    {poll.status === "CLOSED" ? <div className="button-row final-actions"><button className="secondary" onClick={() => mutate("/reopen", "POST")}>{t.reopen}</button>{poll.winnerSlotId ? <a className="primary" href={`/api/v1/polls/${token}/calendar.ics`}>{t.calendar}</a> : null}</div> : null}

    <section className="results"><h2>{t.responses}</h2>{poll.participants.length === 0 ? <p className="muted">{t.empty}</p> : <div className="matrix-wrap"><table><thead><tr><th></th>{poll.slots.map((s) => <th key={s.id}>{fmt(s.startsAtUtc, locale)}</th>)}</tr></thead><tbody>{poll.participants.map((p) => <tr key={p.id}><th>{p.displayName}</th>{poll.slots.map((s) => <td key={s.id}>{p.votes[s.id] === "YES" ? "✓" : p.votes[s.id] === "NO" ? "×" : "·"}</td>)}</tr>)}</tbody></table></div>}</section>
  </section></main>;
}
