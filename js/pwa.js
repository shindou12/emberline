/* EMBERLINE — install + update: registers the service worker and reloads into a
   new build when one is published (only on the title / lab menu, never mid-run) */
(function (EL) {
  "use strict";
  if (!("serviceWorker" in navigator) || location.protocol === "file:") return;
  navigator.serviceWorker.register("sw.js", { updateViaCache: "none" }).catch(() => {});

  // the build this page runs, stamped into index.html at publish time
  const meta = document.querySelector('meta[name="el-version"]');
  const mine = meta ? meta.content : "dev";
  let pending = false;
  const check = () =>
    fetch("version.json?t=" + Date.now(), { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (j && j.v && mine !== "dev" && j.v !== mine) pending = true;
      })
      .catch(() => {});
  check();
  // a home-screen app can sit in the background for days: re-check whenever it comes back
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") check(); });
  setInterval(check, 10 * 60 * 1000);
  setInterval(() => {
    const st = EL.game && EL.game.med && EL.game.med.state;
    if (pending && (st === "Title" || st === "LabMenu") && !EL.game.med.busy) { pending = false; location.reload(); }
  }, 1000);
})(window.EL);
