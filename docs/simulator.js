/*
 * Porte em JavaScript do simulador Java (src/Simulador/DFSASimulator.java,
 * src/Estimador/Estimador.java e src/q/QAlgorithm.java).
 * Usado tanto pela página quanto pelo Web Worker.
 */
(function (root) {
  'use strict';

  var MAX_FRAME = 10000; // mesmo limite do array `frame` no Java

  // Estimador.LowerBound: cada colisão tem pelo menos 2 etiquetas
  function lowerBound(L, sc, sv, ss) {
    return sc * 2;
  }

  // Estimador.EomLee: iteração de ponto fixo de Eom & Lee
  function eomLee(L, sc, sv, ss) {
    var beta, oldGama, num, den, frac;
    var newGama = 2.0;
    var it = 0;
    do {
      oldGama = newGama;
      beta = L / ((oldGama * sc) + ss);
      frac = Math.exp(-(1.0 / beta));
      num = (1.0 - frac);
      den = (beta * (1.0 - (1.0 + (1.0 / beta)) * frac));
      newGama = num / den;
    } while (Math.abs(oldGama - newGama) >= 0.001 && ++it < 1000);
    return newGama * sc;
  }

  var ESTIMATORS = { 'LowerBound': lowerBound, 'Eom-Lee': eomLee };

  function nextFrameSize(tipo, L, sc, sv, ss) {
    var est = Math.ceil(ESTIMATORS[tipo](L, sc, sv, ss));
    if (!isFinite(est)) est = L;
    return Math.max(1, Math.min(MAX_FRAME, est));
  }

  function randInt(rng, n) {
    return Math.floor(rng() * n);
  }

  /*
   * Executa um único frame: cada etiqueta ainda não identificada escolhe
   * um slot aleatório. Retorna a ocupação de cada slot e as contagens.
   */
  function runFrame(frameSize, pendingTags, rng) {
    var slots = new Array(frameSize);
    for (var i = 0; i < frameSize; i++) slots[i] = 0;
    for (var k = 0; k < pendingTags; k++) slots[randInt(rng, frameSize)]++;
    var sc = 0, sv = 0, ss = 0;
    for (var s = 0; s < frameSize; s++) {
      if (slots[s] === 1) ss++;
      else if (slots[s] === 0) sv++;
      else sc++;
    }
    return { slots: slots, sc: sc, sv: sv, ss: ss };
  }

  /*
   * Uma identificação completa de `tags` etiquetas com DFSA.
   * Retorna os totais e, opcionalmente, o histórico de cada frame.
   */
  function identifyDFSA(tags, initialFrame, tipo, rng, keepHistory) {
    var frameSize = initialFrame;
    var identified = 0;
    var tot = { sc: 0, sv: 0, ss: 0, frames: 0, slots: 0 };
    var history = keepHistory ? [] : null;
    while (identified < tags) {
      var f = runFrame(frameSize, tags - identified, rng);
      identified += f.ss;
      tot.sc += f.sc; tot.sv += f.sv; tot.ss += f.ss;
      tot.frames++; tot.slots += frameSize;
      var next = identified < tags ? nextFrameSize(tipo, frameSize, f.sc, f.sv, f.ss) : null;
      if (history) {
        history.push({
          frameSize: frameSize, slots: f.slots, sc: f.sc, sv: f.sv, ss: f.ss,
          identified: identified, next: next
        });
      }
      if (next !== null) frameSize = next;
    }
    tot.history = history;
    return tot;
  }

  /*
   * QAlgorithm (EPC Gen2): um slot por vez, Q ajustado por Cq.
   */
  function identifyQ(tags, rng, opts) {
    opts = opts || {};
    var Qfp = opts.q0 != null ? opts.q0 : 4;
    var Cq = opts.cq != null ? opts.cq : 0.2;
    var Q = Math.round(Qfp);
    var n = tags;
    var tot = { sc: 0, sv: 0, ss: 0, frames: 0, slots: 0 };
    var guard = 0;
    while (n > 0 && guard++ < 1e7) {
      // Cada etiqueta responde com prob. 1/2^Q; só importa se 0, 1 ou >= 2
      // responderam, então sorteamos direto dessa distribuição (mesmo
      // resultado do laço do Java, porém O(1) por slot).
      var p = 1 / Math.pow(2, Q);
      var p0 = Math.pow(1 - p, n);
      var p1 = n * p * Math.pow(1 - p, n - 1);
      var u = rng();
      var responders = u < p0 ? 0 : (u < p0 + p1 ? 1 : 2);
      if (responders === 0) { Qfp = Math.max(0, Qfp - Cq); tot.sv++; }
      else if (responders === 1) { n--; tot.ss++; }
      else { Qfp = Math.min(15, Qfp + Cq); tot.sc++; }
      Q = Math.round(Qfp);
      tot.slots++;
    }
    tot.frames = tot.slots;
    return tot;
  }

  /*
   * Equivalente a DFSASimulator.run(): para cada passo, roda `sims`
   * identificações e tira a média.
   */
  function simulate(params, onProgress, rng) {
    rng = rng || Math.random;
    var results = [];
    var tags = params.initialTags;
    for (var i = 0; i < params.steps; i++) {
      var acc = { sc: 0, sv: 0, ss: 0, frames: 0, slots: 0 };
      for (var j = 0; j < params.sims; j++) {
        var r = params.estimator === 'Q'
          ? identifyQ(tags, rng)
          : identifyDFSA(tags, params.initialFrame, params.estimator, rng, false);
        acc.sc += r.sc; acc.sv += r.sv; acc.ss += r.ss;
        acc.frames += r.frames; acc.slots += r.slots;
      }
      var n = params.sims;
      var total = (acc.sc + acc.sv + acc.ss) / n;
      results.push({
        tags: tags,
        sc: acc.sc / n, sv: acc.sv / n, ss: acc.ss / n,
        frames: acc.frames / n, total: total,
        efficiency: (acc.ss / n) / total
      });
      if (onProgress) onProgress(i + 1, params.steps);
      tags += params.increment;
    }
    return results;
  }

  root.DFSA = {
    MAX_FRAME: MAX_FRAME,
    lowerBound: lowerBound,
    eomLee: eomLee,
    nextFrameSize: nextFrameSize,
    runFrame: runFrame,
    identifyDFSA: identifyDFSA,
    identifyQ: identifyQ,
    simulate: simulate
  };
})(typeof self !== 'undefined' ? self : this);
