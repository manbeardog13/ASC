// Operators are not shown a how-to walkthrough. A slot-setup link may still
// land on Locations and focus the zone field; that is a form, not a guide.

export async function bootOnboarding() {
  if (!location.pathname.endsWith("/locations.html")) return;
  if (new URLSearchParams(location.search).get("intro") !== "slot") return;
  setTimeout(() => document.getElementById("loc-zone")?.focus(), 0);
}
