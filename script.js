(function () {
  // --- Expandable excerpts + clickable tiles -------------------------------
  // Delegated so it covers both the static page tiles and search results that
  // are injected later.
  document.addEventListener("click", function (e) {
    if (e.target.closest("a")) return;          // real links (incl. in excerpts) navigate
    var ex = e.target.closest(".excerpt");
    // Only excerpts that are actually clipped respond; a short one that already
    // shows in full has nothing to expand, so the click falls through.
    if (ex && ex.classList.contains("expandable")) {
      ex.classList.toggle("expanded");
      return;
    }
    var card = e.target.closest(".items li.card");
    if (card && card.dataset.href) window.location.href = card.dataset.href;
  });

  // Flag the excerpts whose text overflows the two-line clamp. Has to be
  // measured rather than guessed: it depends on the column width and the font,
  // so it is redone on resize, once webfonts land, and whenever tiles appear.
  function markExpandable() {
    var els = document.querySelectorAll(".excerpt");
    [].forEach.call(els, function (el) {
      var open = el.classList.contains("expanded");
      if (open) el.classList.remove("expanded");   // measure it clamped
      var clipped = el.scrollHeight > el.clientHeight + 1;
      el.classList.toggle("expandable", clipped);
      if (open && clipped) el.classList.add("expanded");
    });
  }

  var remeasure;
  window.addEventListener("resize", function () {
    clearTimeout(remeasure);
    remeasure = setTimeout(markExpandable, 150);
  });
  if (document.fonts) document.fonts.ready.then(function () { markExpandable(); });
  markExpandable();

  // --- Site search ---------------------------------------------------------
  var input = document.getElementById("search-input");
  var results = document.getElementById("search-results");
  var list = document.getElementById("search-list");
  var status = document.getElementById("search-status");
  var page = document.getElementById("page");
  var scopeBoxes = [].slice.call(document.querySelectorAll(".scope"));
  if (!input) return;

  // The index is fetched once, on first interaction, so it never delays page load.
  var indexPromise = null;
  function loadIndex() {
    if (!indexPromise) {
      indexPromise = fetch("search-index.json")
        .then(function (r) { return r.json(); })
        .catch(function () { return []; });
    }
    return indexPromise;
  }

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }
  function stripTags(s) { return String(s).replace(/<[^>]*>/g, " "); }

  // Tiny inline-Markdown, mirroring build.py's md_inline (escape first, then
  // [label](url), **bold**, *italic*).
  function mdInline(s) {
    s = esc(s);
    s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, function (_m, label, url) {
      if (!/^(https?:|\/|#|mailto:)/.test(url) && /\./.test(url)) url = "https://" + url;
      return '<a href="' + url + '">' + label + "</a>";
    });
    s = s.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
    s = s.replace(/\*(.+?)\*/g, "<em>$1</em>");
    return s;
  }

  // CSS drops the scope checkboxes on narrow screens (it sets `--fits: 0`).
  // A filter you cannot see or undo must not apply, so in that case search
  // everything: null means "no scope filter".
  function scopesUsable() {
    var el = document.querySelector(".scopes");
    return !el ||
           getComputedStyle(el).getPropertyValue("--fits").trim() !== "0";
  }

  function enabledScopes() {
    if (!scopesUsable()) return null;
    return scopeBoxes.filter(function (b) { return b.checked; })
                     .map(function (b) { return b.value; });
  }

  function cardHTML(it) {
    var href = it.url || it.page;
    var title = href ? '<a href="' + esc(href) + '">' + esc(it.title) + "</a>"
                     : esc(it.title);
    // Member tiles are not clickable as a whole — only the name links out, as
    // on members.html. Other tiles stay click-anywhere.
    var dataHref = it.url && it.t !== "members"
                 ? ' data-href="' + esc(it.url) + '"' : "";
    var cls = it.t === "members" ? "thumb avatar" : "thumb";
    var img = it.img ? '<img class="' + cls + '" src="img/' + esc(it.img) + '" alt="">' : "";
    var meta = it.meta ? '<p class="meta">' + it.meta + "</p>" : "";
    var text = it.text ? '<p class="excerpt">' + mdInline(it.text) + "</p>" : "";
    return '<li class="card"' + dataHref + ">" + '<div class="item-body"><h3>' +
           title + "</h3>" + meta + text + "</div>" + img + "</li>";
  }

  function showResults(on) {
    results.hidden = !on;
    page.hidden = on;
    markExpandable();   // hidden elements measure 0; re-check whatever is now visible
  }

  function run() {
    var query = input.value.trim().toLowerCase();
    if (!query) { showResults(false); return; }
    var terms = query.split(/\s+/);
    var scopes = enabledScopes();
    loadIndex().then(function (data) {
      var matches = data.filter(function (it) {
        if (scopes && scopes.indexOf(it.t) === -1) return false;
        var hay = (it.title + " " + it.text + " " + it.kw + " " +
                   stripTags(it.meta)).toLowerCase();
        return terms.every(function (t) { return hay.indexOf(t) !== -1; });
      });
      list.innerHTML = matches.map(cardHTML).join("");
      var n = matches.length;
      status.textContent = n ? (n + (n === 1 ? " result" : " results"))
                             : "No matches.";
      showResults(true);
    });
  }

  input.addEventListener("input", run);
  input.addEventListener("focus", loadIndex);     // warm the index early
  scopeBoxes.forEach(function (b) { b.addEventListener("change", run); });

  // Scope checkboxes live overlaid on the right of the field; reveal them once
  // the field is first focused and keep them shown. Pad the input so typed text
  // never slides under them.
  var bar = input.closest(".searchbar");
  var scopes = bar && bar.querySelector(".scopes");
  function fitPadding() {
    if (!scopes) return;
    // On narrow screens CSS drops the checkboxes, so no overlay padding is
    // needed; otherwise reserve room so text never slides under them.
    if (!scopesUsable()) {
      input.style.paddingRight = "";
    } else {
      input.style.paddingRight = (scopes.offsetWidth + 18) + "px";
    }
  }
  // Light + checkboxes shown whenever the field has text OR anything in the bar
  // is focused; back to dark + hidden only when empty and nothing is focused.
  function updateActive() {
    var active = input.value.trim() !== "" || bar.contains(document.activeElement);
    bar.classList.toggle("active", active);
    if (active) fitPadding(); else input.style.paddingRight = "";
  }
  bar.addEventListener("focusin", updateActive);
  bar.addEventListener("focusout", function () { setTimeout(updateActive, 0); });
  input.addEventListener("input", updateActive);
  window.addEventListener("resize", function () {
    if (bar.classList.contains("active")) fitPadding();
  });

  // Esc clears the field — scoped to the input only (no global key shortcuts,
  // which would clash with screen-reader quick-nav and Firefox's "/" find).
  input.addEventListener("keydown", function (e) {
    if (e.key === "Escape") { input.value = ""; run(); input.blur(); updateActive(); }
  });
})();
