// Creator Insights presentation: regular/Plus users see ranked topics only; admins keep full metrics.
(() => {
  // Search phrases that should stay visible to admins for moderation, but never appear in member-facing Insights.
  const explicit = /(^|\s)(strip|strips|stripped|stripper|strippers|stripping|nude|nudes|naked|porn|porno|pornography|xxx|sex|sexual|sexy|hentai|nsfw|fetish|erotic|erotica|boobs|tits|pussy|vagina|penis|dick|cock|blowjob|handjob|cum|orgasm|masturbat(?:e|es|ed|ing|ion)?|onlyfans)(\s|$)/i;
  const norm = (s) => String(s || "").toLowerCase().normalize("NFKD").replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
  const isExplicit = (s) => explicit.test(norm(s));

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

    // Remove explicit search phrases from every user-facing Insights list, including
    // Wanted, Trending and country breakdowns. Admin views are intentionally untouched.
    main.querySelectorAll(".umbox .umrow").forEach((row) => {
      const name = row.querySelector(".umname");
      row.classList.toggle("insights-explicit", !!name && isExplicit(name.textContent));
    });
  };

  const style = document.createElement("style");
  style.textContent = `
    #main.insights-no-counts .umrow > b,
    #main.insights-no-counts .umbar,
    #main.insights-no-counts .insights-count-label,
    #main.insights-no-counts .umrow.insights-explicit { display:none !important; }
  `;
  document.head.appendChild(style);
  new MutationObserver(apply).observe(document.documentElement, { childList:true, subtree:true });
  apply();
})();
