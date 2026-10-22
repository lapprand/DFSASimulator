(function () {
  'use strict';
  var DFSA = window.DFSA;
  var $ = function (id) { return document.getElementById(id); };
  var fmt = function (x, d) {
    return Number(x).toLocaleString('pt-BR', { maximumFractionDigits: d == null ? 1 : d });
  };
  function intVal(id, min, max) {
    var v = parseInt($(id).value, 10);
    if (!isFinite(v)) v = min;
    v = Math.max(min, Math.min(max, v));
    $(id).value = v;
    return v;
  }

  /* ================= 1. Passo a passo ================= */
  var st = null;
  var playTimer = null;

  function stReset() {
    stStop();
    st = {
      tags: intVal('st-tags', 1, 2000),
      frameSize: intVal('st-frame', 1, 2000),
      estimator: $('st-est').value,
      identified: 0,
      frames: 0,
      slots: 0,
      done: false
    };
    $('st-slots').innerHTML = '';
    $('st-table').tBodies[0].innerHTML = '';
    $('st-msg').textContent = 'Clique em "Próximo frame" para o leitor abrir o primeiro frame com ' + st.frameSize + ' slots.';
    $('st-next').disabled = false;
    $('st-play').disabled = false;
    stStats();
  }

  function stStats() {
    var items = [
      [st.identified + ' / ' + st.tags, 'etiquetas identificadas'],
      [st.frames, 'frames usados'],
      [st.slots, 'slots usados'],
      [st.done ? '—' : st.frameSize, 'tamanho do próximo frame']
    ];
    $('st-stats').innerHTML = items.map(function (it) {
      return '<div class="stat"><b>' + it[0] + '</b><span>' + it[1] + '</span></div>';
    }).join('');
  }

  function stStep() {
    if (!st || st.done) return;
    var pending = st.tags - st.identified;
    var L = st.frameSize;
    var f = DFSA.runFrame(L, pending, Math.random);
    st.identified += f.ss;
    st.frames++;
    st.slots += L;
    var next = null;
    if (st.identified >= st.tags) {
      st.done = true;
    } else {
      next = DFSA.nextFrameSize(st.estimator, L, f.sc, f.sv, f.ss);
      st.frameSize = next;
    }

    var html = new Array(L);
    for (var i = 0; i < L; i++) {
      var n = f.slots[i];
      var cls = n === 0 ? 't-empty' : (n === 1 ? 't-success' : 't-collision');
      html[i] = '<div class="slot ' + cls + '" title="Slot ' + (i + 1) + ': ' + n + ' etiqueta(s)">' + (n || '') + '</div>';
    }
    $('st-slots').innerHTML = html.join('');

    var tbody = $('st-table').tBodies[0];
    Array.prototype.forEach.call(tbody.rows, function (r) { r.classList.remove('current'); });
    var tr = document.createElement('tr');
    tr.className = 'current';
    tr.innerHTML = '<td>' + st.frames + '</td><td>' + L + '</td><td>' + f.sv + '</td><td>' + f.ss +
      '</td><td>' + f.sc + '</td><td>' + st.identified + '</td><td>' + (next === null ? '—' : next) + '</td>';
    tbody.appendChild(tr);

    if (st.done) {
      $('st-msg').textContent = 'Todas as ' + st.tags + ' etiquetas identificadas em ' + st.frames +
        ' frames e ' + st.slots + ' slots (eficiência ' + fmt(100 * st.tags / st.slots) + '%).';
      $('st-next').disabled = true;
      $('st-play').disabled = true;
      stStop();
    } else {
      var reason = st.estimator === 'LowerBound'
        ? 'Lower Bound: 2 × ' + f.sc + ' colisões = ' + next
        : 'Eom-Lee: γ·c ≈ ' + fmt(DFSA.eomLee(L, f.sc, f.sv, f.ss), 2) + ' → ' + next;
      $('st-msg').textContent = f.ss + ' etiqueta(s) identificada(s) neste frame. ' +
        (pending - f.ss) + ' restante(s). Próximo frame (' + reason + ').';
    }
    stStats();
  }

  function stStop() {
    if (playTimer) clearInterval(playTimer);
    playTimer = null;
    $('st-play').textContent = '▶ Automático';
  }

  $('st-next').addEventListener('click', function () { stStop(); stStep(); });
  $('st-reset').addEventListener('click', stReset);
  $('st-play').addEventListener('click', function () {
    if (playTimer) { stStop(); return; }
    $('st-play').textContent = '❚❚ Pausar';
    stStep();
    playTimer = setInterval(stStep, 900);
  });
  ['st-tags', 'st-frame', 'st-est'].forEach(function (id) { $(id).addEventListener('change', stReset); });
  stReset();

  /* ================= 2. Comparação ================= */
  var COLORS = { 'LowerBound': '#e8590c', 'Eom-Lee': '#2563eb', 'Q': '#16a34a' };
  var LABELS = { 'LowerBound': 'Lower Bound', 'Eom-Lee': 'Eom-Lee', 'Q': 'Algoritmo Q' };
  var METRICS = {
    total: { label: 'Total de slots', d: 0 },
    sv: { label: 'Slots vazios', d: 0 },
    sc: { label: 'Slots em colisão', d: 0 },
    frames: { label: 'Frames', d: 1 },
    efficiency: { label: 'Eficiência (%)', d: 1, scale: 100 }
  };
  var metric = 'total';
  var data = {};
  var chart = null;
  var workers = [];

  function cssVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }

  function renderChart() {
    var m = METRICS[metric];
    var datasets = Object.keys(data).map(function (est) {
      return {
        label: LABELS[est],
        data: data[est].map(function (r) { return { x: r.tags, y: r[metric] * (m.scale || 1) }; }),
        borderColor: COLORS[est],
        backgroundColor: COLORS[est],
        pointRadius: 3,
        tension: 0.15
      };
    });
    var grid = cssVar('--border'), text = cssVar('--muted');
    var cfg = {
      type: 'line',
      data: { datasets: datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 300 },
        interaction: { mode: 'nearest', axis: 'x', intersect: false },
        scales: {
          x: { type: 'linear', title: { display: true, text: 'Número de etiquetas', color: text }, grid: { color: grid }, ticks: { color: text } },
          y: { title: { display: true, text: m.label, color: text }, grid: { color: grid }, ticks: { color: text }, beginAtZero: metric === 'efficiency' }
        },
        plugins: {
          legend: { position: 'top', align: 'start', labels: { color: text, usePointStyle: true } },
          tooltip: { callbacks: { label: function (c) { return c.dataset.label + ': ' + fmt(c.parsed.y, m.d); } } }
        }
      }
    };
    if (metric === 'efficiency') {
      cfg.data.datasets.push({
        label: '1/e (ótimo teórico)', data: [], borderColor: text, borderDash: [5, 5], pointRadius: 0
      });
      var xs = datasets.length ? datasets[0].data.map(function (p) { return p.x; }) : [];
      if (xs.length) {
        cfg.data.datasets[cfg.data.datasets.length - 1].data =
          [{ x: xs[0], y: 100 / Math.E }, { x: xs[xs.length - 1], y: 100 / Math.E }];
      }
    }
    if (chart) chart.destroy();
    if (window.Chart) chart = new Chart($('cmp-chart'), cfg);
    renderTable();
  }

  function renderTable() {
    var t = $('cmp-table');
    var ests = Object.keys(data);
    var m = METRICS[metric];
    if (!ests.length) { t.tHead.innerHTML = ''; t.tBodies[0].innerHTML = ''; return; }
    t.tHead.innerHTML = '<tr><th>Etiquetas</th>' + ests.map(function (e) {
      return '<th>' + LABELS[e] + '</th>';
    }).join('') + '</tr>';
    var rows = data[ests[0]].map(function (r, i) {
      return '<tr><td>' + r.tags + '</td>' + ests.map(function (e) {
        return '<td>' + fmt(data[e][i][metric] * (m.scale || 1), m.d) + '</td>';
      }).join('') + '</tr>';
    });
    t.tBodies[0].innerHTML = rows.join('');
  }

  document.querySelectorAll('.tabs button').forEach(function (b) {
    b.addEventListener('click', function () {
      document.querySelectorAll('.tabs button').forEach(function (o) { o.setAttribute('aria-selected', 'false'); });
      b.setAttribute('aria-selected', 'true');
      metric = b.dataset.metric;
      renderChart();
    });
  });

  function runComparison(ev) {
    if (ev) ev.preventDefault();
    workers.forEach(function (w) { w.terminate(); });
    workers = [];
    var ests = Array.prototype.map.call(
      document.querySelectorAll('input[name=est]:checked'), function (c) { return c.value; });
    if (!ests.length) return;
    var base = {
      initialFrame: intVal('cmp-frame', 1, DFSA.MAX_FRAME),
      initialTags: intVal('cmp-tags', 1, 5000),
      increment: intVal('cmp-inc', 1, 5000),
      steps: intVal('cmp-steps', 1, 50),
      sims: intVal('cmp-sims', 1, 5000)
    };
    var progress = document.querySelector('.progress');
    var bar = progress.querySelector('.bar');
    var label = progress.querySelector('.label');
    var done = {};
    ests.forEach(function (e) { done[e] = 0; });
    var totalSteps = base.steps * ests.length;
    progress.hidden = false;
    $('cmp-run').disabled = true;
    data = {};

    function update() {
      var sum = 0;
      for (var k in done) sum += done[k];
      bar.style.width = (100 * sum / totalSteps) + '%';
      label.textContent = 'Simulando… ' + sum + ' / ' + totalSteps + ' passos';
    }
    update();

    var finished = 0;
    ests.forEach(function (est) {
      var w;
      try { w = new Worker('worker.js'); } catch (err) { w = null; }
      var params = Object.assign({ estimator: est }, base);
      var onDone = function (results) {
        data[est] = results;
        finished++;
        // mantém a ordem fixa das séries
        var ordered = {};
        ests.forEach(function (e) { if (data[e]) ordered[e] = data[e]; });
        data = ordered;
        renderChart();
        if (finished === ests.length) {
          progress.hidden = true;
          $('cmp-run').disabled = false;
        }
      };
      if (!w) {
        // fallback (ex.: abrindo o arquivo localmente via file://)
        setTimeout(function () {
          onDone(DFSA.simulate(params, function (d) { done[est] = d; update(); }));
        }, 20);
        return;
      }
      workers.push(w);
      w.onmessage = function (e) {
        if (e.data.type === 'progress') { done[est] = e.data.done; update(); }
        else { onDone(e.data.results); w.terminate(); }
      };
      w.onerror = function () {
        w.terminate();
        onDone(DFSA.simulate(params));
      };
      w.postMessage(params);
    });
  }

  $('cmp-form').addEventListener('submit', runComparison);
  if (window.matchMedia) {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', renderChart);
  }
  runComparison();
})();
