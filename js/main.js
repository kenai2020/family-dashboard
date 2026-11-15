// Entry point. Order matters: each module attaches to the shared window.App.
//
// Upstream's main.js imports data.js synchronously (it builds window.DATA inline with fake mock
// data, no fetch involved). We replace that with real-data.js, which fetches data/dashboard.json
// and must finish before app.js and the view modules run (they all read window.DATA once at
// import time). Top-level await + dynamic import() gets us that ordering.
import './icons.js';
await import('./real-data.js');
await window.DATA_READY;
await import('./app.js');
await import('./slideshow.js');
await import('./views/home.js');
await import('./views/calendar.js');
await import('./views/tasks.js');
await import('./views/shopping.js');
await import('./views/control-simple.js');
