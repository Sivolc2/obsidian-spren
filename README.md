# Spren

Idea-organisms that live on your Obsidian graph view.

Open the graph, run **Spren: Put organisms on the graph view**, type a search term, and an organism is set down beside the notes that best match it. It carries your term as a core idea it cannot lose, wanders the graph, takes in the notes that belong with what it holds, and stops when it is full, when what it holds hangs together, or when it runs out of time. Then it hands you the list.

## Using it

1. Open the graph view (global or local).
2. Run the command **Spren: Put organisms on the graph view**. A panel appears at the bottom left of the graph. Run the command again to remove everything.
3. Type a word or phrase, choose a kind of organism, and press **Create and send out** (or Enter).
4. Watch it, or press **Follow** to keep it in the middle of the view.
5. When it finishes, the panel shows what it found, best fit first. **Save as a note** writes the list to a `Spren/` folder as wikilinks; **Copy as text** puts it on the clipboard; **Let it go** returns its notes to the graph.

A note an organism has taken stays where the graph keeps it, ringed in the organism's colour and joined to it by a line. Click a note's name in the panel to open it.

### The kinds

Each kind judges whether a note belongs in its own way.

| Kind | How it reads |
|---|---|
| Matcher | Shapes of letters only |
| Forager | Which words keep company across your notes |
| Empath | Tags: the query's words are matched against note tags |
| Keeper | As the Forager, with a core that never changes |
| Learner | A small classifier it retrains as it goes |
| Forest | Small decision trees that vote |
| Fly (default) | A simulated fruit-fly brain decides: fit is turned into sweetness, and a feeding neuron firing means it eats |
| Seer, Librarian | In this plugin both read by word association, as the Forager does |

Only the title and the first 100 characters of each note are read.

## Privacy

- The plugin reads the notes shown in your graph. It makes **no network requests** and sends nothing anywhere.
- It writes to your vault only when you press **Save as a note**: one new file in a `Spren/` folder.
- It stores no settings and no data file.

## Limits

- Obsidian's graph view has no public API. The overlay reads the positions of the graph's nodes and its pan and zoom from the view's internals, which other plugins also rely on but which Obsidian may change. If it cannot read them it says so and does nothing. If the organisms are drawn offset from the nodes, run **Spren: Overlay: fix position…**.
- Desktop only.
- A word that does not occur in any note's title or opening has nothing to match; the panel says so.

## Building

```bash
npm install
npm run build      # bundles src/ into main.js
npm run validate   # checks the bundle: no secrets or personal paths, no network or eval, store rules
```

`test/harness.html` runs the bundle against a stand-in for the graph view in a browser.

## Credits and licences

- **Code:** MIT (see `LICENSE`).
- **Fly brain data:** `src/engine/fly_circuit.json`, and the copy embedded in `main.js`, is derived from the FlyWire connectome and is under **CC BY-NC 4.0**, not MIT: free to share and adapt for non-commercial use, with credit. It is a 2,234-neuron sub-network of the FlyWire whole-brain connectome (FAFB v783), using the connectivity and leaky integrate-and-fire model of Shiu et al. 2024 (`philshiu/Drosophila_brain_model`). See `NOTICE.md` for the details and the papers to cite.
- The step that turns word-fit into sweetness is this project's own; a fly does not read.
