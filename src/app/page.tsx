"use client";

import { LanguageSwitch, useLocale } from "../ui/use-locale";

const copy = {
  fi: {
    title: "Sovitaan aika ilman säätöä.",
    lead: "Ehdota muutama aika, jaa linkki ja katso yhdellä silmäyksellä mikä sopii porukalle.",
    create: "Luo kysely",
    hint: "Vastaajat eivät tarvitse käyttäjätiliä.",
  },
  en: {
    title: "Find a time without the back-and-forth.",
    lead: "Suggest a few times, share one link, and see at a glance what works for the group.",
    create: "Create poll",
    hint: "Participants do not need an account.",
  },
};

export default function HomePage() {
  const { locale, setLocale } = useLocale();
  const t = copy[locale];

  return (
    <main className="shell">
      <section className="hero">
        <div className="hero-top">
          <p className="eyebrow">milloin</p>
          <LanguageSwitch locale={locale} setLocale={setLocale} />
        </div>
        <h1>{t.title}</h1>
        <p className="lead">{t.lead}</p>
        <div className="actions"><a className="primary" href="/new">{t.create}</a></div>
        <p className="hint">{t.hint}</p>
      </section>
    </main>
  );
}
