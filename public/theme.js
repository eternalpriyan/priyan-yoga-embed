/*
 * NPSOY Weekly Theme hero — renders the current week's theme (image + text)
 * from the priyan-yoga-embed Vercel API as a hero block on any page.
 *
 * Usage (Squarespace code block, e.g. top of the home page):
 *   <div id="npsoy-theme"></div>
 *   <script src="https://YOUR-APP.vercel.app/theme.js"
 *           data-api="https://YOUR-APP.vercel.app"></script>
 *
 * Config (data-* on the <script> tag):
 *   data-api        Base URL of the deployed API (appends /api/weekly-theme).
 *   data-endpoint   Full JSON URL (overrides data-api; for local preview).
 *   data-image      Full image URL (overrides the proxy; for local preview).
 *   data-mount      CSS selector of the mount element (default "#npsoy-theme").
 *   data-eyebrow    Small label above the theme (default "This Week's Theme").
 *   data-link       Optional CTA URL. If set, shows a button.
 *   data-cta        CTA button label (default "Explore the practice").
 *   data-accent     Brand accent colour (default "#1a3c34").
 */
(function () {
  "use strict";

  var script = document.currentScript;
  var apiBase = script && script.dataset.api ? script.dataset.api.replace(/\/$/, "") : "";

  var cfg = {
    jsonUrl: (script && script.dataset.endpoint) || apiBase + "/api/weekly-theme",
    imageUrl: (script && script.dataset.image) || apiBase + "/api/weekly-theme?image=1",
    mount: (script && script.dataset.mount) || "#npsoy-theme",
    eyebrow: (script && script.dataset.eyebrow) || "This Week's Theme",
    link: (script && script.dataset.link) || "",
    cta: (script && script.dataset.cta) || "Explore the practice",
    accent: (script && script.dataset.accent) || "#1a3c34",
  };

  var STYLE_ID = "npsoy-theme-style";

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    var css = [
      "@import url('https://fonts.googleapis.com/css2?family=Raleway:wght@300;400;500;600;700&display=swap');",
      ".npsoy-theme{--npsoy-accent:" +
        cfg.accent +
        ";font-family:'Raleway',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;box-sizing:border-box;}",
      ".npsoy-theme *,.npsoy-theme *::before,.npsoy-theme *::after{box-sizing:inherit;}",
      ".npsoy-hero{position:relative;min-height:440px;display:flex;align-items:flex-end;overflow:hidden;background:var(--npsoy-accent);isolation:isolate;}",
      ".npsoy-hero-img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:block;border:0;z-index:-2;}",
      // Gradient floor for legible text over any image.
      ".npsoy-hero::after{content:'';position:absolute;inset:0;z-index:-1;background:linear-gradient(to top,rgba(15,28,24,.82) 0%,rgba(15,28,24,.45) 38%,rgba(15,28,24,.06) 70%,rgba(15,28,24,0) 100%);}",
      ".npsoy-hero-content{padding:40px 44px 44px;color:#fff;max-width:760px;}",
      ".npsoy-hero-eyebrow{display:inline-block;font-size:.74rem;font-weight:600;letter-spacing:.18em;text-transform:uppercase;color:rgba(255,255,255,.86);margin:0 0 14px;}",
      ".npsoy-hero-title{font-size:2.6rem;font-weight:700;line-height:1.08;letter-spacing:-.015em;margin:0 0 12px;text-shadow:0 2px 18px rgba(0,0,0,.28);}",
      ".npsoy-hero-cat{font-size:.84rem;font-weight:600;letter-spacing:.04em;text-transform:uppercase;color:rgba(255,255,255,.8);margin:0 0 14px;}",
      ".npsoy-hero-summary{font-size:1.02rem;font-weight:300;line-height:1.6;color:rgba(255,255,255,.94);margin:0;max-width:60ch;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;}",
      ".npsoy-hero-cta{margin-top:24px;display:inline-flex;align-items:center;gap:9px;background:#fff;color:var(--npsoy-accent);padding:13px 26px;font-size:.8rem;font-weight:600;letter-spacing:.06em;text-transform:uppercase;text-decoration:none;transition:transform .2s ease,box-shadow .2s ease;}",
      ".npsoy-hero-cta::after{content:'\\2192';transition:transform .2s ease;}",
      ".npsoy-hero-cta:hover{box-shadow:0 12px 30px rgba(0,0,0,.28);}",
      ".npsoy-hero-cta:hover::after{transform:translateX(4px);}",
      ".npsoy-theme-skel{min-height:440px;background:linear-gradient(100deg,#e9e8e2 30%,#f3f2ee 50%,#e9e8e2 70%);background-size:200% 100%;animation:npsoy-theme-shimmer 1.3s infinite;}",
      "@keyframes npsoy-theme-shimmer{to{background-position:-200% 0;}}",
      "@media(max-width:600px){.npsoy-hero{min-height:380px;}.npsoy-hero-content{padding:28px 24px 30px;}.npsoy-hero-title{font-size:1.9rem;}.npsoy-hero-summary{font-size:.94rem;-webkit-line-clamp:4;}}",
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
        if (k === "text") el.textContent = attrs[k];
        else el.setAttribute(k, attrs[k]);
      });
    }
    (children || []).forEach(function (c) {
      if (c) el.appendChild(c);
    });
    return el;
  }

  function renderHero(root, theme) {
    root.textContent = "";
    if (!theme || !theme.name) {
      // Nothing to show — stay invisible rather than render an empty box.
      return;
    }

    var hero = h("div", { class: "npsoy-hero" });

    if (theme.hasImage) {
      var img = h("img", { class: "npsoy-hero-img", src: cfg.imageUrl, alt: theme.name });
      img.addEventListener("error", function () {
        img.remove();
      });
      hero.appendChild(img);
    }

    var content = h("div", { class: "npsoy-hero-content" });
    content.appendChild(h("span", { class: "npsoy-hero-eyebrow", text: cfg.eyebrow }));
    content.appendChild(h("h2", { class: "npsoy-hero-title", text: theme.name }));

    var cat = [theme.category, theme.subCategory].filter(Boolean).join(" · ");
    if (cat) content.appendChild(h("p", { class: "npsoy-hero-cat", text: cat }));
    if (theme.summary) content.appendChild(h("p", { class: "npsoy-hero-summary", text: theme.summary }));

    // CTA: explicit data-link wins; otherwise offer the demo video if present.
    var href = cfg.link || theme.youtubeLink || "";
    var label = cfg.link ? cfg.cta : theme.youtubeLink ? "Watch the practice" : "";
    if (href && label) {
      content.appendChild(
        h("a", { class: "npsoy-hero-cta", href: href, target: "_blank", rel: "noopener", text: label }),
      );
    }

    hero.appendChild(content);
    root.appendChild(hero);
  }

  function init() {
    var root = document.querySelector(cfg.mount);
    if (!root) {
      console.warn("[npsoy-theme] mount element not found:", cfg.mount);
      return;
    }
    injectStyles();
    root.classList.add("npsoy-theme");
    root.appendChild(h("div", { class: "npsoy-theme-skel" }));

    fetch(cfg.jsonUrl, { headers: { Accept: "application/json" } })
      .then(function (r) {
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.json();
      })
      .then(function (data) {
        renderHero(root, (data && data.theme) || null);
      })
      .catch(function (err) {
        console.error("[npsoy-theme]", err);
        root.textContent = "";
      });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
