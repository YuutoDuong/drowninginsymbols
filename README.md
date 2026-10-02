# drowninginsymbols

# drowninginsymbols

**Stop drowning in physics symbols.** Type a symbol or a formula and find out what it means in *your*
topic and *your* textbook.

No install, no build step, no server, no account. Plain HTML, CSS and JavaScript that runs offline in
any modern browser.

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

## Project structure

| File | What it is |
| --- | --- |
| `index.html` | The page |
| `style.css` | The black and white look (with a light mode toggle) |
| `app.js` | Reads the input, works out the context, ranks meanings, draws the answers |
| `data.js` | The database: meanings, formulas, Greek letters and their shapes |
| `check.html` | Self-check for the database and the parser |
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

Then run the checks. Found a wrong meaning or a missing symbol? Open an issue. The site's
**History → Reported** list can be copied as JSON to attach.

## Roadmap

- [x] Type, keyboard and shape input; context inference; symbol and formula cards; feedback and history
- [ ] Draw a symbol on screen, or take a photo of it
- [ ] "Translate to my notation", aware of sign conventions, not just letter swaps
- [ ] Compare two formulas: "my teacher wrote X, my book wrote Y: is it the same law?"
- [ ] An AI helper that answers only from this database

## License

[MIT](LICENSE)
