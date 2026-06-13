// Tower — top-level app: view routing, theme, drift state.
const { AppShell } = window.TowerChrome;

function TowerApp() {
  const [view, setView] = React.useState("tower");
  const [driftOn, setDriftOn] = React.useState(true);
  const [theme, setTheme] = React.useState("dark");
  const [stage, setStage] = React.useState("calm");   // drift-demo stage
  const [tickKey, setTickKey] = React.useState(0);

  React.useEffect(() => { document.documentElement.dataset.theme = theme; }, [theme]);
  React.useEffect(() => { if (!driftOn) setStage("calm"); }, [driftOn]);
  React.useEffect(() => { if (stage === "detected") setTickKey((k) => k + 1); }, [stage]);

  const toggleTheme = () => setTheme((t) => (t === "dark" ? "light" : "dark"));

  // epoch reflects the live arc on the drift view; elsewhere it shows synced truth (v8)
  const onDriftView = view === "tower" && driftOn;
  const ticked = onDriftView && stage !== "calm";
  const liveVer = !onDriftView ? "v8" : (ticked ? "v8" : "v7");
  let epoch;
  if (!onDriftView) {
    epoch = window.DATUM.epoch;
  } else {
    epoch = [
      { v: "v5", time: "11:20", state: "past" },
      { v: "v6", time: "12:08", state: "past" },
      { v: "v7", time: "12:55", state: ticked ? "past" : "live" },
    ];
    if (ticked) epoch.push({ v: "v8", time: "14:02", state: "live" });
  }

  let screen, withFooter = true;
  if (view === "tower") screen = <window.TowerHome driftOn={driftOn} onToggle={setDriftOn} onDriftStage={setStage} />;
  else if (view === "registry") screen = <window.RegistryScreen />;
  else if (view === "install") { screen = <window.InstallScreen />; withFooter = false; }
  else if (view === "replay") { screen = <window.ReplayScreen />; withFooter = false; }

  return (
    <AppShell view={view} onNav={setView} theme={theme} onTheme={toggleTheme}
      headerDrift={onDriftView && stage !== "calm" && stage !== "reconciled" && stage !== "patched"}
      epoch={epoch} liveVer={liveVer} tickKey={tickKey} animateTick={ticked}>
      <div className="tw-scroll">{screen}</div>
      {withFooter && <window.FleetFooter />}
    </AppShell>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<TowerApp />);
