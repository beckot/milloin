"use client";

import { useParams } from "next/navigation";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { LanguageSwitch, useLocale } from "../../../ui/use-locale";

type Vote = "YES" | "NO";
type Slot = { id: string; startsAtUtc: string };
type Participant = { id: string; displayName: string; votes: Record<string, Vote> };
type Poll = { id: string; title: string; description?: string; location?: string; timezone: string; durationMinutes: number; status: "OPEN" | "CLOSED"; winnerSlotId?: string; slots: Slot[]; participants: Participant[] };

const text = {
  fi: { loading: "Ladataan…", missing: "Kyselyä ei löytynyt.", closed: "Kysely on suljettu", winner: "Valittu aika", name: "Nimi", availability: "Saatavuus", yes: "Kyllä", no: "Ei", unanswered: "Tyhjä", save: "Tallenna vastaukset", saved: "Vastauksesi on tallennettu", edit: "Tallenna tämä muokkauslinkki", responses: "Vastaukset", yesCount: "Kyllä", people: "vastaajaa", empty: "Ei vielä vastauksia." },
  en: { loading: "Loading…", missing: "Poll not found.", closed: "Poll is closed", winner: "Selected time", name: "Name", availability: "Availability", yes: "Yes", no: "No", unanswered: "Clear", save: "Save answers", saved: "Your answers are saved", edit: "Save this edit link", responses: "Responses", yesCount: "Yes", people: "responses", empty: "No responses yet." },
};

const formatSlot = (slot: Slot, locale: "fi" | "en") => new Intl.DateTimeFormat(locale === "fi" ? "fi-FI" : "en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(slot.startsAtUtc));

export default function PublicPollPage() {
  const params = useParams<{ token: string }>();
  const { locale, setLocale } = useLocale();
  const t = text[locale];
  const token = params.token;
  const [poll, setPoll] = useState<Poll | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [name, setName] = useState("");
  const [votes, setVotes] = useState<Record<string, Vote>>({});
  const [saved, setSaved] = useState(false);
  const [editUrl, setEditUrl] = useState("");
  const [busy, setBusy] = useState(false);

  const refresh = async () => {
    const response = await fetch(`/api/v1/polls/${token}`, { cache: "no-store" });
    if (!response.ok) { setNotFound(true); return; }
    setPoll(await response.json());
  };
  useEffect(() => { void refresh(); }, [token]);

  const counts = useMemo(() => Object.fromEntries((poll?.slots || []).map((slot) => [slot.id, poll?.participants.filter((p) => p.votes[slot.id] === "YES").length || 0])), [poll]);

  const choose = (slotId: string, vote?: Vote) => setVotes((current) => {
    const next = { ...current };
    if (vote) next[slotId] = vote; else delete next[slotId];
    return next;
  });

  async function submit(event: FormEvent) {
    event.preventDefault(); if (!poll || !name.trim()) return;
    setBusy(true); setSaved(false);
    try {
      const response = await fetch(`/api/v1/polls/${token}/participants`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ displayName: name.trim(), votes }) });
      if (!response.ok) throw new Error("save failed");
      const result = await response.json();
      setPoll(result.poll); setSaved(true);
      const url = `${window.location.origin}/p/${token}/edit/${result.participantId}#token=${result.editToken}`;
      setEditUrl(url); window.localStorage.setItem(`milloin_edit_${token}_${result.participantId}`, result.editToken);
    } finally { setBusy(false); }
  }

  if (notFound) return <main className="page-shell"><p>{t.missing}</p></main>;
  if (!poll) return <main className="page-shell"><p>{t.loading}</p></main>;

  return <main className="page-shell">
    <header className="topbar"><a href="/" className="brand">milloin</a><LanguageSwitch locale={locale} setLocale={setLocale} /></header>
    <section className="panel">
      <div className="poll-heading"><div><h1>{poll.title}</h1>{poll.location ? <p className="muted">{poll.location}</p> : null}</div>{poll.status === "CLOSED" ? <span className="status closed">{t.closed}</span> : null}</div>
      {poll.winnerSlotId ? <div className="winner"><strong>{t.winner}:</strong> {formatSlot(poll.slots.find((s) => s.id === poll.winnerSlotId)!, locale)}</div> : null}

      {poll.status === "OPEN" ? <form onSubmit={submit} className="vote-form">
        <label>{t.name}<input aria-label={t.name} value={name} onChange={(e) => setName(e.target.value)} required autoComplete="name" /></label>
        <div className="slot-votes">{poll.slots.map((slot) => <fieldset className="vote-card" key={slot.id} aria-label={`${t.availability} ${formatSlot(slot, locale)}`}><legend>{formatSlot(slot, locale)}</legend><div className="choice-row">
          <button type="button" className={votes[slot.id] === "YES" ? "choice selected yes" : "choice"} onClick={() => choose(slot.id, "YES")}>{t.yes}</button>
          <button type="button" className={votes[slot.id] === "NO" ? "choice selected no" : "choice"} onClick={() => choose(slot.id, "NO")}>{t.no}</button>
          {votes[slot.id] ? <button type="button" className="text-button" onClick={() => choose(slot.id)}>{t.unanswered}</button> : null}
        </div><small>{t.yesCount}: {counts[slot.id] || 0}</small></fieldset>)}</div>
        <button className="primary wide" disabled={busy}>{busy ? "…" : t.save}</button>
        {saved ? <div className="success"><strong>{t.saved}</strong>{editUrl ? <><br/><a href={editUrl}>{t.edit}</a></> : null}</div> : null}
      </form> : null}

      <section className="results"><h2>{t.responses}</h2>{poll.participants.length === 0 ? <p className="muted">{t.empty}</p> : <div className="matrix-wrap"><table><thead><tr><th></th>{poll.slots.map((slot) => <th key={slot.id}>{formatSlot(slot, locale)}</th>)}</tr></thead><tbody>{poll.participants.map((participant) => <tr key={participant.id}><th>{participant.displayName}</th>{poll.slots.map((slot) => <td key={slot.id} aria-label={`${participant.displayName}: ${participant.votes[slot.id] || "UNANSWERED"}`}>{participant.votes[slot.id] === "YES" ? "✓" : participant.votes[slot.id] === "NO" ? "×" : "·"}</td>)}</tr>)}<tr className="totals"><th>{t.yesCount}</th>{poll.slots.map((slot) => <td key={slot.id}>{counts[slot.id] || 0}</td>)}</tr></tbody></table></div>}</section>
    </section>
  </main>;
}
