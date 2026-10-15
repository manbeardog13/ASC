// ============================================================================
// offerPrint.js — the customer copy of an offer.
// A separate document from the staff screen. It reads an allow-list of buyer
// fields only: price lines, terms, validity, the customer's saved details,
// dates, tire-set links, and line photos. Staff-only figures are not read.
// ============================================================================
import { t, lang } from "./i18n.js";

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]
  ));
}

function locale() {
  return lang() === "hr" ? "hr-HR" : "en-GB";
}

function fmtDate(value) {
  if (!value) return "—";
  const d = new Date(String(value).length <= 10 ? `${value}T00:00:00` : value);
  if (Number.isNaN(d.getTime())) return esc(value);
  return esc(d.toLocaleDateString(locale(), { day: "numeric", month: "short", year: "numeric" }));
}

function money(amount, currency) {
  const n = Number(amount);
  if (!Number.isFinite(n)) return "—";
  return `${n.toLocaleString(locale(), { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${esc(currency || "EUR")}`;
}

const IMAGE_PATH = /^offers\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.(jpg|jpeg|png|webp)$/i;

function linePhoto(line) {
  const signed = typeof line?.signed_url === "string" && /^https?:\/\//i.test(line.signed_url) ? line.signed_url : "";
  const remote = typeof line?.image_url === "string" && /^https?:\/\//i.test(line.image_url) ? line.image_url : "";
  const path = typeof line?.image_path === "string" && IMAGE_PATH.test(line.image_path) ? line.image_path : "";
  return signed || remote || (path ? "" : "");
}

function buyerLines(offer) {
  const rows = Array.isArray(offer?.lines) ? offer.lines : [];
  return rows.map((line) => ({
    description: line?.description || "",
    qty: line?.qty,
    unit_price: line?.unit_price,
    photo: linePhoto(line),
  }));
}

function snapshot(offer) {
  const snap = offer?.customer_snapshot && typeof offer.customer_snapshot === "object"
    ? offer.customer_snapshot : {};
  return {
    name: snap.name || offer?.customer_name || "",
    phone: snap.phone || offer?.phone || "",
    email: snap.email || offer?.email || "",
    plate: snap.plate || "",
    make: snap.make || "",
    model: snap.model || "",
    year: snap.year || "",
    notes: snap.notes || "",
  };
}

function vehicleLine(snap) {
  return [snap.year, snap.make, snap.model].filter(Boolean).join(" ");
}

function setLinks(row, hrefs) {
  const code = row?.public_code || "";
  const setHref = code && hrefs?.set ? hrefs.set(code) : "";
  const locHref = code && hrefs?.locate ? hrefs.locate(code) : "";
  return { setHref, locHref };
}

function locationText(row) {
  return [row?.zone, row?.rack, row?.shelf, row?.slot].filter(Boolean).join(" · ");
}

export function buyerOfferText(offer, hrefs = {}) {
  const snap = snapshot(offer);
  const lines = buyerLines(offer);
  const sets = Array.isArray(offer?.offer_related_sets) ? offer.offer_related_sets : [];
  const bits = [
    t("offer.docTitle"),
    snap.name,
    [snap.phone, snap.email].filter(Boolean).join(" · "),
    [vehicleLine(snap), snap.plate].filter(Boolean).join(" · "),
  ];
  if (snap.notes) bits.push(snap.notes);
  for (const line of lines) {
    bits.push(`${line.description} × ${line.qty} · ${money(line.unit_price, offer?.currency)}`);
  }
  bits.push(`${t("offer.total")}: ${money(offer?.total, offer?.currency)}`);
  if (offer?.terms) bits.push(`${t("offer.terms")}: ${offer.terms}`);
  if (offer?.valid_until) bits.push(`${t("offer.valid")}: ${fmtDate(offer.valid_until)}`);
  for (const row of sets) {
    const links = setLinks(row, hrefs);
    const where = locationText(row);
    bits.push([
      row.public_code,
      row.season,
      [row.tire_size, row.tire_brand].filter(Boolean).join(" "),
      where,
      row.status,
      row.check_in_date ? `${t("offer.checkIn")} ${fmtDate(row.check_in_date)}` : "",
      row.swap_at ? `${t("offer.swap")} ${fmtDate(row.swap_at)}` : "",
      row.expected_out_date ? `${t("offer.due")} ${fmtDate(row.expected_out_date)}` : "",
      row.keep_plan || "",
      links.setHref,
      links.locHref,
    ].filter(Boolean).join(" · "));
  }
  return bits.filter(Boolean).join("\n");
}

export function buyerOfferDocument(offer, hrefs = {}) {
  const snap = snapshot(offer);
  const lines = buyerLines(offer);
  const sets = Array.isArray(offer?.offer_related_sets) ? offer.offer_related_sets : [];
  const car = vehicleLine(snap);
  const lineRows = lines.map((line) => `
    <tr>
      <td>${line.photo ? `<img alt="${esc(line.description || t("offer.image"))}" src="${esc(line.photo)}">` : ""}${esc(line.description || "—")}</td>
      <td class="num">${esc(line.qty)}</td>
      <td class="num">${money(line.unit_price, offer?.currency)}</td>
    </tr>`).join("");
  const setRows = sets.map((row) => {
    const links = setLinks(row, hrefs);
    const where = locationText(row) || "—";
    const code = esc(row.public_code || "—");
    const codeCell = links.setHref ? `<a href="${esc(links.setHref)}">${code}</a>` : code;
    const locCell = links.locHref ? `<a href="${esc(links.locHref)}">${esc(where)}</a>` : esc(where);
    return `<tr>
      <td>${codeCell}</td>
      <td>${esc(row.season || "—")}</td>
      <td>${esc([row.tire_size, row.tire_brand].filter(Boolean).join(" · ") || "—")}</td>
      <td>${locCell}</td>
      <td>${esc(row.status || "—")}</td>
      <td>${fmtDate(row.check_in_date)}</td>
      <td>${fmtDate(row.swap_at)}</td>
      <td>${fmtDate(row.expected_out_date)}</td>
      <td>${esc(row.keep_plan || "—")}</td>
    </tr>`;
  }).join("");

  return `<!doctype html>
<html lang="${lang()}">
<head>
<meta charset="utf-8">
<title>${esc(t("offer.docTitle"))}</title>
<style>
  body{font-family:"Sora","Inter",system-ui,sans-serif;color:#141414;padding:28px;background:#fff}
  h1{font-size:22px;font-weight:500;letter-spacing:.02em;padding:0 0 8px}
  p{padding:0 0 6px;font-size:13px;line-height:1.45}
  table{width:100%;border-collapse:collapse;padding:14px 0}
  th,td{text-align:left;font-size:12px;padding:6px 8px 6px 0;border-bottom:1px solid #e4e4e4;vertical-align:top}
  th{font-size:10px;letter-spacing:.06em;text-transform:uppercase;color:#555}
  td.num,th.num{text-align:right}
  img{display:block;width:72px;height:72px;object-fit:cover;border-radius:8px;padding:0 0 6px}
  a{color:#c0360d}
  .total{font-weight:600;font-size:16px;padding-top:8px}
</style>
</head>
<body>
  <h1>${esc(t("offer.docTitle"))}</h1>
  <p>${esc(snap.name || "—")}</p>
  <p>${esc([snap.phone, snap.email].filter(Boolean).join(" · ") || "—")}</p>
  <p>${esc([car, snap.plate].filter(Boolean).join(" · ") || "—")}</p>
  ${snap.notes ? `<p>${esc(snap.notes)}</p>` : ""}
  <table>
    <thead><tr><th>${esc(t("offer.desc"))}</th><th class="num">${esc(t("offer.qty"))}</th><th class="num">${esc(t("offer.price"))}</th></tr></thead>
    <tbody>${lineRows || `<tr><td colspan="3">—</td></tr>`}</tbody>
  </table>
  <p class="total">${esc(t("offer.total"))}: ${money(offer?.total, offer?.currency)}</p>
  ${offer?.terms ? `<p>${esc(t("offer.terms"))}: ${esc(offer.terms)}</p>` : ""}
  ${offer?.valid_until ? `<p>${esc(t("offer.valid"))}: ${fmtDate(offer.valid_until)}</p>` : ""}
  <h1>${esc(t("offer.sets"))}</h1>
  <table>
    <thead><tr>
      <th>${esc(t("offer.set"))}</th><th>${esc(t("offer.season"))}</th><th>${esc(t("offer.tires"))}</th>
      <th>${esc(t("offer.location"))}</th><th>${esc(t("offer.state"))}</th>
      <th>${esc(t("offer.checkIn"))}</th><th>${esc(t("offer.swap"))}</th><th>${esc(t("offer.due"))}</th><th>${esc(t("offer.keep"))}</th>
    </tr></thead>
    <tbody>${setRows || `<tr><td colspan="9">${esc(t("offer.noSets"))}</td></tr>`}</tbody>
  </table>
</body>
</html>`;
}
