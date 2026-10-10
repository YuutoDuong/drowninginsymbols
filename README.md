# drowninginsymbols

**Stop drowning in physics symbols.** Type a symbol or a formula, or photograph it, and find out what it
means in *your* topic and *your* textbook.

No install, no build step, no server, no account. Plain HTML, CSS and JavaScript that runs offline in
any modern browser. Two optional features, reading a photo and the AI helper, call the Claude API and
need your own API key (see [Turn on the AI helper](#turn-on-the-ai-helper-optional)).

## Mission

Physics notation is not universal. The same letter changes meaning between topics, countries, textbooks
and teachers:

- `p` is momentum in mechanics, but pressure in a gas.
- `W` is work in English-language textbooks, but mechanical energy in Vietnamese ones (where work is `A`).
- The same law can be written with different letters (`V = IR` vs `I = U/R`), or with a different sign
  convention (`ΔU = Q − W` vs `ΔU = A + Q`), and then swapping letters is not enough.

Beginners lose hours to this before they even reach the physics. **drowninginsymbols exists to remove
that obstacle**: to tell a learner what a symbol means *here*, by reading the context it appears in, the
way an experienced teacher would.

## Goals

- **Meaning from context, not guesswork.** Use what is already on the page: the unit next to a symbol
  (`Q = 5 C` is a charge, `Q = 500 J` is heat), the other symbols in the formula, the topic, and the
  learner's textbooks. Ask a question only when those clues are not enough.
- **Bridge textbook traditions.** Show English-language and Vietnamese (SGK) notation side by side, and
  say clearly when a sign convention changes, not just a letter.
- **Be trustworthy.** Every answer comes from a curated, checked database. When something is missing,
  say so and record it instead of inventing an answer.
- **Stay calm.** A quiet black-and-white interface built for studying, with no distracting animation.

## What it does

- **One input for everything:** type or paste a symbol or a whole formula. Greek names work (`rho`, `nu`),
  as do LaTeX (`\phi`), subscripts (`v_0`, `v₀`) and powers (`v^2`, `v²`).
- **"We read it as…":** shows how your input was understood and warns about look-alikes (`ν` vs `v`,
  `ρ` vs `p`, `ω` vs `w`). If you cannot type the character, use the **symbol keyboard** or
  **describe its shape** (circle with a line across it → `θ`).
- **Context inference:** works out the topic from the unit, the other symbols and your profile, and tells
  you why ("because of the formula p = mv"). Not sure? Paste the sentence where you saw the symbol.
- **Answer cards:**
  - **Symbol card:** name and pronunciation, meaning, SI unit, other symbols for the same quantity, other
    meanings of the same letter, and look-alikes.
  - **Formula card:** each symbol explained, when the formula applies, and the other ways it is written,
    including sign-convention differences.
- **Look up from a photo:** press **Photo**, paste a screenshot, or drop a picture on the page. The AI
  only reads the characters and shows you what it read so you can correct it. What they mean still
  comes from the database.
- **Popular problems:** 33 classic problems across five subjects. Each has a hint (the formulas you
  need, with links to their cards), a step-by-step solution, a "watch the notation" note and links to
  related problems.
- **Ask AI:** a helper that knows the site's database and your textbook profile. Ask what a symbol or
  formula means, or get step-by-step help with homework, with or without a photo. Its answers are not
  checked like the database, and the site says so.
- **Feedback loop:** "Did this help?", a history of your lookups, and a list of missing symbols you can
  export to grow the database.
- **The database:** 294 meanings and 199 formula forms across mechanics, electricity & magnetism, thermal
  physics, waves & optics, nuclear & modern physics, and maths notation. Each entry is tagged as
  English-language textbooks, Vietnamese textbooks, or both.

## Run it locally

You need a web browser. [VS Code](https://code.visualstudio.com/) is optional. There is nothing to install.

1. **Get the code.** On this repository's page, click **Code**. Either copy the URL and run
   `git clone <that URL>`, or choose **Download ZIP** and unzip it.
2. **Open the site.** Do either of these:
   - **In VS Code:** **File → Open Folder…**, pick the `drowninginsymbols` folder (the folder, not a
     single file), then press **Ctrl+Shift+B**. The site opens in your default browser.
   - **Without VS Code:** double-click `index.html`.
3. **Debug (optional).** To set breakpoints in `app.js`, open **Run and Debug** (Ctrl+Shift+D), choose
   **Open website (Edge)** or **Open website (Chrome)** from the dropdown, and press **F5**.
4. **Check your changes.** After editing `data.js`, run **Terminal → Run Task… → Run checks**, or open
   `check.html`. The page must say **ALL CHECKS PASSED**.

The site runs straight from the file, so no web server is needed. Never point the launch configurations
at `http://localhost:...`. Your profile, history and reports are stored only in your browser
(localStorage).

### Turn on the AI helper (optional)

Photo lookup and **Ask AI** use [Claude](https://www.anthropic.com/claude) through the Anthropic API.
The site has no server, so each person uses their own API key:

1. Create a key at [console.anthropic.com](https://console.anthropic.com/). API use is billed by
   Anthropic to that key. A Claude chat subscription does not include it.
2. Open the site, go to **Ask AI → AI settings**, paste the key, pick a model and press **Save**.

The key is saved in that browser only (localStorage) and is sent only to `api.anthropic.com`, together
with the question, any attached photo and the textbook profile. **Never write a key into the code or
commit it to GitHub.** Every Ask AI question also sends the notation database (about 55 KB of text) so
that answers match the site; the API caches it between questions. Reading a photo sends only the photo.
The smaller models in the settings cost less.

Everything else on the site keeps working without a key.

## Project structure

| File | What it is |
| --- | --- |
| `index.html` | The page |
| `style.css` | The black and white look (with a light mode toggle) |
| `app.js` | Reads the input, works out the context, ranks meanings, draws the answers; also the problems page, photo lookup and the AI helper |
| `data.js` | The database: meanings, formulas, Greek letters and their shapes, and the problems |
| `check.html` | Self-check for the database, the parser, the problems and the AI helper (no network calls) |
| `.vscode/` | Ctrl+Shift+B task and F5 debug launchers |

A lookup goes through these steps: **Input → Recognize → Context → Look up → Answer → Did this help?**

## Adding or fixing a symbol

All content lives in `data.js`. A meaning looks like this:

```js
{ "id": "p-momentum", "sym": "p", "q": "momentum", "name": "Momentum", "vi": "Động lượng",
  "topic": "mech", "kind": "quantity", "unit": "kg·m/s", "units": ["kg·m/s", "N·s"],
  "cur": ["all"], "level": "school", "common": 2,
  "words": ["momentum", "collision"], "note": "p = mv. A vector.", "vector": true }
```

- `sym`: one letter, plus an optional subscript (`v_0`, `F_{ms}`) and primes (`d′`). Adjacent letters
  are separate symbols, so `pV` is p times V.
- `q`: every symbol for the same quantity shares the same `q` (KE, K, E_k and Wđ are all "kinetic energy").
- `cur`: `all`, `intl` (English-language textbooks) or `vn` (Vietnamese textbooks).
- `units`: unit spellings that identify this meaning, so that `Q = 5 C` means charge.
- `words`: whole words or phrases that point to this meaning in a pasted sentence.

Formulas go in `formulas`. `f` uses the same syntax (`^2` for powers, `/` for division), `vars` maps every
symbol in `f` to a meaning `id`, and different written forms of one law share the same `law`.

Problems go in `problems`. Text between backticks is a formula in the same syntax and is drawn as
maths; write numbers and units outside the backticks. `uses` lists the `id` of each formula in the
form the solution writes it, and the page adds the other textbooks' forms by itself:

```js
{ "id": "mech-braking-distance", "topic": "mech", "sub": "Kinematics", "title": "Braking distance of a car",
  "q": "A car is travelling at 20 m/s when the driver brakes. ...",
  "uses": ["velocity-displacement-v2-u2"],
  "steps": ["Write down what is known. Initial velocity `u` = 20 m/s. ...", "..."],
  "answer": "The car travels 40 m before it stops.",
  "trap": "The starting velocity is `u` in British and Indian textbooks, but `v_0` in ..." }
```

Then run the checks. Found a wrong meaning or a missing symbol? Open an issue. The site's
**History → Reported** list can be copied as JSON to attach.

## Roadmap

- [x] Type, keyboard and shape input; context inference; symbol and formula cards; feedback and history
- [x] Look up from a photo or a screenshot
- [x] Popular problems by subject, with hints, solutions and notation notes
- [x] An AI helper that knows this database (bring your own API key)
- [ ] A small server, so visitors can use the AI helper without their own key
- [ ] Draw a symbol on screen
- [ ] "Translate to my notation", aware of sign conventions, not just letter swaps
- [ ] Compare two formulas: "my teacher wrote X, my book wrote Y: is it the same law?"

## License

[MIT](LICENSE)
