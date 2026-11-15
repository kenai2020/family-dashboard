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
  var EMOJI_CHOICES = ['✅', '🧹', '🧺', '🍽️', '🛏️', '🪥', '📚', '🐕', '🗑️', '🧸', '🧦', '🚿'];
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
    return '<div class="ch-row">' +
      '<button class="ch' + (c.done ? ' is-done' : '') + (pend ? ' is-checking' : '') + (canCheck ? '' : ' is-locked') + '"' +
      (canCheck ? ' data-ch="' + c.id + '"' : '') + '>' +
      '<span class="ch-emoji">' + c.emoji + '<span class="ch-check"><svg viewBox="0 0 24 24" width="30" height="30"><path d="M5 12.5l4.5 4.5L19 7"/></svg></span></span>' +
      '<span class="ch-text"><b>' + App.esc(c.title) + '</b>' +
      (c.freq === 'weekly' ? '<small>Weekly · ' + DAY_LABELS[c.day] + '</small>' : c.stars ? '<small>' + App.icon('star', 14, 'i--fill') + c.stars + (c.doneBy ? ' · ' + App.person(c.doneBy).name : '') + '</small>' : (c.doneBy ? '<small>by ' + App.person(c.doneBy).name + '</small>' : '')) +
      '</span>' +
      '</button>' +
      (c.custom ? '<button class="ch-del" data-del-chore="' + c.id + '" aria-label="Remove chore">' + App.icon('x', 18) + '</button>' : '') +
      '</div>';
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
      '<button class="btn btn--ghost t-add" data-add-chore>' + App.icon('plus', 22) + ' Add chore</button>' +
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

  // Builds a chore from the UI: title, who it's for (including "Anyone"), daily vs. weekly (+
  // which day, if weekly), an emoji, and a star value. Saved via window.ChoreProgress.addChore so
  // it survives the 5-minute dashboard.json refresh the same way completion/stars already do.
  function addChoreSheet() {
    var st = { who: (D.people[0] && D.people[0].id) || 'any', freq: 'daily', day: todayIdx(), stars: 1, emoji: EMOJI_CHOICES[0] };
    App.sheet(
      '<div class="sheet-pad add">' +
      '<div class="label">New chore</div>' +
      '<input class="big-input serif" placeholder="What’s the chore?" data-f="title">' +
      '<div class="label">Icon</div><div class="chips">' + EMOJI_CHOICES.map(function (em) {
        return '<button class="chip' + (em === st.emoji ? ' is-on' : '') + '" data-emoji="' + em + '">' + em + '</button>';
      }).join('') + '</div>' +
      '<div class="label">Who</div><div class="add-who">' + D.people.map(function (p) {
        return '<button class="who-btn' + (p.id === st.who ? ' is-on' : '') + '" data-who="' + p.id + '" style="' + App.pstyle(p) + '">' + App.avatar(p, 56) + '<span>' + p.name + '</span></button>';
      }).join('') + '<button class="who-btn' + (st.who === 'any' ? ' is-on' : '') + '" data-who="any">' + App.avatar({ id: 'any', color: '#6B6B6B', ink: '#FFFFFF' }, 56) + '<span>Anyone</span></button></div>' +
      '<div class="add-row"><div><div class="label">Repeats</div><div class="chips">' +
      ['daily', 'weekly'].map(function (f) { return '<button class="chip' + (f === st.freq ? ' is-on' : '') + '" data-freq="' + f + '">' + (f === 'daily' ? 'Every day' : 'Weekly') + '</button>'; }).join('') +
      '</div></div>' +
      '<div class="add-day-wrap"' + (st.freq === 'weekly' ? '' : ' style="display:none"') + '><div class="label">Which day</div><div class="chips">' +
      DAY_LABELS.map(function (lbl, i) { return '<button class="chip' + (i === st.day ? ' is-on' : '') + '" data-wday="' + i + '">' + lbl + '</button>'; }).join('') +
      '</div></div></div>' +
      '<div class="label">Stars</div><div class="chips">' + [0, 1, 2, 3].map(function (n) {
        return '<button class="chip' + (n === st.stars ? ' is-on' : '') + '" data-stars="' + n + '">' + (n === 0 ? 'None' : '★ ' + n) + '</button>';
      }).join('') + '</div>' +
      '<div class="sheet-actions"><button class="btn btn--ghost" data-close>Cancel</button><button class="btn btn--solid" data-save>Add chore</button></div>' +
      '</div>', {
        cls: 'sheet--wide',
        onMount: function (s, close) {
          var input = s.querySelector('[data-f=title]');
          input.focus();
          s.addEventListener('click', function (ev) {
            var t = ev.target.closest('button');
            if (!t) return;
            if (t.dataset.emoji) { st.emoji = t.dataset.emoji; App.$$('[data-emoji]', s).forEach(function (b) { b.classList.toggle('is-on', b === t); }); }
            if (t.dataset.who) { st.who = t.dataset.who; App.$$('[data-who]', s).forEach(function (b) { b.classList.toggle('is-on', b === t); }); }
            if (t.dataset.freq) {
              st.freq = t.dataset.freq;
              App.$$('[data-freq]', s).forEach(function (b) { b.classList.toggle('is-on', b === t); });
              s.querySelector('.add-day-wrap').style.display = st.freq === 'weekly' ? '' : 'none';
            }
            if (t.dataset.wday != null) { st.day = +t.dataset.wday; App.$$('[data-wday]', s).forEach(function (b) { b.classList.toggle('is-on', b === t); }); }
            if (t.dataset.stars != null) { st.stars = +t.dataset.stars; App.$$('[data-stars]', s).forEach(function (b) { b.classList.toggle('is-on', b === t); }); }
            if (t.hasAttribute('data-save')) {
              var title = input.value.trim();
              if (!title) return input.focus();
              var chore = { id: 'custom-' + D._gid(), who: st.who, title: title, emoji: st.emoji, stars: st.stars, freq: st.freq, custom: true };
              if (st.freq === 'weekly') chore.day = st.day;
              window.ChoreProgress.addChore(chore);
              close();
              render();
              App.emit('data');
              App.toast('Added <b>' + App.esc(title) + '</b>', { icon: 'check', ms: 3000 });
            }
          });
        }
      }
    );
  }

  function onClick(e) {
    var t;
    if ((t = e.target.closest('[data-add-chore]'))) return addChoreSheet();
    if ((t = e.target.closest('[data-del-chore]'))) {
      var gone = D.chores.filter(function (x) { return x.id === t.dataset.delChore; })[0];
      window.ChoreProgress.removeChore(t.dataset.delChore);
      render();
      App.emit('data');
      if (gone) App.toast('Removed <b>' + App.esc(gone.title) + '</b>', { icon: 'check', ms: 2500 });
      return;
    }
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
