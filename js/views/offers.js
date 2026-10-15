// ============================================================================
// views/offers.js — offers list, draft editor, and detail. #/offers,
// #/offers/new, #/offer/:id, and #/offer/:id/edit.
// ============================================================================
import { renderOffers } from "../offersScreen.js";

export async function render(main, { params, mode }) {
  const hash = location.hash.replace(/^#/, "");
  const query = new URLSearchParams((hash.split("?")[1]) || "");
  await renderOffers(main, {
    linkMode: "hash",
    mode: mode || "list",
    id: params?.[0] || null,
    setCode: query.get("set"),
  });
}
