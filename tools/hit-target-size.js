/**
 * hit-target-size.js — land a canvas image on a target byte size.
 *
 * Plain browser code, no dependencies. Works on the output of
 * canvas.toBlob(), which is the only encoder available to a web page
 * without a server.
 *
 * Strategy, in order:
 *   1. Keep every pixel. Binary-search the encoder quality between
 *      `qualityFloor` and `qualityCeiling` until the blob fits.
 *   2. If the floor still overshoots, start giving up pixels: binary-search
 *      the downscale factor at `qualityFloor` until the blob fits.
 *   3. If even that fails (tiny target, high-entropy image), return the
 *      smallest attempt and let the caller decide.
 *
 * Quality is searched in a fixed number of steps rather than to an exact
 * value, because each step costs a full encode. 7 steps over a 0.40-0.95
 * range resolves quality to about 0.4%, which is finer than the encoder's
 * own quantisation.
 *
 * MIT licensed. See METHOD.md for how the numbers in data/ were produced.
 */

(function (root) {
  'use strict';

  var DEFAULTS = {
    qualityFloor: 0.40,
    qualityCeiling: 0.95,
    steps: 7,
    minScale: 0.05
  };

  function encode(canvas, mime, quality) {
    return new Promise(function (resolve) {
      if (quality === null || quality === undefined) {
        canvas.toBlob(resolve, mime);
      } else {
        canvas.toBlob(resolve, mime, quality);
      }
    });
  }

  function redraw(source, scale) {
    if (scale === 1) return source;
    var w = Math.max(1, Math.round(source.width * scale));
    var h = Math.max(1, Math.round(source.height * scale));
    var c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    var ctx = c.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(source, 0, 0, w, h);
    return c;
  }

  /**
   * @param {HTMLCanvasElement|HTMLImageElement|ImageBitmap} source
   * @param {{mime?:string, targetBytes:number, qualityFloor?:number,
   *          qualityCeiling?:number, steps?:number, minScale?:number}} opts
   * @returns {Promise<{blob:Blob|null, quality:number|null, scale:number,
   *                    width:number, height:number, fits:boolean}>}
   */
  function hitTargetSize(source, opts) {
    opts = opts || {};
    var mime = opts.mime || 'image/jpeg';
    var target = opts.targetBytes;
    var floor = opts.qualityFloor === undefined ? DEFAULTS.qualityFloor : opts.qualityFloor;
    var ceil = opts.qualityCeiling === undefined ? DEFAULTS.qualityCeiling : opts.qualityCeiling;
    var steps = opts.steps === undefined ? DEFAULTS.steps : opts.steps;
    var minScale = opts.minScale === undefined ? DEFAULTS.minScale : opts.minScale;

    if (!target || target <= 0) {
      return Promise.reject(new Error('targetBytes must be a positive number'));
    }

    var full = redraw(source, 1);

    return encode(full, mime, ceil).then(function (top) {
      if (top && top.size <= target) {
        return { blob: top, quality: ceil, scale: 1 };
      }
      return encode(full, mime, floor).then(function (bottom) {
        if (!bottom || bottom.size > target) return null;

        var best = { blob: bottom, quality: floor, scale: 1 };
        var lo = floor;
        var hi = ceil;
        var chain = Promise.resolve();

        for (var i = 0; i < steps; i++) {
          (function () {
            var mid = (lo + hi) / 2;
            chain = chain.then(function () {
              return encode(full, mime, mid).then(function (b) {
                if (b && b.size <= target) {
                  best = { blob: b, quality: mid, scale: 1 };
                  lo = mid;
                } else {
                  hi = mid;
                }
              });
            });
          })();
        }
        return chain.then(function () { return best; });
      });
    }).then(function (hit) {
      if (hit) return finish(hit);
      return downscale(source, mime, target, floor, minScale, steps);
    });
  }

  function downscale(source, mime, target, floor, minScale, steps) {
    var best = null;
    var lo = minScale;
    var hi = 1;
    var chain = Promise.resolve();

    for (var i = 0; i < steps; i++) {
      (function () {
        var mid = (lo + hi) / 2;
        chain = chain.then(function () {
          return encode(redraw(source, mid), mime, floor).then(function (b) {
            if (b && b.size <= target) {
              best = { blob: b, quality: floor, scale: mid };
              lo = mid;
            } else {
              hi = mid;
            }
          });
        });
      })();
    }

    return chain.then(function () {
      if (!best) {
        return { blob: null, quality: floor, scale: lo, width: 0, height: 0, fits: false };
      }
      // 3) spend the leftover budget on quality at the chosen resolution
      var canvas = redraw(source, best.scale);
      var qlo = floor;
      var qhi = 0.95;
      var raised = best;
      var qchain = Promise.resolve();

      for (var j = 0; j < steps; j++) {
        (function () {
          var mid = (qlo + qhi) / 2;
          qchain = qchain.then(function () {
            return encode(canvas, mime, mid).then(function (b) {
              if (b && b.size <= target) {
                raised = { blob: b, quality: mid, scale: best.scale };
                qlo = mid;
              } else {
                qhi = mid;
              }
            });
          });
        })();
      }

      return qchain.then(function () { return finish(raised); });
    });
  }

  function finish(hit) {
    var width = 0;
    var height = 0;
    if (hit.blob) {
      width = Math.round(hit.blob.width || 0);
      height = Math.round(hit.blob.height || 0);
    }
    return {
      blob: hit.blob,
      quality: hit.quality,
      scale: hit.scale,
      width: width,
      height: height,
      fits: !!hit.blob
    };
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { hitTargetSize: hitTargetSize };
  } else {
    root.hitTargetSize = hitTargetSize;
  }
})(typeof self !== 'undefined' ? self : this);
