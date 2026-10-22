// Roda as simulações fora da thread principal para não travar a página.
importScripts('simulator.js');

self.onmessage = function (e) {
  var params = e.data;
  var results = self.DFSA.simulate(params, function (done, total) {
    self.postMessage({ type: 'progress', estimator: params.estimator, done: done, total: total });
  });
  self.postMessage({ type: 'done', estimator: params.estimator, results: results });
};
