/*!
 * YWB.Popunder.JS — standalone popunder / clickunder for landing pages
 * https://yellowweb.top
 *
 * Открывает целевой URL в «подкладке» за текущей вкладкой по клику
 * пользователя. Маленькое окно висит и ничего не делает, пока пользователь
 * не кликнет по нему или по основной вкладке — тогда оно разворачивается
 * и уходит на оффер. Без зависимостей, современный JS.
 *
 * Быстрый старт:
 *   <script src="ywbpopunder.js" data-url="https://offer.example/landing"></script>
 *
 * Вручную:
 *   Popunder.init({ url: 'https://offer.example/landing', limit: 1 });
 *
 * Лицензия: MIT. Используй ответственно и только там, где это уместно.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else if (typeof define === 'function' && define.amd) define(() => api);
  else root.Popunder = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, () => {
  'use strict';

  const TAG = 'script';
  const URL_ERROR = '[Popunder] Не задан url — кликандер не включён.';

  /* ------------------------------------------------------------------ */
  /* Настройки                                                           */
  /* ------------------------------------------------------------------ */

  const DEFAULTS = Object.freeze({
    // Куда ведём. Обязательное поле.
    url: '',

    // Пространство имён cookie. Разный id — разные кликандеры на домене.
    id: 'popunder',

    // classic  — подкладка за текущей вкладкой (по умолчанию);
    // redirect — увести текущую вкладку на оффер, исходную ссылку открыть рядом.
    type: 'classic',

    // Сколько раз показать одному пользователю. 0 — без ограничения.
    limit: 1,

    // Срок жизни cookie «уже показано», в минутах.
    // -1 — до ближайшего полудня/полуночи (дефолт рекламных сетей).
    expirationMinutes: -1,

    // Пауза после показа, в минутах. 0 — без паузы.
    cooldownMinutes: 10,

    // Сколько кликов выдержать до первого показа. 0 или 1 — на первом же.
    clicksToStart: 0,

    // Задержка до включения, в секундах.
    startDelaySec: 0,

    // Селекторы кликабельных зон. Пусто — вся страница.
    whitelist: [],

    // Селекторы, на которых кликандер молчит (вместе с родителями).
    blacklist: ['.no-pop'],

    // Показывать только с этих рефереров / не показывать с этих (точные домены).
    refererWhitelist: [],
    refererBlacklist: [],

    // Не показывать, если UA содержит эти куски.
    // Поддерживает "a&&b" (все подстроки) и "a||b" (любая из групп).
    userAgentBlacklist: [],

    // Накрывать iframe прозрачными div'ами, чтобы клики по плеерам считались.
    coverIframes: true,

    // Слушать клики в фазе перехвата.
    useCapture: false,

    // Окно подкладки: открывается маленьким (1×1) и висит, пока пользователь
    // не кликнет по нему или по основной вкладке.
    windowFeatures:
      'directories=0,toolbar=0,scrollbars=1,location=0,statusbar=0,menubar=0,' +
      'resizable=1,width=1,height=1',

    // Логи в консоль.
    debug: false,

    // Колбэк после открытия: (url) => {}
    onOpen: null,
  });

  /* ------------------------------------------------------------------ */
  /* Мелкие утилиты                                                      */
  /* ------------------------------------------------------------------ */

  const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  // Строка "; expires=..." для cookie. minutes < 0 — до полудня/полуночи,
  // 0 — сессионная (без expires), > 0 — через N минут.
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

  // true, если UA попадает под хоть одно правило блокировки.
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

  // Элемент (или его родитель) подпадает под один из селекторов?
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
  /* Прозрачные накладки над iframe                                      */
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

      if (this.divs.length) this.logger(`накрыто iframe: ${this.divs.length}`);
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
  /* Способы открытия                                                    */
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

  // Классический popunder: маленькое окно за вкладкой.
  const openBehind = (url, config, event, logger) => {
    const win = window.open('about:blank', `popunder_${Math.floor(Math.random() * 1e6)}`, config.windowFeatures);
    if (!win) {
      logger('окно заблокировано браузером');
      return false;
    }

    let expanded = false;
    const expand = () => {
      if (expanded) return;
      expanded = true;
      // Если окно уже развернул сам пользователь — не трогаем.
      try {
        if (win.__popunderExpanded) return;
      } catch {}
      try {
        win.moveTo(Math.max(0, (screen.width - 1024) / 2), Math.max(0, (screen.height - 768) / 2));
        win.resizeTo(screen.width, screen.height);
        win.location = url;
      } catch {}
    };

    // Триггер 1: клик по основной вкладке — подкладка уходит назад и
    // разворачивается, а исходный клик проигрывается заново, чтобы сайт
    // не потерял действие.
    window.addEventListener(
      'focus',
      () => {
        expand();
        if (typeof event?.clientX === 'number') simulateClick(event.clientX, event.clientY);
      },
      { once: true },
    );

    // Триггер 2: клик по самому маленькому окну — оно разворачивается само.
    try {
      win.document.write(childPage(url));
    } catch {}

    return true;
  };

  // Увести текущую вкладку на оффер, исходную ссылку открыть рядом.
  const openRedirect = (url, event) => {
    const tab = window.open(anchorHref(event?.target), '_blank');
    if (tab) tab.focus();
    window.location.href = url;
    return true;
  };

  // Мобильные: исходная ссылка — в новой вкладке, текущая — на оффер.
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
  /* Ядро                                                                */
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
        this.logger('уже показано (cookie) — выключен');
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
          this.logger(`жду ещё кликов: ${count}/${config.clicksToStart}`);
          return;
        }
      }

      if (!this.canRun()) return;

      const target = event.target;
      if (isBlacklisted(target, config.blacklist)) {
        this.logger('клик по blacklist-элементу — пропуск');
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
      this.logger(`открыто: ${config.url}`);
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
      this.logger(`включён (os=${this.device.os}, browser=${this.device.browser})`);
    }

    destroy() {
      document.removeEventListener('click', this.onClick, this.config.useCapture);
      this.cover?.destroy();
      this.armed = false;
    }

    reset() {
      Object.values(this.keys).forEach((key) => Cookie.del(key));
      this.clicked = false;
      this.logger('cookie сброшены');
    }
  }

  /* ------------------------------------------------------------------ */
  /* Публичный API                                                       */
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

    // Для тестов и продвинутого использования.
    utils: { cookieExpiry, matchUserAgent, detectDevice },
  };

  /* Автоинициализация из data-атрибутов тега script. */
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
