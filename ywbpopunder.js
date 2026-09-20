/*!
 * YWB.Popunder.JS — standalone popunder / clickunder for landing pages
 * https://yellowweb.top
 *
 * Opens the target URL in a popunder behind the current tab on user click.
 * The small window just sits there until the user clicks either the main
 * window or the small window itself — then it expands and goes to the offer.
 * No dependencies, modern JS.
 *
 * Quick start:
 *   <script src="ywbpopunder.js" data-url="https://offer.example/landing"></script>
 *
 * Manual:
 *   Popunder.init({ url: 'https://offer.example/landing', limit: 1 });
 *
 * License: MIT. Use responsibly and only where appropriate.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else if (typeof define === 'function' && define.amd) define(() => api);
  else root.Popunder = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, () => {
  'use strict';

  const TAG = 'script';
  const URL_ERROR = '[Popunder] No url provided — clickunder is disabled.';

  /* ------------------------------------------------------------------ */
  /* Settings                                                            */
  /* ------------------------------------------------------------------ */

  const DEFAULTS = Object.freeze({
    // Where to send the user. Required.
    url: '',

    // Cookie namespace. A different id means a different clickunder on the same domain.
    id: 'popunder',

    // classic  — popunder behind the current tab (default);
    // redirect — send the current tab to the offer and open the original link nearby.
    type: 'classic',

    // How many times to show the offer to one user. 0 — unlimited.
    limit: 1,

    // Lifetime of the "already shown" cookie, in minutes.
    // -1 — until the next noon/midnight (the ad-network default).
    expirationMinutes: -1,

    // Pause after a show, in minutes. 0 — no pause.
    cooldownMinutes: 10,

    // How many user clicks to wait before the first show. 0 or 1 — on the very first click.
    clicksToStart: 0,

    // Delay before arming the clickunder, in seconds.
    startDelaySec: 0,

    // Clickable-zone selectors. Empty — the whole page.
    whitelist: [],

    // Selectors where the clickunder stays silent (together with their parents).
    blacklist: ['.no-pop'],

    // Only show from these referrers / never show from these (exact domains).
    refererWhitelist: [],
    refererBlacklist: [],

    // Skip if the UA contains any of these chunks.
    // Supports "a&&b" (all substrings) and "a||b" (any group).
    userAgentBlacklist: [],

    // Cover iframes with transparent divs so clicks on players are counted.
    coverIframes: true,

    // Listen for clicks in the capture phase.
    useCapture: false,

    // Popunder window: opens tiny (1×1) and sits there until the user clicks
    // either the small window or the main tab.
    windowFeatures:
      'directories=0,toolbar=0,scrollbars=1,location=0,statusbar=0,menubar=0,' +
      'resizable=1,width=1,height=1',

    // Console logs.
    debug: false,

    // Callback after opening: (url) => {}
    onOpen: null,
  });

  /* ------------------------------------------------------------------ */
  /* Small helpers                                                       */
  /* ------------------------------------------------------------------ */

  const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  // The "; expires=..." part of a cookie. minutes < 0 — until noon/midnight,
  // 0 — session cookie (no expires), > 0 — in N minutes.
  const cookieExpiry = (minutes) => {
    if (minutes < 0) {
      const d = new Date();
      d.setHours(d.getHours() >= 12 ? 24 : 12, 0, 0, 0);
      return `; expires=${d.toUTCString()}`;
    }
    if (minutes === 0) return '';
    return `; expires=${new Date(Date.now() + minutes * 60_000).toUTCString()}`;
  };

  const Cookie = {
    get(name) {
      const match = document.cookie.match(new RegExp(`(?:^|; )${escapeRe(name)}=([^;]*)`));
      return match ? decodeURIComponent(match[1]) : null;
    },
    set(name, value, minutes) {
      document.cookie = `${name}=${encodeURIComponent(value)}${cookieExpiry(minutes)}; path=/`;
    },
    del(name) {
      document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
    },
  };

  // true if the UA matches at least one blocking rule.
  const matchUserAgent = (ua, blacklist) =>
    blacklist.some((expr) =>
      String(expr)
        .split('||')
        .some((group) =>
          group
            .split('&&')
            .every((part) => ua.includes(part.trim().toLowerCase())),
        ),
    );

  const detectDevice = () => {
    const ua = (navigator.userAgent || '').toLowerCase();
    const os = /windows/.test(ua)
      ? 'windows'
      : /macintosh|mac os x/.test(ua)
        ? 'mac'
        : /android/.test(ua)
          ? 'android'
          : /iphone|ipad|ipod/.test(ua)
            ? 'ios'
            : /linux/.test(ua)
              ? 'linux'
              : /smart-tv|smarttv|\btv\b/.test(ua)
                ? 'tv'
                : 'unknown';
    const browser = /msie|trident/.test(ua)
      ? 'ie'
      : /edg\//.test(ua)
        ? 'edge'
        : /yabrowser/.test(ua)
          ? 'yandex'
          : /opr\/|opios/.test(ua)
            ? 'opera'
            : /chrome|crios/.test(ua)
              ? 'chrome'
              : /firefox|fxios/.test(ua)
                ? 'firefox'
                : /safari/.test(ua)
                  ? 'safari'
                  : 'unknown';
    return { os, browser };
  };

  // Does the element (or one of its ancestors) match any of the selectors?
  const isBlacklisted = (el, selectors) => {
    if (!selectors.length || !el?.closest) return false;
    try {
      return !!el.closest(selectors.join(','));
    } catch {
      return false;
    }
  };

  const anchorHref = (target) => target?.closest?.('a')?.href || location.href;

  /* ------------------------------------------------------------------ */
  /* Transparent covers over iframes                                     */
  /* ------------------------------------------------------------------ */

  class IframeCover {
    constructor(config, logger) {
      this.config = config;
      this.logger = logger;
      this.divs = [];
      this.last = 0;
      this.timer = null;
      this.redraw = () => this.draw();
    }

    clear() {
      this.divs.forEach((div) => div.remove());
      this.divs = [];
    }

    draw() {
      const now = Date.now();
      if (now - this.last < 500) {
        if (!this.timer) {
          this.timer = setTimeout(() => {
            this.timer = null;
            this.draw();
          }, 500 - (now - this.last));
        }
        return;
      }
      this.last = now;
      this.clear();

      const selectors = this.config.whitelist.length ? this.config.whitelist : ['body'];
      const seen = new Set();

      for (const selector of selectors) {
        let roots;
        try {
          roots = document.querySelectorAll(selector);
        } catch {
          continue;
        }
        for (const rootEl of roots) {
          const iframes = rootEl.tagName === 'IFRAME' ? [rootEl] : rootEl.querySelectorAll('iframe');
          for (const iframe of iframes) {
            if (seen.has(iframe) || isBlacklisted(iframe, this.config.blacklist)) continue;
            seen.add(iframe);

            const rect = iframe.getBoundingClientRect();
            const cover = document.createElement('div');
            cover.className = 'popunder-iframe-cover';
            cover.style.cssText =
              'position:absolute;background:transparent;z-index:2147483647;' +
              `width:${iframe.offsetWidth}px;height:${iframe.offsetHeight}px;` +
              `top:${rect.top + scrollY}px;left:${rect.left + scrollX}px;`;
            document.body.appendChild(cover);
            this.divs.push(cover);
          }
        }
      }

      if (this.divs.length) this.logger(`iframes covered: ${this.divs.length}`);
    }

    start() {
      this.draw();
      window.addEventListener('resize', this.redraw);
    }

    destroy() {
      this.clear();
      window.removeEventListener('resize', this.redraw);
    }
  }

  /* ------------------------------------------------------------------ */
  /* Open strategies                                                     */
  /* ------------------------------------------------------------------ */

  const simulateClick = (x, y) => {
    const el = document.elementFromPoint(x, y);
    if (el) el.dispatchEvent(new MouseEvent('click', { view: window, bubbles: true, cancelable: true }));
  };

  const childPage = (url) =>
    [
      '<!doctype html><html><head><meta charset="utf-8"></head>',
      '<body style="margin:0;background:#fff">',
      `<${TAG}>`,
      "document.addEventListener('click', function () {",
      '  if (window.__popunderExpanded) return;',
      '  window.__popunderExpanded = 1;',
      '  try { window.resizeTo(screen.width, screen.height); } catch (e) {}',
      '  try { window.moveTo(0, 0); } catch (e) {}',
      `  try { window.location.href = ${JSON.stringify(url).replace(/</g, '\\u003c')}; } catch (e) {}`,
      '});',
      `</${TAG}>`,
      '</body></html>',
    ].join('\n');

  // Classic popunder: a tiny window behind the tab.
  const openBehind = (url, config, event, logger) => {
    const win = window.open('about:blank', `popunder_${Math.floor(Math.random() * 1e6)}`, config.windowFeatures);
    if (!win) {
      logger('popup blocked by the browser');
      return false;
    }

    let expanded = false;
    const expand = () => {
      if (expanded) return;
      expanded = true;
      // If the user already expanded the window themselves, leave it alone.
      try {
        if (win.__popunderExpanded) return;
      } catch {}
      try {
        win.moveTo(Math.max(0, (screen.width - 1024) / 2), Math.max(0, (screen.height - 768) / 2));
        win.resizeTo(screen.width, screen.height);
        win.location = url;
      } catch {}
    };

    // Trigger 1: click on the main tab — the popunder goes back and expands,
    // and the original click is replayed so the site does not lose the action.
    window.addEventListener(
      'focus',
      () => {
        expand();
        if (typeof event?.clientX === 'number') simulateClick(event.clientX, event.clientY);
      },
      { once: true },
    );

    // Trigger 2: click on the small window itself — it expands on its own.
    try {
      win.document.write(childPage(url));
    } catch {}

    return true;
  };

  // Send the current tab to the offer and open the original link nearby.
  const openRedirect = (url, event) => {
    const tab = window.open(anchorHref(event?.target), '_blank');
    if (tab) tab.focus();
    window.location.href = url;
    return true;
  };

  // Mobile: the original link goes to a new tab, the current tab goes to the offer.
  const openMobile = (url, event) => {
    event?.preventDefault?.();

    const link = document.createElement('a');
    link.href = anchorHref(event?.target);
    link.target = '_blank';
    link.style.display = 'none';
    document.body.appendChild(link);
    link.dispatchEvent(new MouseEvent('click', { view: window, bubbles: true, cancelable: true }));
    link.remove();

    window.location.href = url;
    return true;
  };

  /* ------------------------------------------------------------------ */
  /* Core                                                                */
  /* ------------------------------------------------------------------ */

  class Clickunder {
    constructor(options = {}) {
      this.config = { ...DEFAULTS, ...options };
      this.device = detectDevice();
      this.logger = (msg) => {
        if (this.config.debug) console.log(`[Popunder] ${msg}`);
      };

      this.keys = {
        imp: `${this.config.id}_imp`,
        done: `u_${this.config.id}`,
        cooldown: `${this.config.id}_cd`,
        clicks: `${this.config.id}_clicks`,
      };

      this.clicked = false;
      this.cover = null;
      this.armed = false;
      this.onClick = (event) => this.handleClick(event);

      if (!this.config.url) {
        console.warn(URL_ERROR);
      } else if (Cookie.get(this.keys.done)) {
        this.logger('already shown (cookie) — disabled');
      } else if (this.config.startDelaySec > 0) {
        setTimeout(() => this.arm(), this.config.startDelaySec * 1000);
      } else {
        this.arm();
      }
    }

    get refererAllowed() {
      const { refererWhitelist: allow, refererBlacklist: deny } = this.config;
      if (!allow.length && !deny.length) return true;
      let host = '';
      try {
        host = new URL(document.referrer).hostname.replace(/^www\./, '');
      } catch {}
      return allow.length ? allow.includes(host) : !deny.includes(host);
    }

    get userAgentAllowed() {
      const { userAgentBlacklist } = this.config;
      if (!userAgentBlacklist.length) return true;
      return !matchUserAgent((navigator.userAgent || '').toLowerCase(), userAgentBlacklist);
    }

    canRun() {
      if (!this.config.url || this.clicked) return false;
      if (Cookie.get(this.keys.cooldown) || Cookie.get(this.keys.done)) return false;
      return this.refererAllowed && this.userAgentAllowed;
    }

    markShown() {
      const { config, keys } = this;
      const shown = Number.parseInt(Cookie.get(keys.imp) || '0', 10) + 1;
      Cookie.set(keys.imp, shown, config.expirationMinutes);
      if (config.limit > 0 && shown >= config.limit) Cookie.set(keys.done, '1', config.expirationMinutes);
      if (config.cooldownMinutes > 0) Cookie.set(keys.cooldown, '1', config.cooldownMinutes);
      this.clicked = true;
    }

    handleClick(event) {
      if (!event?.isTrusted) return;

      const { config, keys } = this;
      if (config.clicksToStart > 1) {
        const count = Number.parseInt(Cookie.get(keys.clicks) || '0', 10) + 1;
        Cookie.set(keys.clicks, count, 10);
        if (count < config.clicksToStart) {
          this.logger(`waiting for more clicks: ${count}/${config.clicksToStart}`);
          return;
        }
      }

      if (!this.canRun()) return;

      const target = event.target;
      if (isBlacklisted(target, config.blacklist)) {
        this.logger('click on a blacklisted element — skipped');
        return;
      }
      if (config.whitelist.length && !target?.closest?.(config.whitelist.join(','))) return;

      const mobile = this.device.os === 'android' || this.device.os === 'ios';
      const opened = mobile
        ? openMobile(config.url, event)
        : config.type === 'redirect'
          ? openRedirect(config.url, event)
          : openBehind(config.url, config, event, this.logger);

      if (!opened) return;

      this.markShown();
      this.logger(`opened: ${config.url}`);
      try {
        config.onOpen?.(config.url);
      } catch {}
    }

    arm() {
      if (this.armed) return;
      this.armed = true;

      if (this.config.coverIframes) {
        this.cover = new IframeCover(this.config, this.logger);
        this.cover.start();
      }

      document.addEventListener('click', this.onClick, this.config.useCapture);
      this.logger(`armed (os=${this.device.os}, browser=${this.device.browser})`);
    }

    destroy() {
      document.removeEventListener('click', this.onClick, this.config.useCapture);
      this.cover?.destroy();
      this.armed = false;
    }

    reset() {
      Object.values(this.keys).forEach((key) => Cookie.del(key));
      this.clicked = false;
      this.logger('cookies cleared');
    }
  }

  /* ------------------------------------------------------------------ */
  /* Public API                                                          */
  /* ------------------------------------------------------------------ */

  const instances = [];

  const Popunder = {
    version: '2.0.0',
    defaults: DEFAULTS,

    init(options = {}) {
      const instance = new Clickunder(options);
      instances.push(instance);
      return instance;
    },

    reset() {
      instances.forEach((instance) => instance.reset());
    },

    // For tests and advanced use.
    utils: { cookieExpiry, matchUserAgent, detectDevice },
  };

  /* Auto-init from the script tag data attributes. */
  const readDataConfig = (script) => {
    const d = script?.dataset;
    if (!d) return null;

    const config = {};
    if (d.url) config.url = d.url;
    if (d.id) config.id = d.id;
    if (d.type) config.type = d.type;
    if (d.limit) config.limit = Number.parseInt(d.limit, 10);
    if (d.expiration) config.expirationMinutes = Number.parseInt(d.expiration, 10);
    if (d.cooldown) config.cooldownMinutes = Number.parseInt(d.cooldown, 10);
    if (d.clicks) config.clicksToStart = Number.parseInt(d.clicks, 10);
    if (d.timer) config.startDelaySec = Number.parseInt(d.timer, 10);
    if (d.whitelist) config.whitelist = d.whitelist.split(',').map((s) => s.trim());
    if (d.blacklist) config.blacklist = d.blacklist.split(',').map((s) => s.trim());
    if (d.debug !== undefined) config.debug = d.debug !== 'false';
    return Object.keys(config).length ? config : null;
  };

  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    const fromScript = readDataConfig(document.currentScript);
    if (window.PopunderConfig) Popunder.init(window.PopunderConfig);
    else if (fromScript) Popunder.init(fromScript);
  }

  return Popunder;
});
