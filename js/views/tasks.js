// Chores: a Sun-Sat week grid, one lane per person + "Anyone". A chore is either "daily" (shows
// up every day) or "weekly" (shows up only on its one assigned day, c.day = 0 Sun .. 6 Sat).
// Day tabs across the top let you flip through the whole week to see what's ahead or what got
// missed; only TODAY's column is actually checkable -- other days are a read-only look back/
// ahead. Completion is tracked per calendar date in window.ChoreProgress (see real-data.js), not
// as a flag on the chore object, since the same chore has a different done/not-done state on
// different days.
(function () {
  'use strict';
  var D = window.DATA;
  var DAY_LABELS = ['Su', 'M', 'Tu', 'W', 'Th', 'F', 'Sa'];
  var V = { el: null, day: null, pending: {} }; // V.day: 0-6, defaults to today

  function LANES() { return D.people.map(function (p) { return p.id; }).concat(['any']); }

  function todayIdx() { return App.now().getDay(); }
  function selectedDay() { return V.day == null ? todayIdx() : V.day; }
  function isToday(dayIdx) { return dayIdx === todayIdx(); }

  // Sunday-of-this-week at local midnight, so dateForDay/dateKey line up with App.now()'s zone.
  function startOfWeek() {
    var n = App.now();
    var d = new Date(n.getFullYear(), n.getMonth(), n.getDate());
    d.setDate(d.getDate() - d.getDay());
    return d;
  }
  function dateForDay(dayIdx) {
    var d = new Date(startOfWeek());
    d.setDate(d.getDate() + dayIdx);
    return d;
  }
  function keyForDay(dayIdx) { return window.ChoreProgress.dateKey(dateForDay(dayIdx)); }

  function activeOn(c, dayIdx) { return c.freq === 'weekly' ? c.day === dayIdx : true; }
  function doneOn(c, dayIdx) {
    var rec = window.ChoreProgress.getRecord(keyForDay(dayIdx), c.id);
    return rec ? { done: true, by: rec.by } : { done: false, by: null };
  }

  function listFor(who, dayIdx) {
    return D.chores.filter(function (c) { return c.who === who && activeOn(c, dayIdx); })
      .map(function (c) {
        var st = doneOn(c, dayIdx);
        return Object.assign({}, c, { done: st.done, doneBy: st.by });
      })
      .sort(function (a, b) { return a.done - b.done; });
  }

  function row(c, dayIdx) {
    var pend = V.pending[dayIdx + ':' + c.id];
    var canCheck = isToday(dayIdx);
    return '<button class="ch' + (c.done ? ' is-done' : '') + (pend ? ' is-checking' : '') + (canCheck ? '' : ' is-locked') + '"' +
      (canCheck ? ' data-ch="' + c.id + '"' : '') + '>' +
      '<span class="ch-emoji">' + c.emoji + '<span class="ch-check"><svg viewBox="0 0 24 24" width="30" height="30"><path d="M5 12.5l4.5 4.5L19 7"/></svg></span></span>' +
      '<span class="ch-text"><b>' + App.esc(c.title) + '</b>' +
      (c.freq === 'weekly' ? '<small>Weekly · ' + DAY_LABELS[c.day] + '</small>' : c.stars ? '<small>' + App.icon('star', 14, 'i--fill') + c.stars + (c.doneBy ? ' · ' + App.person(c.doneBy).name : '') + '</small>' : (c.doneBy ? '<small>by ' + App.person(c.doneBy).name + '</small>' : '')) +
      '</span>' +
      '</button>';
  }

  function lane(who, dayIdx) {
    var p = App.person(who), list = listFor(who, dayIdx);
    var done = list.filter(function (c) { return c.done; }).length;
    var all = list.length && done === list.length;
    var kid = D.stars[who] != null;
    return '<section class="ch-lane' + (all ? ' is-complete' : '') + '" data-lane="' + who + '" style="' + App.pstyle(p) + '">' +
      '<header class="ch-head">' + App.avatar(p, 42) +
      '<div><b>' + (who === 'any' ? 'Anyone' : p.name) + '</b>' +
      (kid ? '<span class="ch-stars">' + App.icon('star', 18, 'i--fill') + '<span class="num">' + D.stars[who] + '</span></span>' : '<span class="ch-sub">' + (who === 'any' ? 'Up for grabs' : (list.length ? done + ' of ' + list.length : 'Nothing')) + '</span>') + '</div>' +
      '<div class="ch-ring">' + App.ring(done, list.length || 1, 46) + '<span class="num">' + (all ? '✓' : list.length ? done + '/' + list.length : '–') + '</span></div>' +
      '</header>' +
      '<div class="ch-list">' + (list.length ? list.map(function (c) { return row(c, dayIdx); }).join('') : '<div class="ch-none serif"><i>Nothing ' + (isToday(dayIdx) ? 'today' : 'that day') + '</i></div>') +
      (all ? '<div class="ch-alldone serif">All done<i>!</i></div>' : '') + '</div>' +
      '</section>';
  }

  function render() {
    var dayIdx = selectedDay();
    var inDay = D.chores.filter(function (c) { return activeOn(c, dayIdx); });
    var done = inDay.filter(function (c) { return doneOn(c, dayIdx).done; }).length;
    var d = dateForDay(dayIdx);
    V.el.innerHTML = '<div class="tasks">' +
      '<header class="t-head">' +
      '<div class="t-title"><div class="label">' + (isToday(dayIdx) ? 'Today · ' : '') + App.fmt.day(d) + '</div><h1 class="serif">Chores</h1></div>' +
      '<div class="seg">' + DAY_LABELS.map(function (lbl, i) {
        return '<button class="' + (i === dayIdx ? 'is-on' : '') + (isToday(i) ? ' is-today' : '') + '" data-day="' + i + '">' + lbl + '</button>';
      }).join('') + '</div>' +
      '<div class="t-progress"><span class="num">' + done + '<small>/' + inDay.length + '</small></span><div class="t-bar"><i style="width:' + (inDay.length ? done / inDay.length * 100 : 0) + '%"></i></div><span class="label">done</span></div>' +
      '</header>' +
      '<div class="ch-lanes">' + LANES().map(function (w) { return lane(w, dayIdx); }).join('') + '</div>' +
      '</div>';
  }

  function complete(c, btn, by) {
    var dayIdx = selectedDay(), key = keyForDay(dayIdx), pendKey = dayIdx + ':' + c.id;
    V.pending[pendKey] = true;
    btn.classList.add('is-checking');
    setTimeout(function () {
      delete V.pending[pendKey];
      var earner = D.stars[c.who] != null ? c.who : (by && D.stars[by] != null ? by : null);
      window.ChoreProgress.toggle(key, c.id, true, by, earner, c.stars);
      render();
      App.emit('data');
      var laneList = listFor(c.who, dayIdx);
      var laneDone = laneList.every(function (x) { return x.done; });
      var allDone = D.chores.filter(function (x) { return activeOn(x, dayIdx); }).every(function (x) { return doneOn(x, dayIdx).done; });
      if (allDone) {
        App.toast('<b>Today’s chores complete!</b> Everyone crushed it.', { icon: 'star', ms: 5000 });
        return;
      }
      App.toast('<b>' + App.esc(c.title) + '</b> done' + (earner && c.stars ? ' · +' + c.stars + '★ ' + App.person(earner).name : ''), {
        icon: 'check',
        undo: function () {
          window.ChoreProgress.toggle(key, c.id, false, by, earner, c.stars);
          render();
          App.emit('data');
        }
      });
    }, 350);
  }

  // "Anyone" chores ask who did it, so stars go to the right kid
  function whoDidIt(c, btn) {
    App.sheet('<div class="sheet-pad"><div class="label">' + c.emoji + ' ' + App.esc(c.title) + '</div><h2 class="serif sheet-h">Who did it?</h2>' +
      '<div class="add-who add-who--big">' + D.people.map(function (p) {
        return '<button class="who-btn" data-by="' + p.id + '" style="' + App.pstyle(p) + '">' + App.avatar(p, 88) + '<span>' + p.name + '</span></button>';
      }).join('') + '</div></div>', {
      onMount: function (s, close) {
        s.addEventListener('click', function (e) {
          var b = e.target.closest('[data-by]');
          if (!b) return;
          close();
          var fresh = V.el.querySelector('[data-ch="' + c.id + '"]');
          complete(c, fresh || btn, b.dataset.by);
        });
      }
    });
  }

  function onClick(e) {
    var t;
    if ((t = e.target.closest('[data-day]'))) { V.day = +t.dataset.day; return render(); }
    if ((t = e.target.closest('[data-ch]'))) {
      var dayIdx = selectedDay();
      if (!isToday(dayIdx)) return; // other days are read-only history/preview
      var c = D.chores.filter(function (x) { return x.id === t.dataset.ch; })[0];
      var pendKey = dayIdx + ':' + c.id;
      if (!c || V.pending[pendKey]) return;
      var st = doneOn(c, dayIdx);
      if (st.done) {
        var earner = D.stars[c.who] != null ? c.who : (st.by && D.stars[st.by] != null ? st.by : null);
        window.ChoreProgress.toggle(keyForDay(dayIdx), c.id, false, st.by, earner, c.stars);
        render();
        App.emit('data');
        return;
      }
      if (c.who === 'any') return whoDidIt(c, t);
      complete(c, t);
    }
  }

  App.register('tasks', {
    show: function (el) {
      if (!V.el) { V.el = el; el.addEventListener('click', onClick); }
      render();
    },
    resume: function () { render(); }
  });
  App.on('time', function () { V.day = null; }); // snap back to "today" next time the clock rolls over
})();
