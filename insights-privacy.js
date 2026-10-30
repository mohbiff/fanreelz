// Creator Insights presentation: regular/Plus users see ranked topics only; admins keep full metrics.
(() => {
  const apply = () => {
    const main = document.querySelector("#main");
    if (!main) return;
    let hide = false;
    try { hide = state?.view === "insights" && !!insData && !insData.loading && !insData.admin; } catch (_) {}
    main.classList.toggle("insights-no-counts", hide);
    if (!hide) return;
    main.querySelectorAll(".umbox h3 small.vmeta").forEach((el) => {
      el.classList.toggle("insights-count-label", /^\s*\d[\d,.]*\s+searches\s*$/i.test(el.textContent || ""));
    });
  };
  const style = document.createElement("style");
  style.textContent = `
    #main.insights-no-counts .umrow > b,
    #main.insights-no-counts .umbar,
    #main.insights-no-counts .insights-count-label { display:none !important; }
  `;
  document.head.appendChild(style);
  new MutationObserver(apply).observe(document.documentElement, { childList:true, subtree:true });
  apply();
})();
