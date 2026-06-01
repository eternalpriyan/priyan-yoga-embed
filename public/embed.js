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
 *   data-course    Single-course mode: a title substring (e.g. "200 Hour Yoga
 *                  Teacher Training"). Renders ONE hero card for the soonest
 *                  upcoming batch matching it — survives new cohort ids/codes.
 *   data-accent    Brand accent colour (default "#1a3c34").
 */
(function () {
  "use strict";

  var script = document.currentScript;
  var courseQuery = script && script.dataset.course ? script.dataset.course.trim() : "";
  var single = !!courseQuery; // single-course hero vs full grid
  var category = script && script.dataset.category ? script.dataset.category.trim() : "";

  // Pick the endpoint: data-endpoint overrides everything (local preview);
  // otherwise data-api + the right path for the mode.
  var apiBase = script && script.dataset.api ? script.dataset.api.replace(/\/$/, "") : "";
  var base = (script && script.dataset.endpoint) || apiBase + (single ? "/api/course" : "/api/courses");
  var params = [];
  if (single) params.push("q=" + encodeURIComponent(courseQuery));
  if (category) params.push("category=" + encodeURIComponent(category));
  var endpoint = params.length
    ? base + (base.indexOf("?") === -1 ? "?" : "&") + params.join("&")
    : base;

  var cfg = {
    endpoint: endpoint,
    single: single,
    mount: (script && script.dataset.mount) || "#npsoy-courses",
    limit: script && script.dataset.limit ? parseInt(script.dataset.limit, 10) : 0,
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
      ".npsoy-card{position:relative;display:flex;flex-direction:column;background:#fff;border:1px solid #ecebe6;border-radius:14px;overflow:hidden;text-decoration:none;color:inherit;transition:transform .25s ease,box-shadow .25s ease,border-color .25s ease;}",
      ".npsoy-card:hover{transform:translateY(-4px);box-shadow:0 14px 34px rgba(26,60,52,.13);border-color:#dcdbd3;}",
      ".npsoy-card:focus-visible{outline:2px solid var(--npsoy-accent);outline-offset:3px;}",
      ".npsoy-thumb{position:relative;aspect-ratio:2160/764;background:var(--npsoy-accent);overflow:hidden;}",
      ".npsoy-img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:block;border:0;}",
      ".npsoy-thumb-fallback{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:2.6rem;font-weight:300;color:rgba(255,255,255,.85);letter-spacing:.04em;}",
      ".npsoy-date{position:absolute;left:14px;bottom:14px;display:inline-flex;align-items:baseline;gap:6px;background:rgba(255,255,255,.94);backdrop-filter:saturate(1.2);padding:7px 12px;border-radius:999px;font-size:.74rem;font-weight:600;letter-spacing:.02em;color:var(--npsoy-accent);box-shadow:0 2px 8px rgba(0,0,0,.08);}",
      ".npsoy-body{display:flex;flex-direction:column;flex:1;padding:20px 20px 22px;}",
      ".npsoy-title{font-size:1.12rem;font-weight:600;margin:0 0 8px;letter-spacing:-.01em;line-height:1.3;}",
      ".npsoy-summary{font-size:.9rem;font-weight:300;color:#5d655f;margin:0 0 16px;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;}",
      ".npsoy-meta{margin-top:auto;font-size:.78rem;color:#7a817b;font-weight:400;display:flex;flex-direction:column;gap:3px;}",
      ".npsoy-meta-row{display:flex;align-items:center;gap:7px;}",
      ".npsoy-cta{margin-top:16px;display:inline-flex;align-items:center;gap:7px;align-self:flex-start;font-size:.82rem;font-weight:600;letter-spacing:.03em;text-transform:uppercase;color:var(--npsoy-accent);}",
      ".npsoy-cta::after{content:'\\2192';transition:transform .2s ease;}",
      ".npsoy-card:hover .npsoy-cta::after{transform:translateX(4px);}",
      ".npsoy-state{padding:48px 16px;text-align:center;color:#7a817b;font-family:'Raleway',sans-serif;font-weight:300;}",
      ".npsoy-skel{background:linear-gradient(100deg,#f1f0eb 30%,#f8f7f3 50%,#f1f0eb 70%);background-size:200% 100%;animation:npsoy-shimmer 1.3s infinite;border-radius:14px;height:360px;}",
      "@keyframes npsoy-shimmer{to{background-position:-200% 0;}}",
      // Single-course hero: one full-width card, banner over a roomier body.
      ".npsoy-single{display:block;}",
      ".npsoy-single .npsoy-card{flex-direction:column;}",
      ".npsoy-single .npsoy-thumb{aspect-ratio:2160/764;}",
      ".npsoy-single .npsoy-body{padding:30px 32px 32px;gap:2px;}",
      ".npsoy-single .npsoy-title{font-size:1.55rem;line-height:1.22;margin-bottom:12px;}",
      ".npsoy-single .npsoy-summary{font-size:1rem;-webkit-line-clamp:4;margin-bottom:20px;max-width:60ch;}",
      ".npsoy-single .npsoy-meta{font-size:.85rem;gap:5px;}",
      ".npsoy-btn{margin-top:22px;align-self:flex-start;display:inline-flex;align-items:center;gap:9px;background:var(--npsoy-accent);color:#fff;padding:13px 26px;border-radius:999px;font-size:.82rem;font-weight:600;letter-spacing:.06em;text-transform:uppercase;text-decoration:none;transition:transform .2s ease,box-shadow .2s ease,opacity .2s ease;}",
      ".npsoy-btn::after{content:'\\2192';transition:transform .2s ease;}",
      ".npsoy-btn:hover{opacity:.92;box-shadow:0 10px 26px rgba(26,60,52,.22);}",
      ".npsoy-btn:hover::after{transform:translateX(4px);}",
      "@media(min-width:760px){.npsoy-single .npsoy-card{flex-direction:row;}.npsoy-single .npsoy-thumb{flex:0 0 46%;aspect-ratio:auto;min-height:300px;}.npsoy-single .npsoy-body{flex:1;justify-content:center;padding:38px 40px;}}",
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
    var dateText = course.dateLabel || course.nextStartLabel;
    if (dateText) {
      thumb.appendChild(h("span", { class: "npsoy-date", text: dateText }));
    }
    return thumb;
  }

  function buildMeta(course) {
    var meta = h("div", { class: "npsoy-meta" });
    if (course.venue && (course.venue.name || course.venue.branch)) {
      var place = [course.venue.branch, course.venue.name].filter(Boolean).join(" · ");
      meta.appendChild(h("div", { class: "npsoy-meta-row", text: "📍 " + place }));
    }
    if (course.upcomingSessions) {
      meta.appendChild(
        h("div", {
          class: "npsoy-meta-row",
          text:
            "🗓 " +
            course.upcomingSessions +
            (course.upcomingSessions === 1 ? " session" : " sessions") +
            " upcoming",
        }),
      );
    }
    return meta;
  }

  function renderCard(course) {
    var body = h("div", { class: "npsoy-body" }, [
      h("h3", { class: "npsoy-title", text: course.title }),
      h("p", { class: "npsoy-summary", text: course.summary || "" }),
      buildMeta(course),
      h("span", { class: "npsoy-cta", text: "View & Enrol" }),
    ]);

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
    var body = h("div", { class: "npsoy-body" }, [
      h("h3", { class: "npsoy-title", text: course.title }),
      h("p", { class: "npsoy-summary", text: course.summary || "" }),
      buildMeta(course),
      h("a", {
        class: "npsoy-btn",
        href: course.enrolUrl || "#",
        target: "_blank",
        rel: "noopener",
        text: "View & Enrol",
      }),
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

  function renderSkeleton(root) {
    if (cfg.single) {
      root.appendChild(h("div", { class: "npsoy-single" }, [h("div", { class: "npsoy-skel" })]));
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
