// Entry point. Order matters: each module attaches to the shared window.App.
//
// Upstream's main.js imports data.js synchronously (it builds window.DATA inline with fake mock
// data, no fetch involved). We replace that with real-data.js, which fetches data/dashboard.json
// and must finish before app.js and the view modules run (they all read window.DATA once at
// import time). Top-level await + dynamic import() gets us that ordering.
//
// CACHE-BUSTING: bump CB below whenever any file imported here changes content but keeps its
// path -- browsers have repeatedly served a stale cached copy of these modules under their
// unversioned URLs even well after a fresh deploy landed on GitHub Pages.
var CB = 'v=20';
import './icons.js?v=20';
await import('./real-data.js?' + CB);
await window.DATA_READY;
await import('./app.js?' + CB);
await import('./slideshow.js?' + CB);
await import('./views/home.js?' + CB);
await import('./views/calendar.js?' + CB);
await import('./views/tasks.js?' + CB);
await import('./views/shopping.js?' + CB);
await import('./views/control-simple.js?' + CB);
await import('./views/photos.js?' + CB);
await import('./views/weather.js?' + CB);

// app.js normally starts itself on 'DOMContentLoaded', but that event already fired long before
// this dynamic import chain finished (the fetch in real-data.js takes a moment), so its listener
// never gets attached in time. Start it ourselves instead -- the DOM is already ready by now.
window.App.start();
