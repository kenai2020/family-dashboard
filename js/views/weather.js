// Weather detail: reached by tapping the weather panel on Today (same pattern as h-clock ->
// calendar). Shows today hour-by-hour plus the multi-day outlook from the National Weather
// Service (see real-data.js's fetchWeather()).
(function () {
  'use strict';
  var D = window.DATA, V = {};

  function nowBlock() {
    var w = App.weatherNow();
    return '<div class="wx-now">' +
      '<span class="wx-now-icon">' + App.icon(w.cond, 72) + '</span>' +
      '<span class="wx-now-temp num">' + w.temp + '°</span>' +
      '<span class="wx-now-meta"><b>' + w.label + '</b><span>H ' + w.hi + '°  L ' + w.lo + '°</span></span>' +
      '</div>' +
      '<div class="wx-now-say"><b>' + w.summary + '.</b> ' + w.advice + '.</div>';
  }

  function hoursBlock() {
    // Only the hours left in today (not wrapping into tomorrow -- App.hourly() reuses today's
    // t/c/p array for any count past 24, which would mislabel hours as "tomorrow" that are
    // really just today's data repeated).
    var remaining = 24 - App.now().getHours();
    var hours = App.hourly(Math.max(remaining, 1));
    return '<div class="label">Today, hour by hour</div><div class="wx-hours">' + hours.map(function (h) {
      return '<div class="wx-hr' + (h.p >= 50 ? ' is-wet' : '') + '">' +
        '<span class="wx-hr-l">' + h.label + '</span>' +
        '<span class="wx-hr-i">' + App.icon(h.c, 26) + '</span>' +
        '<b>' + h.t + '°</b>' +
        '<span class="wx-hr-p">' + (h.p > 0 ? h.p + '%' : '') + '</span>' +
        '</div>';
    }).join('') + '</div>';
  }

  function dayLabel(d, isToday) {
    if (isToday) return 'Today';
    return App.fmt.day(d).slice(0, 3);
  }

  function outlookBlock() {
    var outlook = D.weather.outlook || [];
    if (!outlook.length) return '';
    var today = App.now().toDateString();
    var byDate = [];
    outlook.forEach(function (period) {
      var d = new Date(period.start), key = d.toDateString();
      var entry = byDate.filter(function (x) { return x.key === key; })[0];
      if (!entry) { entry = { key: key, date: d, day: null, night: null }; byDate.push(entry); }
      if (period.isDaytime) entry.day = period; else entry.night = period;
    });
    return '<div class="label">Next few days</div><div class="wx-days">' + byDate.slice(0, 6).map(function (e) {
      var main = e.day || e.night;
      var pop = Math.max(e.day ? e.day.pop : 0, e.night ? e.night.pop : 0);
      return '<div class="wx-day">' +
        '<span class="wx-day-l">' + dayLabel(e.date, e.key === today) + '</span>' +
        '<span class="wx-day-i">' + App.icon(main.cond, 30) + '</span>' +
        '<span class="wx-day-t">' + (e.day ? '<b>' + e.day.temp + '°</b>' : '') + (e.night ? ' <span class="mute">' + e.night.temp + '°</span>' : '') + '</span>' +
        '<span class="wx-day-p">' + (pop > 0 ? App.icon('rain', 16) + pop + '%' : '') + '</span>' +
        '<span class="wx-day-short">' + App.esc(main.short) + '</span>' +
        '</div>';
    }).join('') + '</div>';
  }

  function paint() {
    V.el.querySelector('.wx-top').innerHTML = nowBlock();
    V.el.querySelector('.wx-section-hours').innerHTML = hoursBlock();
    V.el.querySelector('.wx-section-days').innerHTML = outlookBlock();
  }

  App.register('weather', {
    show: function (el) {
      if (!V.el) {
        V.el = el;
        // No sidebar entry for this page (reached only by tapping the weather panel on Today),
        // so it needs its own way back -- data-go works here the same as anywhere else, but each
        // view wires its own click listener rather than relying on a global one.
        el.innerHTML = '<div class="wx-page">' +
          '<header class="wx-head"><button class="btn btn--ghost" data-go="home">' + App.icon('left', 22) + ' Today</button><h1 class="serif">Weather</h1></header>' +
          '<div class="wx-top"></div>' +
          '<div class="wx-section wx-section-hours"></div>' +
          '<div class="wx-section wx-section-days"></div>' +
          '</div>';
        el.addEventListener('click', function (e) {
          var g = e.target.closest('[data-go]');
          if (g) App.go(g.dataset.go);
        });
      }
      paint();
    },
    resume: function () { paint(); }
  });

  App.on('data', function () { if (App.current === 'weather') paint(); });
})();
