```text
    _            __     __  _ _  Clickunder __          __  _
   | |           \ \   / / | | |            \ \        / / | |
   | |__  _   _   \ \_/ /__| | | _____      _\ \  /\  / /__| |__
   | '_ \| | | |   \   / _ \ | |/ _ \ \ /\ / /\ \/  \/ / _ \ '_ \
   | |_) | |_| |    | |  __/ | | (_) \ V  V /  \  /\  /  __/ |_) |
   |_.__/ \__, |    |_|\___|_|_|\___/ \_/\_/    \/  \/ \___|_.__/
           __/ |
          |___/             https://yellowweb.top

If you like this script, PLEASE DONATE!
```

[Support the project](https://yellowweb.top/donate)

# YWB.Popunder.JS

A popunder/clickunder for landing pages. Version **2.0.0**. No jQuery or other dependencies, modern JavaScript.

On user click a small window opens and just sits there. It expands and goes to the target URL only in two cases: the user clicks the main tab, or clicks the small window itself. So the visitor stays on the site while the offer opens behind.

## Quick start

Copy `ywbpopunder.js` to your site and include it with a single tag:

```html
<script src="ywbpopunder.js" data-url="https://offer.example/landing"></script>
```

That's it. The user's first real click opens the offer in a popunder.

Manual setup with options:

```html
<script src="ywbpopunder.js"></script>
<script>
  Popunder.init({
    url: 'https://offer.example/landing',
    limit: 1,
    cooldownMinutes: 120
  });
</script>
```

Multiple clickunders on one page — just use different `id`s:

```js
Popunder.init({ id: 'main',  url: 'https://offer.example/a', whitelist: ['#content'] });
Popunder.init({ id: 'video', url: 'https://offer.example/b', whitelist: ['video'] });
```

## Options

| Option | Default | Description |
| --- | --- | --- |
| `url` | `''` | **Required.** Where to send the user. |
| `id` | `'popunder'` | Cookie namespace. A different `id` means a different clickunder on the same domain. |
| `type` | `'classic'` | `classic` — popunder behind the tab; `redirect` — send the current tab to the offer and open the original link nearby. |
| `limit` | `1` | How many times to show the offer to one user. `0` — unlimited. |
| `expirationMinutes` | `-1` | Lifetime of the "already shown" cookie, in minutes. `-1` — until the next noon/midnight. |
| `cooldownMinutes` | `10` | Pause after a show, in minutes. `0` — no pause. |
| `clicksToStart` | `0` | How many clicks to wait before the first show. `0`/`1` — on the very first click. |
| `startDelaySec` | `0` | Delay before arming, in seconds. |
| `whitelist` | `[]` | Clickable-zone selectors. Empty — the whole page. |
| `blacklist` | `['.no-pop']` | Selectors where the clickunder stays silent (together with their parents). |
| `refererWhitelist` | `[]` | Only show from these referrers (exact domains, no `www.`). |
| `refererBlacklist` | `[]` | Never show from these referrers. |
| `userAgentBlacklist` | `[]` | UA strings to block. Supports `a&&b` (all substrings) and `a||b` (any group). |
| `coverIframes` | `true` | Cover iframes with transparent divs so clicks on players are counted. |
| `useCapture` | `false` | Listen for clicks in the capture phase. |
| `windowFeatures` | *see code* | Popunder window features. Opens 1×1 and sits there until the user acts. |
| `debug` | `false` | Console logs. |
| `onOpen` | `null` | Callback after opening: `(url) => {}`. |

The same values can be set via `data-*` attributes on the script tag: `data-url`, `data-id`, `data-type`, `data-limit`, `data-expiration`, `data-cooldown`, `data-clicks`, `data-timer`, `data-whitelist` and `data-blacklist` (comma-separated), `data-debug`.

## API

```js
const p = Popunder.init({ url: 'https://offer.example/landing' });

p.arm();          // arm the clickunder
p.destroy();      // disarm and remove iframe covers
p.reset();        // clear the "already shown" cookies
p.config;         // effective configuration
p.device;         // { os, browser }

Popunder.reset(); // clear cookies on every instance
```

## How it works

1. On the first real click a small `about:blank` window opens synchronously — that is how it slips past the popup blocker.
2. After that the window **just sits there** and does nothing. It expands and goes to the target URL only when:
   - the user clicks **the main tab** — the popunder goes back, expands to full screen and loads the URL, and the original click is replayed so the site does not lose the action;
   - the user clicks **the small window itself** — it expands and navigates on its own.
3. The show is recorded in cookies (`limit`, `expirationMinutes`, `cooldownMinutes`) so the same user is not hit over and over.
4. On mobile (`android`/`ios`) the original link opens in a new tab and the current tab goes to the offer.

## Verifying

Open `index.html` in a browser — the demo has `data-debug` on, so the engine logs what it does. The button inside `.no-pop` must be ignored.

Unit checks for the pure helpers:

```bash
npm test
```

The popunder needs a **real click** (`event.isTrusted`). Synthetic clicks are ignored by design. Ad blockers and "block pop-ups" browser settings can get in the way; test on a live domain across several browsers.

## Source

The logic was extracted from a working clickunder on `rutor.info` (loader `deltarockme.com/services/` → engine `miceonme.com/plane/weight.js`), then rewritten and cleaned up. Codex-database references: [gist](https://gist.github.com/dvygolov/ec23e81ad13ada2f41f2402c984527ca) · [gist](https://gist.github.com/dvygolov/e22f81a5f316f86c6973cca900e75d57) · [js-popunder](https://github.com/dvygolov/js-popunder).

## License

MIT. Use responsibly and only where appropriate.
