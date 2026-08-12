"use client";

import { useParams } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { LanguageSwitch, useLocale } from "../../../../../ui/use-locale";

type Vote = "YES" | "NO";
type Slot = { id: string; startsAtUtc: string };
type Participant = { id: string; displayName: string; votes: Record<string, Vote> };
type Poll = {
  id: string;
  title: string;
  timezone: string;
  status: "OPEN" | "CLOSED";
  slots: Slot[];
  participants: Participant[];
};

const copy = {
  fi: {
    loading: "Ladataan…",
    missing: "Muokkauslinkki ei kelpaa.",
    closed: "Kysely on suljettu",
    name: "Nimi",
    availability: "Saatavuus",
    yes: "Kyllä",
    no: "Ei",
    unanswered: "Tyhjä",
    save: "Päivitä vastaukset",
    saved: "Vastaukset päivitetty",
    back: "Takaisin kyselyyn",
    error: "Vastauksia ei voitu päivittää.",
  },
  en: {
    loading: "Loading…",
    missing: "This edit link is not valid.",
    closed: "Poll is closed",
    name: "Name",
    availability: "Availability",
    yes: "Yes",
    no: "No",
    unanswered: "Clear",
    save: "Update answers",
    saved: "Answers updated",
    back: "Back to poll",
    error: "Could not update answers.",
  },
};

const formatSlot = (slot: Slot, locale: "fi" | "en") =>
  new Intl.DateTimeFormat(locale === "fi" ? "fi-FI" : "en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(slot.startsAtUtc));

export default function ParticipantEditPage() {
  const params = useParams<{ token: string; participantId: string }>();
  const token = params.token;
  const participantId = params.participantId;
  const { locale, setLocale } = useLocale();
  const t = copy[locale];
  const [poll, setPoll] = useState<Poll | null>(null);
  const [name, setName] = useState("");
  const [votes, setVotes] = useState<Record<string, Vote>>({});
  const [editToken, setEditToken] = useState("");
  const [invalid, setInvalid] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const hashToken = new URLSearchParams(window.location.hash.replace(/^#/, "")).get("token") || "";
    const storageKey = `milloin_edit_${token}_${participantId}`;
    const stored = window.localStorage.getItem(storageKey) || "";
    const capability = hashToken || stored;
    if (!capability) {
      setInvalid(true);
      return;
    }
    window.localStorage.setItem(storageKey, capability);
    setEditToken(capability);
    if (window.location.hash) window.history.replaceState(null, "", window.location.pathname);

    fetch(`/api/v1/polls/${token}`, { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("poll missing");
        return (await response.json()) as Poll;
      })
      .then((loaded) => {
        const participant = loaded.participants.find((candidate) => candidate.id === participantId);
        if (!participant) {
          setInvalid(true);
          return;
        }
        setPoll(loaded);
        setName(participant.displayName);
        setVotes({ ...participant.votes });
      })
      .catch(() => setInvalid(true));
  }, [participantId, token]);

  const choose = (slotId: string, vote?: Vote) =>
    setVotes((current) => {
      const next = { ...current };
      if (vote) next[slotId] = vote;
      else delete next[slotId];
      return next;
    });

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!poll || !editToken || !name.trim()) return;
    setBusy(true);
    setSaved(false);
    setError("");
    try {
      const response = await fetch(`/api/v1/polls/${token}/participants/${participantId}`, {
        method: "PUT",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${editToken}`,
        },
        body: JSON.stringify({ displayName: name.trim(), votes }),
      });
      if (response.status === 401 || response.status === 403) {
        setInvalid(true);
        return;
      }
      if (!response.ok) throw new Error("update failed");
      setPoll(await response.json());
      setSaved(true);
    } catch {
      setError(t.error);
    } finally {
      setBusy(false);
    }
  }

  if (invalid) {
    return (
      <main className="page-shell">
        <header className="topbar"><a href="/" className="brand">milloin</a><LanguageSwitch locale={locale} setLocale={setLocale} /></header>
        <section className="panel narrow"><p>{t.missing}</p><a href={`/p/${token}`}>{t.back}</a></section>
      </main>
    );
  }
  if (!poll) return <main className="page-shell"><p>{t.loading}</p></main>;

  return (
    <main className="page-shell">
      <header className="topbar"><a href="/" className="brand">milloin</a><LanguageSwitch locale={locale} setLocale={setLocale} /></header>
      <section className="panel narrow">
        <h1>{poll.title}</h1>
        {poll.status === "CLOSED" ? <div className="notice">{t.closed}</div> : null}
        <form onSubmit={submit} className="vote-form">
          <label>{t.name}<input aria-label={t.name} value={name} onChange={(event) => setName(event.target.value)} required /></label>
          <div className="slot-votes">
            {poll.slots.map((slot) => (
              <fieldset className="vote-card" key={slot.id} aria-label={`${t.availability} ${formatSlot(slot, locale)}`}>
                <legend>{formatSlot(slot, locale)}</legend>
                <div className="choice-row">
                  <button type="button" className={votes[slot.id] === "YES" ? "choice selected yes" : "choice"} onClick={() => choose(slot.id, "YES")}>{t.yes}</button>
                  <button type="button" className={votes[slot.id] === "NO" ? "choice selected no" : "choice"} onClick={() => choose(slot.id, "NO")}>{t.no}</button>
                  {votes[slot.id] ? <button type="button" className="text-button" onClick={() => choose(slot.id)}>{t.unanswered}</button> : null}
                </div>
              </fieldset>
            ))}
          </div>
          {error ? <p className="error">{error}</p> : null}
          {saved ? <p className="success">{t.saved}</p> : null}
          <button className="primary wide" disabled={busy || poll.status === "CLOSED"}>{busy ? "…" : t.save}</button>
        </form>
        <a href={`/p/${token}`}>{t.back}</a>
      </section>
    </main>
  );
}
