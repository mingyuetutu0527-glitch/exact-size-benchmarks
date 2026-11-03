# exact-size-benchmarks

What a browser actually gives you when you ask it to hit a target file size — 108 measured runs of Chrome's own JPEG and WebP encoders.

Most "compress to 200 KB" pages describe the workflow and stop there. This dataset records what came out: the real byte size, the quality the search settled on, and how much resolution had to be thrown away to get there.

## What's in here

| Path | What it is |
|---|---|
| `data/browser-encoder-benchmarks.csv` | 108 rows — the measurements |
| `METHOD.md` | Environment, test-image generation, the search, and five limitations |
| `tools/hit-target-size.js` | Drop-in function: `hitTargetSize(canvas, {mime, targetBytes})` |
| `tools/bench.html` | The harness that produced the CSV |
| `tools/run-headless.js` | Drives the harness in headless Chrome |

Columns: `pattern, src_w, src_h, format, target_kb, target_bytes, out_bytes, out_w, out_h, quality, scale, fits`

## What the numbers say

**A 12-megapixel photo cannot be 200 KB at full resolution.** On the grainy `photo` source, hitting 200 KB with JPEG costs you two thirds of the pixels — the encoder lands at 3139×2354 (7.4 MP) with quality already at its 0.40 floor:

| Target | Output | Quality | Pixels kept |
|---|---|---|---|
| 20 KB | 1328×996 | 0.41 | 1.3 MP (11%) |
| 50 KB | 2011×1508 | 0.40 | 3.0 MP (25%) |
| 100 KB | 2486×1864 | 0.40 | 4.6 MP (38%) |
| 200 KB | 3139×2354 | 0.40 | 7.4 MP (62%) |
| 500 KB | 4000×3000 | 0.40 | 12.0 MP (100%) |
| 1 MB | 4000×3000 | 0.65 | 12.0 MP (100%) |

**The same target behaves completely differently on a screenshot.** A 1920×1080 screenshot hits 200 KB with every pixel intact at quality 0.76. Ask the same screenshot for 20 KB and it collapses to 395×222 — a 4× reduction in each dimension, because flat text on white has no redundancy left to squeeze.

**Some images simply cannot spend the budget.** The `flat` source encodes to 14 KB as JPEG and 4.9 KB as WebP at maximum quality, no matter whether you asked for 20 KB or 1 MB. There is nothing to spend it on. Any tool that reports "compressed to 1 MB" for that image is reporting the target, not the result.

**32 of the 108 runs needed a downscale.** The other 76 fit at full resolution by dropping quality alone.

## How it was measured

Chrome 156.0.8078.80 (headless), Windows 11, `canvas.toBlob()` — the only encoder a web page gets without a server. Test images are drawn from a seeded generator, so the run reproduces without shipping any photographs. Full method, including the algorithm and its limitations, is in `METHOD.md`.

The one caveat worth repeating here: **these are synthetic sources, not your photos.** Real camera files carry different noise characteristics and generally need more aggressive settings than the `photo` rows suggest.

## Reproducing

```
python -m http.server 8000          # then open tools/bench.html
await runAll()                       # DevTools console — returns the CSV
```

Or headless, which is how the shipped CSV was produced:

```
chrome --headless=new --remote-debugging-port=9444 \
       --user-data-dir=/tmp/bench file:///path/to/tools/bench.html
node tools/run-headless.js 9444 out.csv
```

Expect 10-20 minutes on a laptop; the 4000×3000 cells dominate.

## Using the function

```js
const canvas = await drawMyImageIntoACanvas(file);
const hit = await hitTargetSize(canvas, { mime: 'image/jpeg', targetBytes: 200 * 1024 });
if (hit.fits) {
  // hit.blob is <= 204800 bytes; hit.quality and hit.scale tell you what it cost
  save(hit.blob);
}
```

## Licence

MIT. The data is free to reuse with attribution to this repository.

## Citation

If you use the benchmark data, cite the archived dataset:

> mingyuetutu0527 (2026). *Browser JPEG/WebP target-size benchmarks (108 headless-Chrome runs)*. Zenodo. https://doi.org/10.5281/zenodo.23916007

DOI: [10.5281/zenodo.23916007](https://doi.org/10.5281/zenodo.23916007)

---

The same target-size search runs in [ExactSize](https://crunchimage.com), a browser-only image compressor that never uploads your files.
