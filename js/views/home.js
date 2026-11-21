// Home / Today: the glanceable overview. Never scrolls.
(function () {
  'use strict';
  var D = window.DATA, V = {};

  function clock() {
    var n = App.now();
    return '<div class="h-time num">' + App.fmt.time(n, false) + '<span class="h-ampm">' + App.fmt.ampm(n) + '</span></div>' +
      '<div class="h-date"><b>' + App.fmt.day(n) + '</b> ' + App.fmt.month(n) + ' ' + n.getDate() + '</div>';
  }

  function weather() {
    var w = App.weatherNow();
    var hours = App.hourly(7);
    var tmin = Math.min.apply(null, hours.map(function (h) { return h.t; }));
    var tmax = Math.max.apply(null, hours.map(function (h) { return h.t; }));
    return '<div class="h-wx-top">' +
      '<span class="h-wx-icon">' + App.icon(w.cond, 60) + '</span>' +
      '<span class="h-wx-temp num">' + w.temp + '°</span>' +
      '<span class="h-wx-meta"><b>' + w.label + '</b><span>H ' + w.hi + '°  L ' + w.lo + '°</span></span>' +
      '</div>' +
      '<div class="h-wx-say"><b>' + w.summary + '.</b> ' + w.advice + '.</div>' +
      '<div class="h-wx-hours">' + hours.map(function (h) {
        var lift = tmax === tmin ? 0 : Math.round((h.t - tmin) / (tmax - tmin) * 8);
        return '<div class="h-hr' + (h.p >= 50 ? ' is-wet' : '') + '"><span class="h-hr-l">' + h.label + '</span>' +
          '<span class="h-hr-i" style="transform:translateY(' + -lift + 'px)">' + App.icon(h.c, 22) + '</span><b>' + h.t + '°</b></div>';
      }).join('') + '</div>';
  }

  function hero() {
    var e = App.nextEvent(), now = App.now();
    if (!e) {
      var tomorrow = App.timedOn(App.addDays(now, 1))[0];
      return '<div class="h-hero h-hero--empty" data-go="calendar">' +
        '<div class="label label--light">Rest of today</div>' +
        '<div class="h-hero-title serif">Nothing else scheduled.<br><i>Enjoy the quiet.</i></div>' +
        (tomorrow ? '<div class="h-hero-meta">Tomorrow starts with <b>' + App.esc(tomorrow.title) + '</b> at ' + App.fmt.time(tomorrow.start) + '</div>' : '') +
        '</div>';
    }
    var p = App.evColor(e);
    var mins = (e.start - now) / 60000;
    var leave = (App.leaveBy(e) - now) / 60000;
    var who = e.people.map(function (id) { return App.person(id).name; });
    var whoText = App.isFamily(e) ? 'Everyone' : who.join(' + ');
    var big = mins < 100
      ? '<div class="h-hero-count num">' + Math.round(mins) + '<small>min</small></div>'
      : '<div class="h-hero-count num">' + App.fmt.time(e.start, false) + '<small>' + App.fmt.ampm(e.start) + '</small></div>';
    var leavePill = '';
    if (e.travel) {
      leavePill = leave <= 0
        ? '<span class="pill pill--alert"><i class="pulse"></i>Leave now</span>'
        : '<span class="pill' + (leave <= 15 ? ' pill--soon' : '') + '">' + App.icon('car', 20) + 'Leave in ' + App.fmt.mins(leave) + '</span>';
    }
    return '<button class="h-hero" style="' + App.pstyle(p) + '" data-ev="' + e.id + '">' +
      '<div class="h-hero-main">' +
      '  <div class="label label--on">Next up · ' + App.esc(whoText) + '</div>' +
      '  <div class="h-hero-title serif">' + App.esc(e.title) + '</div>' +
      '  <div class="h-hero-meta">' + App.fmt.range(e.start, e.end) + (e.loc ? ' · ' + App.esc(e.loc) : '') + '</div>' +
      '  <div class="h-hero-foot">' + (e.people.length > 1 ? App.dots(e.people, 22) : '') + leavePill + '</div>' +
      '</div>' + big + '</button>';
  }

  function lanes() {
    var now = App.now();
    return D.people.map(function (p) {
      var list = App.timedOn(now, p.id).filter(function (e) { return e.end > now; });
      var shown = list.slice(0, 3), more = list.length - shown.length;
      return '<div class="h-lane" style="' + App.pstyle(p) + '">' +
        '<div class="h-lane-head">' + App.avatar(p, 30) + '<b>' + p.name + '</b></div>' +
        (list.length ? shown.map(function (e) {
          var cur = e.start <= now;
          return '<button class="h-ev' + (cur ? ' is-now' : '') + '" data-ev="' + e.id + '">' +
            '<span class="h-ev-t">' + (cur ? 'Now' : App.fmt.time(e.start, false)) + '</span>' +
            '<span class="h-ev-n">' + App.esc(e.title) + '</span></button>';
        }).join('') : '<div class="h-free serif"><i>Free</i> the rest of the day</div>') +
        (more > 0 ? '<button class="h-more" data-go="calendar">+' + more + ' more</button>' : '') +
        '</div>';
    }).join('');
  }

  function ring(done, total, size) {
    var r = size / 2 - 5, c = 2 * Math.PI * r, f = total ? done / total : 0;
    return '<svg class="ring" width="' + size + '" height="' + size + '" viewBox="0 0 ' + size + ' ' + size + '">' +
      '<circle cx="' + size / 2 + '" cy="' + size / 2 + '" r="' + r + '" class="ring-bg"/>' +
      '<circle cx="' + size / 2 + '" cy="' + size / 2 + '" r="' + r + '" class="ring-fg" stroke-dasharray="' + (c * f) + ' ' + c + '" transform="rotate(-90 ' + size / 2 + ' ' + size / 2 + ')"/></svg>';
  }
  App.ring = ring;

  // Chores are now a Sun-Sat week grid (see views/tasks.js): a chore is "active" today if it's
  // daily, or weekly and today is its assigned day. Done-ness is tracked per calendar date in
  // ChoreProgress, not on the chore object itself, so this widget reads today's record the same
  // way the Chores page does.
  function chores() {
    var todayIdx = App.now().getDay(), key = window.ChoreProgress ? window.ChoreProgress.dateKey(App.now()) : null;
    var active = D.chores.filter(function (c) { return c.freq === 'weekly' ? c.day === todayIdx : true; });
    var who = D.people.map(function (p) { return p.id; }).concat(['any']);
    return '<div class="label">Chores · Today</div><div class="h-rings">' + who.map(function (id) {
      var list = active.filter(function (c) { return c.who === id; });
      if (!list.length) return '';
      var done = list.filter(function (c) { return key && window.ChoreProgress.getRecord(key, c.id); }).length;
      var p = App.person(id);
      return '<div class="h-ring' + (done === list.length ? ' is-done' : '') + '" style="' + App.pstyle(p) + '">' + ring(done, list.length, 64) +
        '<b class="num">' + (done === list.length ? '✓' : done + '/' + list.length) + '</b><span>' + (id === 'any' ? 'Anyone' : p.name) + '</span></div>';
    }).join('') + '</div>';
  }

  function shopping() {
    var open = D.groceries.filter(function (g) { return !g.done; });
    var recent = open.slice(-3).reverse();
    return '<div class="label">Shopping</div>' +
      '<div class="h-stat"><span class="num">' + open.length + '</span><small>items to get</small></div>' +
      '<ul class="h-recent">' + recent.map(function (g) {
        return '<li><i></i>' + App.esc(g.name) + '</li>';
      }).join('') + '</ul>';
  }

  function status() {
    // Upstream drives this from a fake smart-home device list (D.devices/D.climate) with
    // interactive lights/locks/blinds. We don't have real smart-home integration here, so this
    // reads plain status fields instead -- informational only, nothing is actually controllable.
    var s = D.home_status || { lights_on: 0, all_locked: true, inside_temp_f: null };
    return '<div class="label">Home</div>' +
      '<div class="h-st-row">' + App.icon('bulb', 24) + '<b class="num">' + s.lights_on + '</b><span>light' + (s.lights_on === 1 ? '' : 's') + ' on</span></div>' +
      '<div class="h-st-row' + (s.all_locked ? '' : ' is-warn') + '">' + App.icon(s.all_locked ? 'lock' : 'unlock', 24) + '<span>' + (s.all_locked ? 'All locked' : 'Unlocked') + '</span></div>' +
      (s.inside_temp_f != null ? '<div class="h-st-row">' + App.icon('thermo', 24) + '<b class="num">' + s.inside_temp_f + '°</b><span>inside</span></div>' : '');
  }

  // ---------------------------------------------------------------- optional countdown widget
  // Picked from the rail (data-action="countdown", see app.js's railActions). When set, it takes
  // over the Home card (data-go="control") so the fixed 3-row layout never has to change.
  function daysUntil(dateStr) {
    var target = new Date(dateStr + 'T00:00:00');
    return Math.round((target - App.dayStart(App.now())) / 864e5);
  }
  // Returns { html, person } where person is the D.people entry (or D.family) whose color the
  // card should borrow -- only set when the countdown was picked from an existing calendar event
  // (which carries a people[] array); a typed custom countdown has no person to borrow from.
  function countdownCard() {
    if (!window.Countdown) return null;
    var c = window.Countdown.get();
    if (!c) return null;
    var days = daysUntil(c.date);
    if (days < 0) { window.Countdown.clear(); return null; } // quietly expire past dates
    var big = days === 0 ? '🎉' : days;
    var small = days === 0 ? 'Today!' : (days === 1 ? 'day to go' : 'days to go');
    var person = (c.people && c.people.length) ? (c.people.length >= D.people.length ? D.family : App.person(c.people[0])) : null;
    var labelCls = person ? 'label label--on' : 'label';
    return {
      person: person,
      html: '<div class="' + labelCls + '">Countdown</div>' +
        '<div class="h-stat"><span class="num">' + big + '</span><small>' + small + '</small></div>' +
        '<div class="h-count-title">' + App.esc(c.title) + '</div>'
    };
  }
  // The picker sheet: pulls upcoming events (today or later) as quick-pick rows, plus a custom
  // title/date fallback for anything not on the calendar, and a way to turn it back off.
  App.countdownSheet = function () {
    var today = App.dayStart(App.now());
    var seen = {}, rows = D.events
      .filter(function (e) { return e.end > today; })
      .sort(function (a, b) { return a.start - b.start; })
      .filter(function (e) {
        var k = e.title + '|' + window.Countdown.dateKey(e.start);
        if (seen[k]) return false;
        seen[k] = true; return true;
      })
      .slice(0, 10)
      .map(function (e) {
        return '<button class="more-row" data-pick="' + e.id + '"><i style="' + App.pstyle(App.evColor(e)) + '"></i>' +
          '<b>' + App.esc(e.title) + '</b><span>' + App.fmt.dayShort(e.start) + ' ' + App.fmt.month(e.start) + ' ' + e.start.getDate() + '</span></button>';
      }).join('');
    var current = window.Countdown.get();
    App.sheet(
      '<div class="sheet-pad">' +
      '<div class="label">Countdown to…</div><h2 class="serif sheet-h">Pick an event</h2>' +
      '<div class="more-list">' + (rows || '<p class="h-free serif"><i>No upcoming events yet.</i></p>') + '</div>' +
      '<div class="label" style="margin-top:18px">Or something else</div>' +
      '<input class="big-input serif" placeholder="What are you counting down to?" data-f="title">' +
      '<input class="big-input" type="date" data-f="date" min="' + window.Countdown.dateKey(today) + '">' +
      '<div class="sheet-actions">' +
      (current ? '<button class="btn btn--ghost" data-turn-off>Turn off countdown</button>' : '<button class="btn btn--ghost" data-close>Cancel</button>') +
      '<button class="btn btn--solid" data-set>Set countdown</button>' +
      '</div></div>',
      { cls: 'sheet--countdown', onMount: function (root, close) {
        root.querySelectorAll('[data-pick]').forEach(function (b) {
          b.addEventListener('click', function () {
            var e = App.findEvent(b.dataset.pick);
            if (!e) return;
            window.Countdown.set(e.title, window.Countdown.dateKey(e.start), e.people);
            close(); App.rerender();
          });
        });
        var off = root.querySelector('[data-turn-off]');
        if (off) off.addEventListener('click', function () { window.Countdown.clear(); close(); App.rerender(); });
        root.querySelector('[data-set]').addEventListener('click', function () {
          var title = root.querySelector('[data-f="title"]').value.trim();
          var date = root.querySelector('[data-f="date"]').value;
          if (!title || !date) return;
          window.Countdown.set(title, date);
          close(); App.rerender();
        });
      } }
    );
  };
  App.railActions.countdown = App.countdownSheet;

  function paint() {
    var el = V.el;
    el.querySelector('.h-clock').innerHTML = clock();
    el.querySelector('.h-weather').innerHTML = weather();
    el.querySelector('.h-hero-slot').innerHTML = hero();
    el.querySelector('.h-lanes').innerHTML = lanes();
    el.querySelector('.h-chores').innerHTML = chores();
    el.querySelector('.h-shop').innerHTML = shopping();
    var statusBtn = el.querySelector('.h-status'), cd = countdownCard();
    if (cd) {
      statusBtn.innerHTML = cd.html;
      statusBtn.dataset.action = 'countdown';
      delete statusBtn.dataset.go;
      if (cd.person) {
        statusBtn.classList.add('is-colored');
        statusBtn.setAttribute('style', App.pstyle(cd.person));
      } else {
        statusBtn.classList.remove('is-colored');
        statusBtn.removeAttribute('style');
      }
    } else {
      statusBtn.innerHTML = status();
      statusBtn.dataset.go = 'control';
      delete statusBtn.dataset.action;
      statusBtn.classList.remove('is-colored');
      statusBtn.removeAttribute('style');
    }
  }

  function photoCaption(s) {
    var m = App.photoMeta(s.photos[0]);
    V.el.querySelector('.h-photo-cap').innerHTML = '<b>' + (m.onThisDay ? 'On this day · ' : '') + m.kicker + '</b><span>' + App.esc(m.place) + '</span>';
  }

  App.register('home', {
    show: function (el) {
      V.el = el;
      if (!el.firstChild) {
        el.innerHTML = '<div class="home">' +
          '<div class="h-clock" data-go="calendar"></div>' +
          '<div class="h-weather" data-go="weather"></div>' +
          '<div class="h-main"><div class="h-hero-slot"></div><div class="h-lanes" style="grid-template-columns:repeat(' + D.people.length + ',1fr)"></div></div>' +
          '<div class="h-side">' +
          '  <button class="h-photo"><div class="h-photo-stage"></div><div class="h-photo-cap"></div></button>' +
          '  <button class="h-chores card" data-go="tasks"></button>' +
          '  <div class="h-duo"><button class="h-shop card" data-go="shopping"></button><button class="h-status card" data-go="control"></button></div>' +
          '</div></div>';
        el.addEventListener('click', function (e) {
          var ev = e.target.closest('[data-ev]');
          if (ev) { App.eventSheet(App.findEvent(ev.dataset.ev)); return; }
          var act = e.target.closest('[data-action]');
          if (act && App.railActions[act.dataset.action]) { App.railActions[act.dataset.action](); return; }
          var g = e.target.closest('[data-go]');
          if (g) App.go(g.dataset.go);
        });
        V.slides = new App.Slideshow(el.querySelector('.h-photo-stage'), { layout: 'cover', captions: false, interval: 12000, onChange: photoCaption });
      }
      paint();
      V.slides.start();
    },
    resume: function () { V.slides.start(); },
    hide: function () { if (V.slides) V.slides.stop(); }
  });
  // Every minute: just the clock and next-up countdown (cheap, even while hidden). Weather on the hour.
  App.on('minute', function (n) {
    if (!V.el || !V.el.firstChild) return;
    V.el.querySelector('.h-clock').innerHTML = clock();
    V.el.querySelector('.h-hero-slot').innerHTML = hero();
    if (n.getMinutes() === 0) { V.el.querySelector('.h-weather').innerHTML = weather(); V.el.querySelector('.h-lanes').innerHTML = lanes(); }
  });
  App.on('data', function () { if (App.current === 'home') paint(); });
})();
