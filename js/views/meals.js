// Meals: recipes emailed in to moosemagnoliabrown+recipe@gmail.com (a scheduled task parses
// them, strips the fluff, and appends to D.recipes) and a Mon-Sun this-week meal plan. Tapping a
// recipe's ingredients adds that one ingredient to the Shopping list -- no bulk "add all" button,
// by design, so you only grab what you don't already have.
//
// Two tabs, like a .seg toggle: "This week" (a 7-day bar + the day's planned recipe) and
// "Recipes" (a scrollable list you assign onto a day). The week is always THIS calendar week
// (Mon start), so it rolls over on its own -- no manual reset needed.
//
// D.meal_plan is date-keyed ("YYYY-MM-DD" -> recipe id), same idea as the chores day-grid, and
// for the same reason: dashboard.json is re-fetched every 5 minutes, which would otherwise wipe
// out a plan you just set. Assignments made from the UI are layered on top via window.MealPlan
// (localStorage), exactly like ChoreProgress does for chore checkmarks.
(function () {
  'use strict';
  var D = window.DATA, V = { el: null, tab: 'week', day: null, assignTarget: null };
  var DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  var DOW_FULL = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

  function pad2(n) { return n < 10 ? '0' + n : '' + n; }
  function dkey(d) { return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); }
  // Monday-of-this-week at local midnight.
  function startOfWeek() {
    var n = App.now();
    var d = new Date(n.getFullYear(), n.getMonth(), n.getDate());
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    return d;
  }
  function dateForDay(i) { var d = new Date(startOfWeek()); d.setDate(d.getDate() + i); return d; }
  function todayIdx() { return (App.now().getDay() + 6) % 7; }
  function selectedDay() { return V.day == null ? todayIdx() : V.day; }
  function recipeById(id) { return D.recipes.filter(function (r) { return r.id === id; })[0]; }

  // ------------------------------------------------------------ shopping-list hookup
  // Deliberately minimal: strip a leading quantity/unit off the ingredient line so "2 cups rice"
  // becomes "Rice" on the list, then dedupe against what's already there the same way Shopping's
  // own quick-add does. Not perfect for every phrasing -- the person can always edit/remove it on
  // the Shopping page same as anything else they add.
  var UNIT_RE = /^(cups?|tbsp\.?|tablespoons?|tsp\.?|teaspoons?|lbs?\.?|pounds?|oz\.?|ounces?|cloves?|cans?|g|kg|ml|l|liters?|pinch(?:es)?|slices?|stalks?|bunch(?:es)?|packages?|boxes?)\b\.?\s*(of\s+)?/i;
  function cleanIngredientName(raw) {
    var s = raw.replace(/^[\s\d½¼¾⅓⅔⅛⅜⅝⅞./–-]+/, '').replace(UNIT_RE, '').trim();
    if (!s) s = raw.trim();
    return s.charAt(0).toUpperCase() + s.slice(1);
  }
  function addIngredientToShopping(raw) {
    var name = cleanIngredientName(raw);
    var existing = D.groceries.filter(function (g) { return !g.done && g.name.toLowerCase() === name.toLowerCase(); })[0];
    if (existing) { existing.qty++; }
    else {
      var cat = D.catalog.filter(function (c) { return c[0].toLowerCase() === name.toLowerCase(); })[0];
      D.groceries.push({
        id: D._gid(), name: cat ? cat[0] : name, cat: cat ? cat[1] : 'Other',
        qty: 1, store: (cat && cat[2]) || (D.stores[0] && D.stores[0].id) || null, done: false, note: ''
      });
    }
    App.emit('data');
    App.toast('Added <b>' + App.esc(name) + '</b> to Shopping', { icon: 'cart', ms: 2200 });
  }

  function setMeal(key, recipeId) {
    if (recipeId) D.meal_plan[key] = recipeId; else delete D.meal_plan[key];
    window.MealPlan.set(key, recipeId);
    App.emit('data');
  }

  // ------------------------------------------------------------ shared recipe markup
  function ingredientsHTML(r) {
    return '<ul class="mr-ing">' + r.ingredients.map(function (ing, i) {
      return '<li><button class="mr-add" data-add-ing="' + r.id + ':' + i + '" aria-label="Add to shopping list">' + App.icon('plus', 18) + '</button><span>' + App.esc(ing) + '</span></li>';
    }).join('') + '</ul>';
  }
  function instructionsHTML(r) {
    if (!r.instructions || !r.instructions.length) return '';
    return '<div class="label">Instructions</div><ol class="mr-steps">' + r.instructions.map(function (s) {
      return '<li>' + App.esc(s) + '</li>';
    }).join('') + '</ol>';
  }
  function recipeMetaHTML(r) {
    return (r.servings ? 'Serves ' + r.servings : 'Recipe') + (r.from ? ' · from ' + App.esc(r.from) : '');
  }

  // ------------------------------------------------------------ "This week" tab
  function weekbarHTML() {
    return [0, 1, 2, 3, 4, 5, 6].map(function (i) {
      var d = dateForDay(i), key = dkey(d), has = !!D.meal_plan[key];
      return '<button class="mw-day' + (i === todayIdx() ? ' is-today' : '') + (i === selectedDay() ? ' is-sel' : '') + '" data-day="' + i + '">' +
        '<span class="mw-dow">' + DOW[i] + '</span><span class="mw-date num">' + d.getDate() + '</span>' +
        (has ? '<i class="mw-dot"></i>' : '') + '</button>';
    }).join('');
  }
  // A day's D.meal_plan[key] value is either a recipe id (looked up in D.recipes) or, for a
  // quick/manual entry like "Spaghetti" that doesn't need a recipe, the plain typed name itself
  // -- recipeById() simply won't find a match for that string, and that's how the two are told
  // apart (no separate flag needed).
  function dayPaneHTML(i) {
    var d = dateForDay(i), key = dkey(d), v = D.meal_plan[key];
    var head = '<div class="label">' + DOW_FULL[i] + ' · ' + App.fmt.month(d) + ' ' + d.getDate() + '</div>';
    if (!v) {
      return head + '<div class="mw-empty-wrap">' +
        '<div class="mw-empty serif">Nothing planned yet.</div>' +
        '<div class="mw-empty-actions"><button class="btn btn--solid" data-quick-sheet="' + key + '">+ Add a meal</button>' +
        '<button class="btn btn--ghost" data-choose="' + key + '">Choose a recipe</button></div>' +
        '</div>';
    }
    var r = recipeById(v);
    if (!r) {
      return head + '<h2 class="serif mw-title">' + App.esc(v) + '</h2>' +
        '<div class="label">Added manually · no recipe</div>' +
        '<div class="mw-actions"><button class="btn btn--ghost" data-choose="' + key + '">Change</button><button class="btn btn--ghost" data-unassign="' + key + '">Remove</button></div>';
    }
    return head + '<h2 class="serif mw-title">' + App.esc(r.title) + '</h2>' +
      '<div class="label">' + recipeMetaHTML(r) + '</div>' +
      '<div class="label">Ingredients</div>' + ingredientsHTML(r) +
      instructionsHTML(r) +
      '<div class="mw-actions"><button class="btn btn--ghost" data-choose="' + key + '">Change recipe</button><button class="btn btn--ghost" data-unassign="' + key + '">Remove</button></div>';
  }

  // ------------------------------------------------------------ "Recipes" tab
  function assignTargetLabel() {
    for (var i = 0; i < 7; i++) { if (dkey(dateForDay(i)) === V.assignTarget) return DOW_FULL[i]; }
    return '';
  }
  function recipesTabHTML() {
    var banner = V.assignTarget
      ? '<div class="mw-assignbar"><span>Choose a recipe for <b>' + assignTargetLabel() + '</b></span><button class="btn btn--ghost" data-cancel-assign>Cancel</button></div>'
      : '';
    if (!D.recipes.length) {
      return banner + '<div class="mw-empty serif">No recipes yet.<br><i>Email one to moosemagnoliabrown+recipe@gmail.com</i><br>and it’ll show up here.</div>';
    }
    return banner + '<div class="mr-grid">' + D.recipes.slice().reverse().map(function (r) {
      return '<button class="mr-card" data-recipe="' + r.id + '">' +
        '<div class="label">' + (r.servings ? 'Serves ' + r.servings : 'Recipe') + '</div>' +
        '<div class="mr-card-title serif">' + App.esc(r.title) + '</div>' +
        '<div class="mr-card-meta">' + r.ingredients.length + ' ingredients' + (r.from ? ' · from ' + App.esc(r.from) : '') + '</div>' +
        '</button>';
    }).join('') + '</div>';
  }

  function openRecipeSheet(r) {
    App.sheet(
      '<div class="sheet-pad mr-sheet">' +
      '<div class="label">' + (r.servings ? 'Serves ' + r.servings : 'Recipe') + (r.from ? ' · from ' + App.esc(r.from) : '') + '</div>' +
      '<h2 class="serif sheet-h">' + App.esc(r.title) + '</h2>' +
      '<div class="label">Ingredients</div>' + ingredientsHTML(r) +
      instructionsHTML(r) +
      '<div class="label">Add to a day</div>' +
      '<div class="chips mr-days">' + [0, 1, 2, 3, 4, 5, 6].map(function (i) {
        var d = dateForDay(i), key = dkey(d), on = D.meal_plan[key] === r.id;
        return '<button class="chip' + (on ? ' is-on' : '') + '" data-assign-day="' + key + '" data-assign-recipe="' + r.id + '">' + DOW[i] + ' ' + d.getDate() + '</button>';
      }).join('') + '</div>' +
      '</div>',
      {
        cls: 'sheet--wide',
        onMount: function (s) {
          s.addEventListener('click', function (e) {
            var t;
            if ((t = e.target.closest('[data-add-ing]'))) {
              var parts = t.dataset.addIng.split(':'), rec = recipeById(parts[0]);
              if (rec) addIngredientToShopping(rec.ingredients[+parts[1]]);
              return;
            }
            if ((t = e.target.closest('[data-assign-day]'))) {
              setMeal(t.dataset.assignDay, t.dataset.assignRecipe);
              App.toast('Added to the plan', { icon: 'utensils', ms: 1800 });
              App.$$('[data-assign-day]', s).forEach(function (b) { b.classList.toggle('is-on', b.dataset.assignDay === t.dataset.assignDay); });
              return;
            }
          });
        }
      }
    );
  }

  // ------------------------------------------------------------ paint / events
  function paint() {
    var el = V.el;
    el.querySelector('.meals-seg').innerHTML = '<div class="seg">' +
      '<button data-tab="week" class="' + (V.tab === 'week' ? 'is-on' : '') + '">This week</button>' +
      '<button data-tab="recipes" class="' + (V.tab === 'recipes' ? 'is-on' : '') + '">Recipes<span class="num">' + D.recipes.length + '</span></button>' +
      '</div>';
    el.querySelector('.meals-body').innerHTML = V.tab === 'week'
      ? '<div class="mw-bar">' + weekbarHTML() + '</div><div class="mw-pane">' + dayPaneHTML(selectedDay()) + '</div>'
      : recipesTabHTML();
  }

  // Quick/manual entry: no recipe behind it, just a plain name typed straight into a day --
  // dayPaneHTML() and weekbarHTML() treat it exactly like a recipe id that happens not to
  // resolve, so nothing else needs to know this path exists. Uses the same sheet pattern as
  // Calendar's "Add event" (big serif input + tappable idea chips) rather than a cramped inline
  // text box in the day pane itself.
  var QUICK_IDEAS = ['Spaghetti', 'Tacos', 'Pizza night', 'Breakfast for dinner', 'Leftovers', 'Takeout'];
  function openQuickSheet(key) {
    App.sheet(
      '<div class="sheet-pad add">' +
      '<div class="label">New meal</div>' +
      '<input class="big-input serif" placeholder="What’s for dinner?" data-f="title">' +
      '<div class="chips">' + QUICK_IDEAS.map(function (i) { return '<button class="chip chip--ghost" data-idea="' + i + '">' + i + '</button>'; }).join('') + '</div>' +
      '<div class="sheet-actions"><button class="btn btn--ghost" data-close>Cancel</button><button class="btn btn--solid" data-save>Add</button></div>' +
      '</div>',
      {
        onMount: function (s, close) {
          var input = s.querySelector('[data-f="title"]');
          function save() {
            var val = input.value.trim();
            if (!val) { input.focus(); return; }
            setMeal(key, val);
            App.toast('Added <b>' + App.esc(val) + '</b> to the plan', { icon: 'utensils' });
            close();
            paint();
          }
          s.addEventListener('click', function (e) {
            var t;
            if ((t = e.target.closest('[data-idea]'))) { input.value = t.dataset.idea; input.focus(); return; }
            if (e.target.closest('[data-save]')) save();
          });
          input.addEventListener('keydown', function (e) { if (e.key === 'Enter') save(); });
          input.focus();
        }
      }
    );
  }

  function onClick(e) {
    var t;
    if ((t = e.target.closest('[data-tab]'))) { V.tab = t.dataset.tab; paint(); return; }
    if ((t = e.target.closest('[data-day]'))) { V.day = +t.dataset.day; paint(); return; }
    if ((t = e.target.closest('[data-choose]'))) { V.assignTarget = t.dataset.choose; V.tab = 'recipes'; paint(); return; }
    if ((t = e.target.closest('[data-unassign]'))) { setMeal(t.dataset.unassign, null); paint(); return; }
    if ((t = e.target.closest('[data-cancel-assign]'))) { V.assignTarget = null; paint(); return; }
    if ((t = e.target.closest('[data-quick-sheet]'))) { openQuickSheet(t.dataset.quickSheet); return; }
    if ((t = e.target.closest('[data-add-ing]'))) {
      var parts = t.dataset.addIng.split(':'), rec = recipeById(parts[0]);
      if (rec) addIngredientToShopping(rec.ingredients[+parts[1]]);
      return;
    }
    if ((t = e.target.closest('[data-recipe]'))) {
      var r = recipeById(t.dataset.recipe);
      if (!r) return;
      if (V.assignTarget) {
        setMeal(V.assignTarget, r.id);
        App.toast('Added <b>' + App.esc(r.title) + '</b> to the plan', { icon: 'utensils' });
        for (var i = 0; i < 7; i++) { if (dkey(dateForDay(i)) === V.assignTarget) V.day = i; }
        V.assignTarget = null; V.tab = 'week'; paint();
      } else {
        openRecipeSheet(r);
      }
      return;
    }
  }

  App.register('meals', {
    show: function (el) {
      V.el = el;
      if (!el.firstChild) {
        el.innerHTML = '<div class="meals"><div class="meals-seg"></div><div class="meals-body"></div></div>';
        el.addEventListener('click', onClick);
      }
      paint();
    }
  });
  App.on('data', function () { if (App.current === 'meals') paint(); });
})();
