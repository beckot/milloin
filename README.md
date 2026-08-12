<div align="center">
  <img src="./logo.jpg" alt="milloin logo" width="200" style="border-radius: 20px; box-shadow: 0 10px 30px rgba(0,0,0,0.5);" />
  
  # milloin.fi

  **Sopiva aika helposti ilman kirjautumista.**

  [![Live App](https://img.shields.io/badge/Käytä%20sovellusta-beckot.github.io%2Fmilloin-06b6d4?style=for-the-badge)](https://beckot.github.io/milloin/)
</div>

---

## 📌 Mikä milloin on?

**milloin** on henkilökohtaiseen ja tiimikäyttöön tehty kevyt aikaehdotusten sopimistyökalu. Doodle on hyvä, mutta nykyisin raskas, täynnä mainoksia ja vaatii usein kirjautumisen. **milloin** tekee vain yhden asian ja tekee sen nopeasti:

1. **Luo kysely**: Anna otsikko ja ehdota muutamaa aikaa.
2. **Jaa julkinen linkki**: Lähetä linkki osallistujille — ei kirjautumista vastaajille.
3. **Katso tulos**: Suosituin aika näkyy reaaliajassa yhteenvedossa.

---

## ✨ Tärkeimmät ominaisuudet

- 🚀 **100% Maksuton & Mainokseton**: Ei evästehuijauksia, mainoksia tai rekisteröitymistä.
- 🇫🇮 **Suomalaiseen makuun**: Aikavyöhyke `Europe/Helsinki`, selkeä suomenkielinen käyttöliittymä.
- 📱 **Toimii kaikilla laitteilla**: Responsiivinen näkymä puhelimelle ja tietokoneelle.
- 🛡️ **Spam-suojattu**: Sisäänrakennettu automaattinen bot- ja spamsuojaus.
- 🔑 **Ylläpitäjän hallinta**: Kyselyn luoja saa admin-avaimen, jolla äänestyksen voi lukita kun sopiva aika on valittu.
- 🤖 **Agent-Native**: AI-avustajat ja agentit voivat luoda ja lukea kyselyitä ohjelmallisesti (OpenAPI & MCP).

---

## 🛠️ Kehitys ja taustajärjestelmä

Tämä repositorio sisältää sovelluksen lähdekoodin:

- **Frontend**: Single Page App ([`frontend/`](./frontend)), isännöity GitHub Pagesissa.
- **Backend API**: Serverless REST API ([`worker/`](./worker)), pyörii Cloudflare Workerissä D1 SQLite -tietokannalla.

---

## 📄 Lisenssi

[MIT License](./LICENSE) © Becker Otto
