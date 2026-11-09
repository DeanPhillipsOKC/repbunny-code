# RepBunny (Workout Tracker)

Strength workout tracker for Android and iPhone, currently in a small invite-only pilot ahead of the store launch. Vue 3 + TS + Capacitor, with every workout kept in an on-device SQLite database: no account and no backend.

- Architecture: [`docs/architecture.md`](docs/architecture.md)
- Backlog (active work, incl. human setup/device testing): [GitHub Issues](https://github.com/DeanPhillipsOKC/repbunny/issues); conventions in [`docs/backlog.md`](docs/backlog.md)

## License and contributions

The code is licensed under the [PolyForm Shield License 1.0.0](LICENSE). Anyone may read it, look for bugs and security problems, check the privacy claims, fork it, and make personal builds. Nobody may ship a product that competes with RepBunny, free or paid.

The RepBunny name, app icons, mascot, and theme art are not licensed; see [`TRADEMARKS.md`](TRADEMARKS.md). A fork must use its own name and art.

Outside code contributions aren't accepted, but reports are. Send bug reports and questions to hello@repbunny.app. Report security problems privately: see [`SECURITY.md`](SECURITY.md).

## Local dev

```
npm install
npm run dev
```

The dev server runs the app in a browser on the same on-device database code the phones use
(SQLite through its web stand-in), so it needs no keys or `.env.local`.

## E2E tests

Playwright end-to-end tests live in `e2e/`. Every spec starts the app on its own empty database,
so there are no test accounts — see
[`docs/architecture/testing.md`](docs/architecture/testing.md).

```
npx playwright install chromium   # first time only
npm run test:e2e
```
