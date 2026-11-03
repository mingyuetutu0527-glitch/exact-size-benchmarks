# Method

Every number in `data/browser-encoder-benchmarks.csv` was produced by running
`tools/bench.html` in headless Chrome on one machine. Nothing in the CSV is
estimated, copied from another site, or extrapolated from a formula.

## Environment

| Item | Value |
|---|---|
| Browser | Chrome 156.0.8078.80 (headless) |
| OS | Windows 11 Pro, x64 |
| Encoders | `canvas.toBlob()` — the browser's own JPEG and WebP encoders |
| Run date | 2026-11-03 |
| Harness | `tools/bench.html`, driven by `tools/run-headless.js` over the DevTools protocol |

## What is measured

For each combination of source pattern, source resolution, output format and
target size, the harness records the blob the encoder actually returns: its
byte size, the quality setting it settled on, and the downscale factor applied
to the pixels.

Matrix: 3 patterns × 3 resolutions × 2 formats × 6 targets = 108 runs.

- Patterns: `photo`, `screenshot`, `flat`
- Resolutions: 4000×3000, 1920×1080, 1024×1024
- Formats: `image/jpeg`, `image/webp`
- Targets: 20, 50, 100, 200, 500, 1024 KB (1 KB = 1024 bytes here)

## How the test images are generated

No stock photos are shipped with this repo. Each source image is drawn on a
canvas from a seeded linear congruential generator, so the same pattern at the
same resolution is byte-identical on every machine and every run.

- `photo` — a three-stop diagonal gradient, 60 translucent discs, then ±13
  levels of per-pixel grain. The grain is the point: it is what makes a
  photograph expensive to encode, and it is the main reason a photo cannot be
  squeezed as hard as a screenshot.
- `screenshot` — white background, dark word-shaped blocks on a regular
  baseline grid, 8 coloured rectangles. Sharp edges, flat colour: the opposite
  case, where the encoder can spend almost nothing.
- `flat` — a near-solid two-stop vertical gradient. The floor case: what a
  target size looks like when the content is trivially compressible.

These are synthetic. They are reproducible and they bracket the range, but
they are not your photos. See the caveats below.

## The search

Same policy the site uses, reimplemented in `tools/hit-target-size.js`:

1. Hold the pixel dimensions. Binary-search quality in [0.40, 0.95], 7 steps.
2. If quality 0.40 at full resolution still overshoots the target, binary-search
   the downscale factor in [0.05, 1.0] at quality 0.40, 7 steps.
3. At the largest scale that fits, spend the leftover budget on quality: another
   7-step binary search in [0.40, 0.95] at that scale.
4. If nothing fits, the row is recorded with `fits=0` and the smallest attempt.

7 steps over a 0.55-wide range resolves quality to about 0.4%, finer than the
encoder's own quantisation, at a cost of up to 21 full encodes per cell.

### One artifact worth knowing about

Downscaling is not a gentle dial. `drawImage` resamples every pixel, which
destroys high-frequency detail — and high-frequency detail is exactly what costs
bytes. On the grain-heavy `photo` source a 0.4% reduction in scale cut the WebP
blob from 611,160 bytes to 156,668 bytes in a single step. That is a real
measurement, not a bug, and it is why the rows in this dataset are not a smooth
function of scale: a small downscale can free up far more budget than the pixel
count suggests.

## Caveats — read these before quoting a row

- **Synthetic sources, not photographs.** A real 12 MP camera JPEG has
  different noise characteristics. Expect real photos to need more aggressive
  settings than the `photo` rows here.
- **One browser, one build.** Chrome 156's JPEG and WebP encoders. Firefox and
  Safari use different implementations and will not produce these exact bytes.
- **Encoder output is not monotonic in quality.** `toBlob()` at quality q and
  q+0.001 can return the same or even a larger blob. The binary search assumes
  monotonicity as a working approximation; individual rows can therefore land a
  fraction of a percent under the target rather than exactly on it.
- **Colour management is not exercised.** Sources are sRGB canvases. Images
  carrying an embedded ICC profile are converted by the browser before encoding
  and can behave differently.
- **`image/webp` quality in Chrome is not the same scale as JPEG quality.** The
  numbers are comparable within a format, not across formats.

## Reproducing

```
# serve the folder (file:// works too, but a local server is cleaner)
python -m http.server 8000

# open tools/bench.html in Chrome, then from the DevTools console:
await runAll()          # returns the CSV as a string
```

Or drive it headless:

```
chrome --headless=new --remote-debugging-port=9444 \
       --user-data-dir=/tmp/bench file:///path/to/tools/bench.html

node tools/run-headless.js 9444 out.csv
```

Expect 10-20 minutes on a laptop: the 4000×3000 photo cells dominate the run.
