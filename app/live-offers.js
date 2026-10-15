// Fills the Offers page from Supabase. The list refreshes when offers change.
import { renderOffers } from "../js/offersScreen.js";

const root = document.getElementById("offerApp");
const params = new URLSearchParams(location.search);

function read() {
  if (params.get("new")) return { linkMode: "app", mode: "new", setCode: params.get("set") };
  if (params.get("id") && params.get("edit")) return { linkMode: "app", mode: "edit", id: params.get("id") };
  if (params.get("id")) return { linkMode: "app", mode: "detail", id: params.get("id") };
  return { linkMode: "app", mode: "list", setCode: params.get("set") };
}

renderOffers(root, read());
