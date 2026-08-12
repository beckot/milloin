export default function HomePage() {
  return (
    <main className="shell">
      <section className="hero">
        <p className="eyebrow">milloin</p>
        <h1>Sovitaan aika ilman säätöä.</h1>
        <p className="lead">
          Ehdota muutama aika, jaa linkki ja katso yhdellä silmäyksellä mikä sopii porukalle.
        </p>
        <div className="actions">
          <a className="primary" href="/new">
            Luo kysely
          </a>
        </div>
        <p className="hint">Vastaajat eivät tarvitse käyttäjätiliä.</p>
      </section>
    </main>
  );
}
