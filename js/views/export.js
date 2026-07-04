// ============================================================================
// views/export.js — human-readable CSV inventory snapshot (opens in Excel).
// Same column layout the nightly backup workflow produces, so a manual export
// and an automated one look identical.
// ============================================================================
import { listEverythingForExport } from "../db.js";
import { locationLine } from "../domain.js";
import { toast } from "../ui.js";

function cell(value) {
  const s = value == null ? "" : String(value);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function buildInventoryCsv(sets) {
  const header = [
    "Set Code", "Status", "Season", "On Rims", "Rim Type", "Location",
    "Checked In", "Expected Out", "Picked Up", "Fee", "Paid",
    "Customer", "Phone", "Email", "Vehicle", "Plate",
    "Position", "Size", "Brand", "Model", "Tread (mm)", "DOT", "Studded", "Notes",
  ];
  const lines = [header.map(cell).join(",")];
  for (const set of sets) {
    const vehicle = set.vehicle || {};
    const customer = vehicle.customer || {};
    const base = [
      set.public_code, set.status, set.season, set.on_rims ? "yes" : "no", set.rim_type || "",
      locationLine(set) === "No location yet" ? "" : locationLine(set),
      set.check_in_date || "", set.expected_out_date || "", set.picked_up_at || "",
      set.fee ?? "", set.paid ? "yes" : "no",
      customer.name || "", customer.phone || "", customer.email || "",
      [vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(" "), vehicle.plate || "",
    ];
    const tires = set.tires || [];
    if (!tires.length) {
      lines.push([...base, "", "", "", "", "", "", "", set.notes || ""].map(cell).join(","));
    } else {
      for (const t of tires) {
        lines.push([...base, t.position || "", t.size || "", t.brand || "", t.model || "",
          t.tread_mm ?? "", t.dot_code || "", t.studded ? "yes" : "no", set.notes || ""].map(cell).join(","));
      }
    }
  }
  return lines.join("\r\n");
}

export async function exportInventoryCsv() {
  const sets = await listEverythingForExport();
  const csv = "﻿" + buildInventoryCsv(sets); // BOM so Excel reads UTF-8
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `ASC_inventory_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast(`Exported ${sets.length} set${sets.length === 1 ? "" : "s"}`);
}
