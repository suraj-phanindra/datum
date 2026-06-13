// web/tower.js — the tower's client runtime (read-only).
//
// 1. Hydrate the static markup from the server-embedded window.__DATUM__
//    snapshot (so the page shows the truth even with JS disabled the markup is
//    already correct; this step keeps a JS-driven page in sync with re-renders).
// 2. Subscribe to GET /stream (SSE) and route events by their EXACT `type`
//    string to update the epoch strip, registry rail, ledger, and footer.
//
// The live drift-card ANIMATION state machine is a SEPARATE later task (#8).
// This file deliberately exposes `window.DatumTower.onEvent(type, handler)` so
// that task can attach to the SAME single SSE router without forking it. For
// now the drift card is rendered statically from the snapshot.
//
// Read-only: this script NEVER POSTs to the bus.

(function () {
  "use strict";

  var root = document.getElementById("tower-root");
  if (!root) return;

  // ----------------------------------------------------------------------
  // tiny DOM helpers
  // ----------------------------------------------------------------------
  function $(sel) {
    return root.querySelector(sel);
  }
  function $all(sel) {
    return Array.prototype.slice.call(root.querySelectorAll(sel));
  }
  function hhmm(ts) {
    // ISO 8601 -> "14:02" (best-effort; falls back to the raw string).
    if (!ts) return "";
    var m = /T(\d{2}):(\d{2})/.exec(String(ts));
    return m ? m[1] + ":" + m[2] : String(ts);
  }

  // ----------------------------------------------------------------------
  // state — the in-memory mirror of the snapshot, advanced by SSE events.
  // ----------------------------------------------------------------------
  var snap = window.__DATUM__ || {};
  var state = {
    registryVersion: typeof snap.registry_version === "number" ? snap.registry_version : null,
    contracts: Array.isArray(snap.contracts) ? snap.contracts.slice() : [],
    deltas: Array.isArray(snap.deltas) ? snap.deltas.slice() : [],
    ledger: Array.isArray(snap.ledger) ? snap.ledger.slice() : [],
    sessionsLive: null,
  };

  // ----------------------------------------------------------------------
  // renderers — each is idempotent and reads from `state`.
  // ----------------------------------------------------------------------

  function renderEpoch() {
    if (state.registryVersion == null) return;
    var live = $("[data-epoch-live]");
    if (live) {
      // preserve the "· live · HH:MM" tail when present.
      var tail = "";
      var prev = live.textContent || "";
      var pm = /·\s*live\s*·\s*(.+)$/.exec(prev);
      if (pm) tail = " · live · " + pm[1].trim();
      else {
        var hero = mostRecentDelta();
        if (hero) tail = " · live · " + hhmm(hero.ts);
      }
      live.textContent = "v" + state.registryVersion + tail;
    }
  }

  function renderRegistry() {
    if (!state.contracts.length) return;
    var byId = {};
    state.contracts.forEach(function (c) {
      byId[c.id] = c;
    });
    $all("[data-contract]").forEach(function (row) {
      var id = row.getAttribute("data-contract");
      var c = byId[id];
      if (!c) return;
      var badge = row.querySelector("[data-contract-version]");
      if (badge) badge.textContent = "v" + c.current_version;
    });
  }

  function renderLedger() {
    if (!state.ledger.length) return;
    var box = $("[data-ledger]");
    if (!box) return;
    // newest first; the seed/store already returns DESC, but sort defensively.
    var rows = state.ledger
      .slice()
      .sort(function (a, b) {
        return (b.id || 0) - (a.id || 0);
      })
      .slice(0, 6);
    box.innerHTML = rows
      .map(function (e, i) {
        var last = i === rows.length - 1;
        var mb = last ? "0" : "7px";
        return (
          '<p style="font-size:11px; margin:0 0 ' +
          mb +
          '; line-height:1.5;">' +
          '<span style="font-family:var(--font-mono); color:var(--color-text-tertiary);">#' +
          escapeHtml(String(e.id)) +
          " " +
          escapeHtml(hhmm(e.ts)) +
          "</span> " +
          '<span style="color:var(--color-text-secondary);">' +
          escapeHtml(String(e.author || "")) +
          " · " +
          escapeHtml(String(e.description || "")) +
          "</span></p>"
        );
      })
      .join("");
  }

  function renderFooter() {
    var footer = $("[data-fleet-footer] span");
    if (!footer || state.registryVersion == null) return;
    var n = state.sessionsLive;
    var agents = n == null ? "3" : String(n);
    footer.textContent =
      "⌖ all sessions synced to v" +
      state.registryVersion +
      " · " +
      agents +
      " agents live · last delta 4m ago";
  }

  function mostRecentDelta() {
    if (!state.deltas.length) return null;
    return state.deltas.reduce(function (a, b) {
      return (b.epoch || 0) >= (a.epoch || 0) ? b : a;
    });
  }

  function escapeHtml(s) {
    return s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function renderAll() {
    renderEpoch();
    renderRegistry();
    renderLedger();
    renderFooter();
  }

  // ----------------------------------------------------------------------
  // SSE router — route by EXACT event `type` string (schema §3).
  // External listeners (e.g. the #8 drift-card animation) register via
  // window.DatumTower.onEvent(type, handler). The two `reconciled` events are
  // disambiguated on payload.workspace === true (RECONCILIATION §item 5), NOT
  // on the type string.
  // ----------------------------------------------------------------------
  var listeners = {}; // type -> [handler]
  function onEvent(type, handler) {
    (listeners[type] || (listeners[type] = [])).push(handler);
  }
  function fire(type, ev) {
    var hs = listeners[type];
    if (!hs) return;
    for (var i = 0; i < hs.length; i++) {
      try {
        hs[i](ev);
      } catch (e) {
        /* a bad listener must never break the router */
      }
    }
  }

  function routeEvent(ev) {
    if (!ev || typeof ev.type !== "string") return;
    var p = ev.payload || {};
    switch (ev.type) {
      case "delta.detected":
        // advance epoch + the affected contract + ledger (the why becomes #112).
        if (typeof p.epoch === "number") state.registryVersion = p.epoch;
        if (p.contract_id && typeof p.to_version === "number") {
          var hit = false;
          state.contracts.forEach(function (c) {
            if (c.id === p.contract_id) {
              c.current_version = p.to_version;
              hit = true;
            }
          });
          if (!hit) {
            state.contracts.push({
              id: p.contract_id,
              name: p.contract_id,
              current_version: p.to_version,
            });
          }
        }
        state.deltas.push({
          epoch: p.epoch,
          contract_id: p.contract_id,
          from_version: p.from_version,
          to_version: p.to_version,
          author: p.author,
          ts: p.ts,
          why: p.why,
          mechanical_change: p.mechanical_change,
        });
        renderEpoch();
        renderRegistry();
        renderFooter();
        break;

      case "reconciled":
        if (p.workspace === true) {
          // workspace-wide reconcile: everyone synced to the epoch.
          if (typeof p.epoch === "number") state.registryVersion = p.epoch;
          if (Array.isArray(p.sessions)) state.sessionsLive = p.sessions.length;
          renderFooter();
        }
        // per-session reconciled is consumed by the #8 drift-card chips/nodes.
        break;

      case "session.joined":
        renderFooter();
        break;

      // write.fenced, advisory.delivered, spec.pr.opened drive the live drift
      // card (#8); the static card already reflects the seeded end-state here.
      default:
        break;
    }

    // always fan out to registered listeners (the #8 animation router).
    fire(ev.type, ev);
  }

  // ----------------------------------------------------------------------
  // SSE subscription with replay-from-`since` reconnect (open-question #3:
  // a late viewer still lands on the current epoch). Guarded for non-browser
  // (test) environments where EventSource is absent.
  // ----------------------------------------------------------------------
  var es = null;
  function connect() {
    if (typeof EventSource === "undefined") return;
    try {
      es = new EventSource("/stream");
    } catch (e) {
      return;
    }
    // bus frames carry `event: <type>`; the default `message` handler also fires
    // when no listener matches. Bind both the generic handler and each known
    // type so we never miss a frame regardless of how the browser dispatches.
    es.onmessage = function (m) {
      handleFrame(m.data);
    };
    [
      "session.joined",
      "claim.published",
      "edit.streamed",
      "delta.detected",
      "write.fenced",
      "advisory.delivered",
      "reconciled",
      "spec.pr.opened",
    ].forEach(function (t) {
      es.addEventListener(t, function (m) {
        handleFrame(m.data);
      });
    });
    es.onerror = function () {
      // EventSource auto-reconnects (server sends `retry:`). On reconnect we
      // re-pull the snapshot so a viewer who dropped still lands on the epoch.
      resync();
    };
  }

  var seen = {}; // event id -> true (de-dupe across generic + typed handlers)
  function handleFrame(data) {
    if (!data) return;
    var ev;
    try {
      ev = JSON.parse(data);
    } catch (e) {
      return;
    }
    if (ev && ev.id != null) {
      if (seen[ev.id]) return;
      seen[ev.id] = true;
    }
    routeEvent(ev);
  }

  function resync() {
    if (typeof fetch === "undefined") return;
    fetch("/registry")
      .then(function (r) {
        return r.json();
      })
      .then(function (j) {
        if (j && typeof j.registry_version === "number") {
          state.registryVersion = j.registry_version;
          if (Array.isArray(j.contracts)) state.contracts = j.contracts;
          renderAll();
        }
      })
      .catch(function () {
        /* fail quiet — read-only viewer */
      });
  }

  // ----------------------------------------------------------------------
  // public surface — the single render path #8 attaches to.
  // ----------------------------------------------------------------------
  window.DatumTower = {
    state: state,
    onEvent: onEvent, // (type, handler) — animation router hook for task #8
    routeEvent: routeEvent, // exposed for tests / replay drivers
    renderAll: renderAll,
  };

  // hydrate the static markup from the embedded snapshot, then go live.
  renderAll();
  connect();
})();
