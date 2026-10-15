(() => {
  const stage = document.getElementById("stage");
  const space = document.getElementById("space");
  const device = document.getElementById("device");
  const app = document.getElementById("app");
  const status = document.getElementById("status");

  function fitPhone() {
    const scale = Math.min(1, (stage.clientWidth - 32) / 417, (stage.clientHeight - 24) / 925);
    device.style.transform = `scale(${scale})`;
    space.style.width = `${417 * scale}px`;
    space.style.height = `${925 * scale}px`;
  }
  new ResizeObserver(fitPhone).observe(stage);
  fitPhone();

  function clock() {
    document.getElementById("clock").textContent = new Intl.DateTimeFormat("en-PH", {hour: "numeric", minute: "2-digit", hour12: false}).format(new Date());
  }
  clock();
  setInterval(clock, 60000);

  function navigate(href) {
    status.textContent = "Loading live app…";
    app.src = href;
  }
  document.getElementById("home").addEventListener("click", () => navigate("/?app=android"));
  document.getElementById("reload").addEventListener("click", () => {
    try { navigate(app.contentWindow.location.href); }
    catch { navigate("/?app=android"); }
  });
  document.getElementById("open").addEventListener("click", event => {
    try {
      const current = new URL(app.contentWindow.location.href);
      if (current.origin !== location.origin) return;
      current.searchParams.set("app", "android");
      event.currentTarget.href = current.href;
    } catch { /* The default home link remains available. */ }
  });
  function onAppLoad() {
    try {
      const doc = app.contentDocument;
      status.textContent = doc?.documentElement.dataset.app === "android" ? "Live app connected" : "Open full app to continue";
    } catch { status.textContent = "Open full app to continue"; }
  }
  app.addEventListener("load", onAppLoad);
  if (app.contentDocument?.readyState === "complete" && app.contentDocument.documentElement.dataset.app === "android") onAppLoad();
})();
