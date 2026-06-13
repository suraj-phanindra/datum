// web/drift-card.js — the LiveDriftCard animation state machine (task #8).
//
// ESM module (package.json "type":"module"). It exports the pure reducer +
// renderer + wiring as NAMED exports (for test/drift-card.test.ts and the
// tower), AND, when running in a browser, hangs the same API on
// window.DatumDriftCard for the static page wiring. No DOM is touched at import
// time; the reducer is pure so it runs under `node --test` with no jsdom.
//
// Structure (per PRD docs/prd/drift-card-animation.md):
//   (a) reduceDriftState(state, event) -> state : a PURE reducer, the explicit
//       state machine. No DOM, no Date.now, no globals. Unit-testable without a
//       browser (test/drift-card.test.ts). Drives the spec's stage progression
//       calm -> detected -> fenced -> advised -> reconciling -> reconciled ->
//       patched, plus per-node sub-state for the blast radius (ben, chen).
//   (b) renderDriftCard(state, els, {reducedMotion}) : a THIN applier that maps
//       state onto the DOM. Motion is gated in anim.css behind
//       prefers-reduced-motion; this function only sets classes/text/colors.
//   (c) LiveDriftCard(...) : wiring that subscribes to tower.js's onEvent hook
//       (live SSE) OR a scripted emitter, and on each Event calls reduce then
//       render. One render path, two event sources (spec "Two run modes").
//
// It RENDERS ONLY. It never calls decideFence / classifyEdit / bumpRegistry.
// The two `reconciled` events are disambiguated on payload.workspace === true
// (RECONCILIATION binding §item, schema §3), NEVER on the type string.
//
// Authored by task #8. Consumes web/tower.js (onEvent) + web/tokens-shim.css
// (READ-ONLY; tower is sole owner). No jsdom — the reducer is pure.

const __api = (function (root) {
  "use strict";

  // --------------------------------------------------------------------------
  // stage ordering (spec §"State machine")
  // --------------------------------------------------------------------------
  var STAGES = [
    "calm",
    "detected",
    "fenced",
    "advised",
    "reconciling",
    "reconciled",
    "patched",
  ];
  function stageRank(stage) {
    var i = STAGES.indexOf(stage);
    return i < 0 ? 0 : i;
  }

  // signal colors (strict color discipline; map to --color-* / --signal-* shim)
  // neutral = ambient gray; amber = contract/epoch; red = breaking/fence;
  // blue = advisory; green = reconciled.

  // --------------------------------------------------------------------------
  // (a) initial state — the resting "calm" shape.
  // --------------------------------------------------------------------------
  function initialDriftState(opts) {
    opts = opts || {};
    return {
      stage: "calm",
      // epoch transition for the db.users header (v7 -> v8).
      epoch: { from: null, to: null },
      header: "neutral", // neutral | amber | red | green
      // lifecycle chips. detected/fenced/advised/pr are activation booleans;
      // reconciled carries the live count toward total.
      chips: {
        detected: false,
        fenced: false,
        advised: false,
        reconciled: { count: 0, total: 2 },
        pr: false,
      },
      // blast-radius node sub-state (independent of card stage — ben and chen
      // progress on their own timelines).
      nodes: {
        ben: { color: "neutral", label: "building" },
        chen: { color: "neutral", label: "building" },
        center: { color: "amber", label: "db.users" },
      },
      // why / mechanical change surfaced in the card body.
      why: null,
      mechanicalChange: null,
      // resolution footer (revealed at `patched`).
      footer: null, // { pr_number, patch_path, ledger_id, text }
      // motion-agnostic; carried so render can read it, but reduce never uses it.
      reducedMotion: !!opts.reducedMotion,
      // track which sessions have reconciled (correlation by session_id, never
      // by `path`). Used so a repeated per-session reconciled does not double
      // count, and to know which node turns green.
      reconciledSessions: {},
    };
  }

  // shallow-ish clone so the reducer stays pure (no input mutation).
  function cloneState(s) {
    return {
      stage: s.stage,
      epoch: { from: s.epoch.from, to: s.epoch.to },
      header: s.header,
      chips: {
        detected: s.chips.detected,
        fenced: s.chips.fenced,
        advised: s.chips.advised,
        reconciled: {
          count: s.chips.reconciled.count,
          total: s.chips.reconciled.total,
        },
        pr: s.chips.pr,
      },
      nodes: {
        ben: { color: s.nodes.ben.color, label: s.nodes.ben.label },
        chen: { color: s.nodes.chen.color, label: s.nodes.chen.label },
        center: { color: s.nodes.center.color, label: s.nodes.center.label },
      },
      why: s.why,
      mechanicalChange: s.mechanicalChange,
      footer: s.footer ? {
        pr_number: s.footer.pr_number,
        patch_path: s.footer.patch_path,
        ledger_id: s.footer.ledger_id,
        text: s.footer.text,
      } : null,
      reducedMotion: s.reducedMotion,
      reconciledSessions: Object.assign({}, s.reconciledSessions),
    };
  }

  // map a per-session reconciled event to the node it resolves. The seeded
  // scenario: ben (routes/users.ts, was fenced) and chen (UserCard.tsx, was
  // advised). Resolve by human first (most explicit), then by path, then by
  // current node sub-state.
  function nodeKeyForSession(state, p) {
    var human = (p.human || "").toLowerCase();
    if (human === "ben") return "ben";
    if (human === "chen") return "chen";
    var pathStr = String(p.path || p.file || "");
    if (/routes\/users/.test(pathStr)) return "ben";
    if (/UserCard/.test(pathStr)) return "chen";
    // fall back: whichever consumer node is not yet green.
    if (state.nodes.ben.color !== "green") return "ben";
    return "chen";
  }

  // --------------------------------------------------------------------------
  // (a) reduceDriftState — the PURE state machine. Given current state and one
  // Event (schema §2 shape: { type, payload }), returns the NEXT state. Pure:
  // no DOM, no clock, no mutation of `state`.
  // --------------------------------------------------------------------------
  function reduceDriftState(state, event) {
    if (!state) state = initialDriftState();
    if (!event || typeof event.type !== "string") return state;
    var p = event.payload || {};
    var next = cloneState(state);

    switch (event.type) {
      // ---- delta.detected -> detected ----------------------------------
      case "delta.detected": {
        next.stage = advanceStage(next.stage, "detected");
        if (typeof p.from_version === "number") next.epoch.from = p.from_version;
        if (typeof p.to_version === "number") next.epoch.to = p.to_version;
        next.header = "amber";
        next.chips.detected = true;
        next.why = p.why != null ? p.why : next.why;
        next.mechanicalChange =
          p.mechanical_change != null ? p.mechanical_change : next.mechanicalChange;
        // center node (db.users v8) is amber throughout; consumers appear as
        // neutral outlines (already neutral in initial state).
        next.nodes.center.color = "amber";
        next.nodes.center.label = "db.users v" + (next.epoch.to != null ? next.epoch.to : "8");
        return next;
      }

      // ---- write.fenced -> fenced --------------------------------------
      case "write.fenced": {
        next.stage = advanceStage(next.stage, "fenced");
        next.header = "red";
        next.chips.fenced = true;
        // the fenced session's node (ben in the seed) flips neutral -> red
        // with a lock + label "fenced". The punch (node.fence overshoot) is a
        // CSS concern; reducer only records the target color/label.
        var fkey = fencedNodeKey(p);
        next.nodes[fkey].color = "red";
        next.nodes[fkey].label = "fenced";
        return next;
      }

      // ---- advisory.delivered -> advised -------------------------------
      // Route by Advisory.severity (schema §6): 'fence' -> keep red (the
      // fenced consumer); 'advisory' -> that consumer node neutral -> blue.
      case "advisory.delivered": {
        next.stage = advanceStage(next.stage, "advised");
        var sev = severityOf(p);
        var akey = advisedNodeKey(p);
        if (sev === "fence") {
          // fenced recipient: red retained (reads as fenced until reconcile).
          next.nodes[akey].color = "red";
          next.nodes[akey].label = "fenced";
        } else {
          // advisory recipient: neutral -> blue, label "advised".
          // do not clobber a node that is already red/green.
          if (next.nodes[akey].color === "neutral") {
            next.nodes[akey].color = "blue";
            next.nodes[akey].label = "advised";
          }
        }
        next.chips.advised = true;
        return next;
      }

      // ---- reconciled --------------------------------------------------
      // DISAMBIGUATE on payload.workspace === true, NOT on the type string.
      case "reconciled": {
        if (p.workspace === true) {
          // workspace-complete: header eases green, settle. The count is
          // already at total via the per-session events.
          next.stage = advanceStage(next.stage, "reconciled");
          next.header = "green";
          next.chips.reconciled.count = next.chips.reconciled.total;
          return next;
        }
        // per-session reconciled -> increment count + that node -> green.
        next.stage = advanceStage(next.stage, "reconciling");
        var sid = p.session_id != null ? String(p.session_id) : null;
        var nkey = nodeKeyForSession(next, p);
        // de-dupe by session_id (correlation key); fall back to node identity.
        var dedupeKey = sid || nkey;
        if (!next.reconciledSessions[dedupeKey]) {
          next.reconciledSessions[dedupeKey] = true;
          if (next.chips.reconciled.count < next.chips.reconciled.total) {
            next.chips.reconciled.count += 1;
          }
        }
        next.nodes[nkey].color = "green";
        next.nodes[nkey].label = "reconciled";
        return next;
      }

      // ---- spec.pr.opened -> patched -----------------------------------
      case "spec.pr.opened": {
        next.stage = advanceStage(next.stage, "patched");
        next.chips.pr = true;
        var prNum = p.pr_number;
        var patchPath = p.patch_path != null ? p.patch_path : "docs/spec.md";
        var ledgerId = p.ledger_id;
        next.footer = {
          pr_number: prNum,
          patch_path: patchPath,
          ledger_id: ledgerId,
          text:
            "spec PR #" + prNum + " · " + patchPath + " · ledger #" + ledgerId,
        };
        return next;
      }

      default:
        return next;
    }
  }

  // stage only moves FORWARD; a later event never regresses the stage rank.
  // (reconciling -> reconciled -> patched all advance; a stray per-session
  // reconciled after reconciled must not pull back to reconciling.)
  function advanceStage(current, target) {
    return stageRank(target) > stageRank(current) ? target : current;
  }

  function fencedNodeKey(p) {
    var human = (p.human || "").toLowerCase();
    if (human === "ben") return "ben";
    if (human === "chen") return "chen";
    var pathStr = String(p.path || "");
    if (/UserCard/.test(pathStr)) return "chen";
    return "ben"; // seed: ben is the fenced api session.
  }

  function severityOf(p) {
    // advisory.delivered payload nests the full Advisory under `advisory`
    // (arbiter/index.ts), but also tolerate a flat `severity`.
    if (p.advisory && p.advisory.severity != null) return p.advisory.severity;
    if (p.severity != null) return p.severity;
    return "advisory";
  }

  function advisedNodeKey(p) {
    var recipient = (p.recipient || p.human || "").toLowerCase();
    if (recipient === "ben") return "ben";
    if (recipient === "chen") return "chen";
    var f = String((p.advisory && p.advisory.file) || p.file || "");
    if (/routes\/users/.test(f)) return "ben";
    if (/UserCard/.test(f)) return "chen";
    return "chen";
  }

  // --------------------------------------------------------------------------
  // (b) renderDriftCard — thin DOM applier. els is a map of element refs; any
  // missing ref is skipped (so it degrades on partial markup / tests). Motion
  // is gated in anim.css; this only toggles state classes, text, colors. The
  // {reducedMotion} flag is accepted but the visual TRUTH (colors/labels/count)
  // is identical regardless — reduced motion only removes animation, never info.
  // --------------------------------------------------------------------------
  var COLOR_BG = {
    neutral: "--color-background-secondary",
    amber: "--color-background-warning",
    red: "--color-background-danger",
    blue: "--color-background-info",
    green: "--color-background-success",
  };
  var COLOR_FG = {
    neutral: "--color-text-tertiary",
    amber: "--color-text-warning",
    red: "--color-text-danger",
    blue: "--color-text-info",
    green: "--color-text-success",
  };
  var COLOR_STROKE = {
    neutral: "--color-border-secondary",
    amber: "--color-text-warning",
    red: "--color-text-danger",
    blue: "--color-text-info",
    green: "--color-text-success",
  };

  function v(token) {
    return "var(" + token + ")";
  }

  function setText(el, text) {
    if (el && text != null) el.textContent = text;
  }

  function applyNode(circleEl, labelEl, sub) {
    if (circleEl) {
      circleEl.setAttribute("fill", v(COLOR_BG[sub.color]));
      circleEl.setAttribute("stroke", v(COLOR_STROKE[sub.color]));
      circleEl.setAttribute("data-node-color", sub.color);
    }
    if (labelEl) {
      labelEl.textContent = sub.label;
      labelEl.setAttribute("fill", v(COLOR_FG[sub.color]));
    }
  }

  function applyChip(el, active, color) {
    if (!el) return;
    if (active) {
      el.style.background = v(COLOR_BG[color]);
      el.style.color = v(COLOR_FG[color]);
      el.style.borderColor = "transparent";
      el.style.opacity = "1";
      el.setAttribute("data-chip", "active");
    } else {
      el.style.background = "transparent";
      el.style.color = v("--color-text-tertiary");
      el.style.borderColor = v("--color-border-tertiary");
      el.setAttribute("data-chip", "ghost");
    }
  }

  var HEADER_TINT = {
    neutral: ["--color-background-secondary", "--color-text-secondary"],
    amber: ["--color-background-warning", "--color-text-warning"],
    red: ["--color-background-danger", "--color-text-danger"],
    green: ["--color-background-success", "--color-text-success"],
  };

  function renderDriftCard(state, els, opts) {
    els = els || {};
    opts = opts || {};
    var reduced = opts.reducedMotion != null ? opts.reducedMotion : state.reducedMotion;

    // expose stage + reduced-motion on the card root for CSS hooks.
    if (els.card) {
      els.card.setAttribute("data-stage", state.stage);
      els.card.setAttribute("data-reduced-motion", reduced ? "true" : "false");
      if (state.stage !== "calm") {
        els.card.setAttribute("data-open", "true");
      }
    }
    if (els.feedRow && state.stage !== "calm") {
      els.feedRow.setAttribute("data-collapsed", "true");
    }
    if (els.stage) els.stage.textContent = state.stage;

    // epoch strip: reveal v8 once detected.
    if (els.epoch8 && state.epoch.to != null) {
      els.epoch8.setAttribute("data-visible", "true");
    }

    // header tint.
    var tint = HEADER_TINT[state.header] || HEADER_TINT.neutral;
    if (els.cardHead) els.cardHead.style.background = v(tint[0]);
    if (els.cardTitle) els.cardTitle.style.color = v(tint[1]);
    if (els.cardTime) els.cardTime.style.color = v(tint[1]);

    // why + mechanical change strikethrough.
    if (els.oldCol && state.stage !== "calm" && stageRank(state.stage) >= stageRank("fenced")) {
      els.oldCol.style.textDecoration = "line-through";
      els.oldCol.style.color = v("--color-text-tertiary");
    }

    // lifecycle chips.
    applyChip(els.chipDetected, state.chips.detected, "amber");
    applyChip(els.chipFenced, state.chips.fenced, "red");
    applyChip(els.chipAdvised, state.chips.advised, "blue");
    applyChip(
      els.chipReconciled,
      state.chips.reconciled.count > 0 || state.stage === "reconciled",
      "green"
    );
    applyChip(els.chipPr, state.chips.pr, "blue");

    // reconcile count label.
    if (els.recLabel) {
      var rc = state.chips.reconciled;
      var word = state.stage === "reconciled" || rc.count >= rc.total ? "reconciled" : "reconciling";
      els.recLabel.textContent = word + " " + rc.count + "/" + rc.total;
    }

    // blast-radius nodes.
    applyNode(els.nodeCenter, els.nodeCenterLabel, state.nodes.center);
    applyNode(els.nodeBen, els.nodeBenLabel, state.nodes.ben);
    applyNode(els.nodeChen, els.nodeChenLabel, state.nodes.chen);

    // resolution footer.
    if (els.footer) {
      if (state.footer) {
        els.footer.setAttribute("data-visible", "true");
        if (els.footerText) els.footerText.textContent = state.footer.text;
      }
    }

    return state;
  }

  // --------------------------------------------------------------------------
  // (c) LiveDriftCard — wiring. Subscribes to a source's onEvent hook (tower.js
  // live SSE) OR a scripted emitter, reduces, then renders. One render path.
  //
  //   new LiveDriftCard({ source, els, reducedMotion })
  //     source: object with onEvent(type, handler) (e.g. window.DatumTower) OR
  //             an emitter exposing the same. We subscribe to the six driving
  //             event types and call handle() on each.
  //     els:    the DOM ref map for renderDriftCard.
  //
  // handle(event) is also public so a scripted/test driver can push events
  // directly without an onEvent source.
  // --------------------------------------------------------------------------
  function LiveDriftCard(config) {
    config = config || {};
    this.els = config.els || {};
    this.reducedMotion = !!config.reducedMotion;
    this.state = initialDriftState({ reducedMotion: this.reducedMotion });
    this._source = config.source || null;

    // initial calm render.
    renderDriftCard(this.state, this.els, { reducedMotion: this.reducedMotion });

    if (this._source && typeof this._source.onEvent === "function") {
      this._subscribe(this._source);
    }
  }

  LiveDriftCard.DRIVING_EVENTS = [
    "delta.detected",
    "write.fenced",
    "advisory.delivered",
    "reconciled",
    "spec.pr.opened",
  ];

  LiveDriftCard.prototype._subscribe = function (source) {
    var self = this;
    LiveDriftCard.DRIVING_EVENTS.forEach(function (type) {
      source.onEvent(type, function (ev) {
        // tower.js passes the full Event { id, type, payload, ts }.
        self.handle(ev);
      });
    });
  };

  // reduce then render. The single hot path shared by live + scripted modes.
  LiveDriftCard.prototype.handle = function (event) {
    this.state = reduceDriftState(this.state, event);
    renderDriftCard(this.state, this.els, { reducedMotion: this.reducedMotion });
    return this.state;
  };

  LiveDriftCard.prototype.getState = function () {
    return this.state;
  };

  // --------------------------------------------------------------------------
  // exports — dual ESM/CJS-free: attach to a passed namespace object. In the
  // browser we hang it on window.DatumDriftCard; under node --test the test
  // imports the module's named exports via a tiny ESM shim at the bottom.
  // --------------------------------------------------------------------------
  var api = {
    STAGES: STAGES,
    initialDriftState: initialDriftState,
    reduceDriftState: reduceDriftState,
    renderDriftCard: renderDriftCard,
    LiveDriftCard: LiveDriftCard,
  };

  // attach to window only in a real browser; under node we just return `api`.
  if (typeof window !== "undefined" && root === window) root.DatumDriftCard = api;
  return api;
})(typeof window !== "undefined" ? window : (typeof globalThis !== "undefined" ? globalThis : null));

// ---- ESM named exports (read by test/drift-card.test.ts + tower wiring) ----
export const STAGES = __api.STAGES;
export const initialDriftState = __api.initialDriftState;
export const reduceDriftState = __api.reduceDriftState;
export const renderDriftCard = __api.renderDriftCard;
export const LiveDriftCard = __api.LiveDriftCard;
export default __api;
