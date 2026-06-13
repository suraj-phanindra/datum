// Tower chrome — left nav rail, top bar, epoch spine, app shell.
const { EpochStrip, Badge, PresenceStack } = window.DatumDesignSystem_b409bf;

const Mark = ({ size = 24 }) => (
  <svg width={size} height={size} viewBox="0 0 48 48" fill="none">
    <circle cx="24" cy="24" r="12.5" stroke="currentColor" strokeWidth="2" />
    <g stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <line x1="24" y1="5" x2="24" y2="20.4" /><line x1="24" y1="27.6" x2="24" y2="43" />
      <line x1="5" y1="24" x2="20.4" y2="24" /><line x1="27.6" y1="24" x2="43" y2="24" />
    </g>
    <circle cx="24" cy="24" r="2.6" fill="#F5A623" />
  </svg>
);

const I = {
  tower: <path d="M3 3h7v7H3zM3 13h7v4H3zM13 3h4v4h-4zM13 10h4v7h-4z" />,
  registry: <g><path d="M3 5c0-1.1 3-2 7-2s7 .9 7 2-3 2-7 2-7-.9-7-2z" /><path d="M3 5v5c0 1.1 3 2 7 2s7-.9 7-2V5M3 10v5c0 1.1 3 2 7 2s7-.9 7-2v-5" /></g>,
  replay: <g><path d="M3 10a7 7 0 107-7 7 7 0 00-5 2.1L3 7" /><path d="M3 3v3h3M10 6.5V10l2.5 1.5" /></g>,
  install: <g><path d="M3 3h14v14H3z" /><path d="M6 7l2.5 2L6 11M10 11h3" strokeLinecap="round" strokeLinejoin="round" /></g>,
  gear: <g><circle cx="10" cy="10" r="2.5" /><path d="M10 1.5v2M10 16.5v2M3.5 3.5l1.4 1.4M15.1 15.1l1.4 1.4M1.5 10h2M16.5 10h2M3.5 16.5l1.4-1.4M15.1 4.9l1.4-1.4" strokeLinecap="round" /></g>,
  sun: <g><circle cx="10" cy="10" r="3.5" /><path d="M10 2v2M10 16v2M2 10h2M16 10h2M4.2 4.2l1.4 1.4M14.4 14.4l1.4 1.4M4.2 15.8l1.4-1.4M14.4 5.6l1.4-1.4" strokeLinecap="round" /></g>,
};

function NavBtn({ id, view, onNav, title }) {
  const active = view === id;
  return (
    <button className="tw-nav__btn" data-active={active} onClick={() => onNav(id)} title={title} aria-label={title}>
      <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.4">{I[id]}</svg>
    </button>
  );
}

function AppShell({ view, onNav, theme, onTheme, headerDrift = false, epoch = [], liveVer = "v8", tickKey = 0, animateTick = false, children }) {
  const d = window.DATUM;
  return (
    <div className="tw-shell">
      <nav className="tw-rail">
        <div className="tw-rail__mark"><Mark size={26} /></div>
        <div className="tw-rail__nav">
          <NavBtn id="tower" view={view} onNav={onNav} title="Tower" />
          <NavBtn id="registry" view={view} onNav={onNav} title="Registry" />
          <NavBtn id="replay" view={view} onNav={onNav} title="Replay" />
          <NavBtn id="install" view={view} onNav={onNav} title="Install" />
        </div>
        <button className="tw-nav__btn" onClick={onTheme} title="Toggle theme" aria-label="Toggle theme">
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.4">{I.sun}</svg>
        </button>
      </nav>

      <div className="tw-main">
        <header className="tw-top">
          <div className="tw-top__ws">
            <span className="tw-top__org mono">{d.workspace}</span>
            <span className="tw-top__sep">/</span>
            <span className="tw-top__feat">{d.feature}</span>
          </div>
          <div className="tw-top__right">
            {headerDrift
              ? <Badge signal="red" live>drift · 1 reconciling</Badge>
              : <Badge signal="green" dot>all synced · v8</Badge>}
            <PresenceStack sessions={d.sessions} max={3} />
          </div>
        </header>

        <div className="tw-epoch">
          <span className="eyebrow">epoch</span>
          <EpochStrip key={tickKey} versions={epoch} showTimes animateLive={animateTick} />
          <span className="tw-epoch__live mono" data-live={liveVer === "v8"}>live · {liveVer}</span>
        </div>

        <div className="tw-body">{children}</div>
      </div>
    </div>
  );
}

window.TowerChrome = { AppShell, Mark };
