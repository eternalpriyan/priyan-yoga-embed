/*
 * NPSOY Courses embed — renders the upcoming-courses grid from the
 * priyan-yoga-embed Vercel API onto any page (Squarespace code block etc.).
 *
 * Usage:
 *   <div id="npsoy-courses"></div>
 *   <script src="https://YOUR-APP.vercel.app/embed.js"
 *           data-api="https://YOUR-APP.vercel.app"></script>
 *
 * Config (data-* on the <script> tag):
 *   data-api       Base URL of the deployed API (appends /api/courses).
 *   data-endpoint  Full URL to the JSON (overrides data-api; used for local preview).
 *   data-mount     CSS selector of the mount element (default "#npsoy-courses").
 *   data-limit     Max number of cards to show (default: all).
 *   data-category  Show only this Oclass category (e.g. "Teacher Training").
 *                  Comma-separate for several. Omit to show all categories.
 *   data-course    Keyword mode: a title substring (e.g. "200 Hour Yoga
 *                  Teacher Training"). By default renders ONE hero card for the
 *                  soonest upcoming batch matching it (survives new cohort ids).
 *                  With data-layout="list" it lists EVERY matching upcoming
 *                  cohort chronologically (no thumbnails) — a schedule view.
 *   data-layout    With data-course: "hero" (default) or "list".
 *   data-venue     Show the venue/address line? "show" (default) or "hide".
 *   data-accent    Brand accent colour (default "#1a3c34").
 */
(function () {
  "use strict";

  var script = document.currentScript;
  var courseQuery = script && script.dataset.course ? script.dataset.course.trim() : "";
  var layout = script && script.dataset.layout ? script.dataset.layout.trim().toLowerCase() : "";
  var list = !!courseQuery && layout === "list"; // chronological schedule list
  var single = !!courseQuery && !list; // single-course hero
  var category = script && script.dataset.category ? script.dataset.category.trim() : "";
  var venueAttr = script && script.dataset.venue ? script.dataset.venue.trim().toLowerCase() : "";
  var showVenue = !(venueAttr === "hide" || venueAttr === "off" || venueAttr === "false" || venueAttr === "no");

  // Pick the endpoint: data-endpoint overrides everything (local preview);
  // otherwise data-api + the right path. Single hero hits /api/course (one
  // result); list and grid hit /api/courses (many), the former with ?q=.
  var apiBase = script && script.dataset.api ? script.dataset.api.replace(/\/$/, "") : "";
  var base = (script && script.dataset.endpoint) || apiBase + (single ? "/api/course" : "/api/courses");
  var params = [];
  if (courseQuery) params.push("q=" + encodeURIComponent(courseQuery));
  if (category) params.push("category=" + encodeURIComponent(category));
  var endpoint = params.length
    ? base + (base.indexOf("?") === -1 ? "?" : "&") + params.join("&")
    : base;

  var cfg = {
    endpoint: endpoint,
    single: single,
    list: list,
    mount: (script && script.dataset.mount) || "#npsoy-courses",
    limit: script && script.dataset.limit ? parseInt(script.dataset.limit, 10) : 0,
    showVenue: showVenue,
    accent: (script && script.dataset.accent) || "#1a3c34",
  };

  var STYLE_ID = "npsoy-courses-style";

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    var css = [
      "@import url('https://fonts.googleapis.com/css2?family=Raleway:wght@300;400;500;600&display=swap');",
      ".npsoy-courses{--npsoy-accent:" +
        cfg.accent +
        ";font-family:'Raleway',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#26302c;line-height:1.55;box-sizing:border-box;}",
      ".npsoy-courses *,.npsoy-courses *::before,.npsoy-courses *::after{box-sizing:inherit;}",
      ".npsoy-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:28px;margin:0;padding:0;list-style:none;}",
      ".npsoy-card{position:relative;display:flex;flex-direction:column;background:#fff;border:1px solid #ecebe6;overflow:hidden;text-decoration:none;color:inherit;transition:transform .25s ease,box-shadow .25s ease,border-color .25s ease;}",
      ".npsoy-card:hover{transform:translateY(-4px);box-shadow:0 14px 34px rgba(26,60,52,.13);border-color:#dcdbd3;}",
      ".npsoy-card:focus-visible{outline:2px solid var(--npsoy-accent);outline-offset:3px;}",
      ".npsoy-thumb{position:relative;aspect-ratio:2160/764;background:var(--npsoy-accent);overflow:hidden;}",
      ".npsoy-img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:block;border:0;}",
      ".npsoy-thumb-fallback{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:2.6rem;font-weight:300;color:rgba(255,255,255,.85);letter-spacing:.04em;}",
      ".npsoy-body{display:flex;flex-direction:column;flex:1;padding:20px 20px 22px;}",
      ".npsoy-title{font-size:1.12rem;font-weight:600;margin:0 0 8px;letter-spacing:-.01em;line-height:1.3;}",
      // Date now lives below the title (banner stays clean).
      ".npsoy-when{display:inline-flex;align-items:center;gap:7px;align-self:flex-start;font-size:.8rem;font-weight:600;letter-spacing:.01em;color:var(--npsoy-accent);margin:0 0 14px;}",
      // Line-drawn inline icons (inherit text colour via currentColor).
      ".npsoy-ico{width:1.05em;height:1.05em;flex:none;display:block;stroke:currentColor;}",
      ".npsoy-summary{font-size:.9rem;font-weight:300;color:#5d655f;margin:0 0 16px;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;}",
      ".npsoy-meta{margin-top:auto;font-size:.78rem;color:#7a817b;font-weight:400;display:flex;flex-direction:column;gap:3px;}",
      ".npsoy-meta-row{display:flex;align-items:center;gap:7px;}",
      ".npsoy-cta{margin-top:16px;display:inline-flex;align-items:center;gap:7px;align-self:flex-start;font-size:.82rem;font-weight:600;letter-spacing:.03em;text-transform:uppercase;color:var(--npsoy-accent);}",
      ".npsoy-cta::after{content:'\\2192';transition:transform .2s ease;}",
      ".npsoy-card:hover .npsoy-cta::after{transform:translateX(4px);}",
      ".npsoy-state{padding:48px 16px;text-align:center;color:#7a817b;font-family:'Raleway',sans-serif;font-weight:300;}",
      ".npsoy-skel{background:linear-gradient(100deg,#f1f0eb 30%,#f8f7f3 50%,#f1f0eb 70%);background-size:200% 100%;animation:npsoy-shimmer 1.3s infinite;height:360px;}",
      "@keyframes npsoy-shimmer{to{background-position:-200% 0;}}",
      // Single-course hero: one full-width card, banner over a roomier body.
      ".npsoy-single{display:block;}",
      ".npsoy-single .npsoy-card{flex-direction:column;}",
      ".npsoy-single .npsoy-thumb{aspect-ratio:2160/764;}",
      ".npsoy-single .npsoy-body{padding:30px 32px 32px;gap:2px;}",
      ".npsoy-single .npsoy-title{font-size:1.55rem;line-height:1.22;margin-bottom:10px;}",
      ".npsoy-single .npsoy-when{font-size:.9rem;margin-bottom:16px;}",
      ".npsoy-single .npsoy-summary{font-size:1rem;-webkit-line-clamp:4;margin-bottom:20px;max-width:60ch;}",
      ".npsoy-single .npsoy-meta{font-size:.85rem;gap:5px;}",
      ".npsoy-btn{margin-top:22px;align-self:flex-start;display:inline-flex;align-items:center;gap:9px;background:var(--npsoy-accent);color:#fff;padding:13px 26px;font-size:.82rem;font-weight:600;letter-spacing:.06em;text-transform:uppercase;text-decoration:none;transition:transform .2s ease,box-shadow .2s ease,opacity .2s ease;}",
      ".npsoy-btn::after{content:'\\2192';transition:transform .2s ease;}",
      ".npsoy-btn:hover{opacity:.92;box-shadow:0 10px 26px rgba(26,60,52,.22);}",
      ".npsoy-btn:hover::after{transform:translateX(4px);}",
      // Schedule list: compact dated rows, no thumbnails, chronological.
      ".npsoy-list{display:flex;flex-direction:column;border-top:1px solid #ecebe6;}",
      ".npsoy-row{display:flex;align-items:center;gap:20px;padding:18px 14px;border-bottom:1px solid #ecebe6;text-decoration:none;color:inherit;transition:background .18s ease;}",
      ".npsoy-row:hover{background:#f7f6f2;}",
      ".npsoy-row:focus-visible{outline:2px solid var(--npsoy-accent);outline-offset:-2px;}",
      ".npsoy-row-date{flex:0 0 auto;width:188px;display:inline-flex;align-items:center;gap:8px;font-size:.9rem;font-weight:600;color:var(--npsoy-accent);}",
      ".npsoy-row-main{flex:1 1 auto;min-width:0;display:flex;flex-direction:column;gap:4px;}",
      ".npsoy-row-title{font-size:.98rem;font-weight:600;letter-spacing:-.01em;line-height:1.3;}",
      ".npsoy-row-meta{display:inline-flex;align-items:center;gap:7px;font-size:.8rem;color:#7a817b;}",
      ".npsoy-row-cta{flex:0 0 auto;display:inline-flex;align-items:center;gap:8px;border:1.5px solid var(--npsoy-accent);color:var(--npsoy-accent);padding:9px 18px;font-size:.74rem;font-weight:600;letter-spacing:.06em;text-transform:uppercase;white-space:nowrap;transition:background .18s ease,color .18s ease;}",
      ".npsoy-row-cta::after{content:'\\2192';transition:transform .2s ease;}",
      ".npsoy-row:hover .npsoy-row-cta{background:var(--npsoy-accent);color:#fff;}",
      ".npsoy-row:hover .npsoy-row-cta::after{transform:translateX(3px);}",
      ".npsoy-row-skel{height:62px;border-bottom:1px solid #ecebe6;background:linear-gradient(100deg,#f4f3ef 30%,#fafaf7 50%,#f4f3ef 70%);background-size:200% 100%;animation:npsoy-shimmer 1.3s infinite;}",
      // Ongoing cohort (today within the dates): enrol disabled, shows 'Ongoing'.
      ".npsoy-card--off:hover{transform:none;box-shadow:none;border-color:#ecebe6;}",
      ".npsoy-cta--off{color:#a8aaa3;}",
      ".npsoy-cta--off::after{display:none;}",
      ".npsoy-btn--off{background:#e9e8e2;color:#9a9c95;box-shadow:none;cursor:default;}",
      ".npsoy-btn--off::after{display:none;}",
      ".npsoy-btn--off:hover{opacity:1;box-shadow:none;}",
      ".npsoy-row--off{cursor:default;}",
      ".npsoy-row--off:hover{background:transparent;}",
      ".npsoy-row-cta--off{border-color:#dcdbd3;color:#a8aaa3;}",
      ".npsoy-row-cta--off::after{display:none;}",
      ".npsoy-row:hover .npsoy-row-cta--off{background:transparent;color:#a8aaa3;}",
      "@media(min-width:760px){.npsoy-single .npsoy-card{flex-direction:row;}.npsoy-single .npsoy-thumb{flex:0 0 46%;aspect-ratio:auto;min-height:300px;}.npsoy-single .npsoy-body{flex:1;justify-content:center;padding:38px 40px;}}",
      "@media(max-width:560px){.npsoy-row{flex-wrap:wrap;gap:10px 16px;padding:16px 12px;}.npsoy-row-date{width:100%;order:1;}.npsoy-row-main{flex:1 1 100%;order:2;}.npsoy-row-cta{order:3;}}",
      "@media(max-width:520px){.npsoy-grid{grid-template-columns:1fr;gap:20px;}.npsoy-single .npsoy-body{padding:24px 22px 26px;}.npsoy-single .npsoy-title{font-size:1.32rem;}}",
    ].join("\n");
    var el = document.createElement("style");
    el.id = STYLE_ID;
    el.textContent = css;
    document.head.appendChild(el);
  }

  function h(tag, attrs, children) {
    var el = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === "style") el.setAttribute("style", attrs[k]);
        else if (k === "text") el.textContent = attrs[k];
        else if (k === "html") el.innerHTML = attrs[k];
        else el.setAttribute(k, attrs[k]);
      });
    }
    (children || []).forEach(function (c) {
      if (c) el.appendChild(c);
    });
    return el;
  }

  function escapeHtml(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  // Line-drawn inline icons. Square corners (stroke-linejoin:miter) to match the
  // sharp-cornered cards. stroke:currentColor lets them inherit the text colour.
  var ICONS = {
    calendar:
      '<svg class="npsoy-ico" viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="miter" aria-hidden="true"><rect x="3" y="4.5" width="18" height="17"/><line x1="3" y1="9.5" x2="21" y2="9.5"/><line x1="8" y1="2.5" x2="8" y2="6.5"/><line x1="16" y1="2.5" x2="16" y2="6.5"/></svg>',
    pin:
      '<svg class="npsoy-ico" viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 1 1 16 0z"/><circle cx="12" cy="10" r="2.6"/></svg>',
  };

  function icon(name) {
    var tmp = document.createElement("span");
    tmp.innerHTML = ICONS[name] || "";
    return tmp.firstChild; // the <svg> element
  }

  function buildThumb(course) {
    var thumb = h("div", {
      class: "npsoy-thumb",
      style: "background:" + (course.color || cfg.accent),
    });
    // Fallback initial sits behind the image; revealed if the image fails.
    thumb.appendChild(
      h("span", { class: "npsoy-thumb-fallback", text: (course.title || "?").charAt(0) }),
    );
    if (course.coverImage) {
      // referrerpolicy=no-referrer: media.oclass.app 403s requests that carry a
      // foreign Referer header, but serves fine with none. onerror -> fallback.
      var img = h("img", {
        class: "npsoy-img",
        src: course.coverImage,
        alt: "",
        loading: "lazy",
        referrerpolicy: "no-referrer",
      });
      img.addEventListener("error", function () {
        img.remove();
      });
      thumb.appendChild(img);
    }
    // Banner stays clean — the date moved below the title (buildWhen).
    return thumb;
  }

  // Date line shown below the title (cohort range, falling back to next start).
  function buildWhen(course) {
    var dateText = course.dateLabel || course.nextStartLabel;
    if (!dateText) return null;
    return h("div", { class: "npsoy-when" }, [icon("calendar"), h("span", { text: dateText })]);
  }

  // Venue/address line — only when enabled (data-venue) and present.
  function buildMeta(course) {
    var meta = h("div", { class: "npsoy-meta" });
    if (cfg.showVenue && course.venue && (course.venue.name || course.venue.branch)) {
      var place = [course.venue.branch, course.venue.name].filter(Boolean).join(" · ");
      meta.appendChild(h("div", { class: "npsoy-meta-row" }, [icon("pin"), h("span", { text: place })]));
    }
    return meta;
  }

  function renderCard(course) {
    var cta = course.ongoing
      ? h("span", { class: "npsoy-cta npsoy-cta--off", text: "Ongoing" })
      : h("span", { class: "npsoy-cta", text: "View & Enrol" });
    var body = h("div", { class: "npsoy-body" }, [
      h("h3", { class: "npsoy-title", text: course.title }),
      buildWhen(course),
      h("p", { class: "npsoy-summary", text: course.summary || "" }),
      buildMeta(course),
      cta,
    ]);

    // Ongoing cohort isn't enrollable → render a non-clickable card.
    if (course.ongoing) {
      return h("div", { class: "npsoy-card npsoy-card--off" }, [buildThumb(course), body]);
    }
    return h(
      "a",
      {
        class: "npsoy-card",
        href: course.enrolUrl || "#",
        target: "_blank",
        rel: "noopener",
        "aria-label": course.title,
      },
      [buildThumb(course), body],
    );
  }

  // Single-course hero: a non-anchor card with a prominent enrol button (so we
  // don't nest an <a> inside an <a>).
  function renderSingleCourse(course) {
    var btn = course.ongoing
      ? h("span", { class: "npsoy-btn npsoy-btn--off", text: "Ongoing" })
      : h("a", {
          class: "npsoy-btn",
          href: course.enrolUrl || "#",
          target: "_blank",
          rel: "noopener",
          text: "View & Enrol",
        });
    var body = h("div", { class: "npsoy-body" }, [
      h("h3", { class: "npsoy-title", text: course.title }),
      buildWhen(course),
      h("p", { class: "npsoy-summary", text: course.summary || "" }),
      buildMeta(course),
      btn,
    ]);
    return h("div", { class: "npsoy-card" }, [buildThumb(course), body]);
  }

  function render(root, courses) {
    root.textContent = "";
    if (!courses.length) {
      root.appendChild(h("div", { class: "npsoy-state", text: "No upcoming courses right now — check back soon." }));
      return;
    }
    var list = cfg.limit > 0 ? courses.slice(0, cfg.limit) : courses;
    var grid = h("ul", { class: "npsoy-grid" });
    list.forEach(function (c) {
      grid.appendChild(h("li", {}, [renderCard(c)]));
    });
    root.appendChild(grid);
  }

  function renderSingle(root, course) {
    root.textContent = "";
    if (!course) {
      root.appendChild(
        h("div", { class: "npsoy-state", text: "No upcoming session for this course right now — check back soon." }),
      );
      return;
    }
    root.appendChild(h("div", { class: "npsoy-single" }, [renderSingleCourse(course)]));
  }

  // One row of the schedule list: date · title/venue · enrol button.
  function renderRow(course) {
    var date = h("div", { class: "npsoy-row-date" }, [
      icon("calendar"),
      h("span", { text: course.dateLabel || course.nextStartLabel || "Dates TBC" }),
    ]);

    var mainKids = [h("div", { class: "npsoy-row-title", text: course.title })];
    if (cfg.showVenue && course.venue && (course.venue.name || course.venue.branch)) {
      var place = [course.venue.branch, course.venue.name].filter(Boolean).join(" · ");
      mainKids.push(h("div", { class: "npsoy-row-meta" }, [icon("pin"), h("span", { text: place })]));
    }
    var main = h("div", { class: "npsoy-row-main" }, mainKids);

    if (course.ongoing) {
      var offCta = h("span", { class: "npsoy-row-cta npsoy-row-cta--off", text: "Ongoing" });
      return h("div", { class: "npsoy-row npsoy-row--off" }, [date, main, offCta]);
    }
    return h(
      "a",
      {
        class: "npsoy-row",
        href: course.enrolUrl || "#",
        target: "_blank",
        rel: "noopener",
        "aria-label": "Enrol: " + course.title,
      },
      [date, main, h("span", { class: "npsoy-row-cta", text: "Enrol" })],
    );
  }

  function renderList(root, courses) {
    root.textContent = "";
    if (!courses.length) {
      root.appendChild(
        h("div", { class: "npsoy-state", text: "No upcoming dates right now — check back soon." }),
      );
      return;
    }
    var rows = cfg.limit > 0 ? courses.slice(0, cfg.limit) : courses;
    var box = h("div", { class: "npsoy-list" });
    rows.forEach(function (c) {
      box.appendChild(renderRow(c));
    });
    root.appendChild(box);
  }

  function renderSkeleton(root) {
    if (cfg.single) {
      root.appendChild(h("div", { class: "npsoy-single" }, [h("div", { class: "npsoy-skel" })]));
      return;
    }
    if (cfg.list) {
      var box = h("div", { class: "npsoy-list" });
      for (var j = 0; j < 4; j++) box.appendChild(h("div", { class: "npsoy-row-skel" }));
      root.appendChild(box);
      return;
    }
    var grid = h("div", { class: "npsoy-grid" });
    for (var i = 0; i < 6; i++) grid.appendChild(h("div", { class: "npsoy-skel" }));
    root.appendChild(grid);
  }

  function init() {
    var root = document.querySelector(cfg.mount);
    if (!root) {
      console.warn("[npsoy-courses] mount element not found:", cfg.mount);
      return;
    }
    injectStyles();
    root.classList.add("npsoy-courses");
    renderSkeleton(root);

    fetch(cfg.endpoint, { headers: { Accept: "application/json" } })
      .then(function (r) {
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.json();
      })
      .then(function (data) {
        if (cfg.single) renderSingle(root, (data && data.course) || null);
        else if (cfg.list) renderList(root, (data && data.courses) || []);
        else render(root, (data && data.courses) || []);
      })
      .catch(function (err) {
        console.error("[npsoy-courses]", err);
        root.textContent = "";
        root.appendChild(
          h("div", { class: "npsoy-state", text: "Unable to load courses right now." }),
        );
      });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
