"""
Renders the ReportResponse into a PDF matching the design's report modal
layout (design_handoff/designs/Jadeed Kashtkar App.dc.html, ~line 638-672):
branded header, 3 stat tiles, field summary table, fertilizer requirement
tiles, footnote.

Plain string-built HTML (no template engine — this is the one PDF in the
app) rendered via WeasyPrint. User-controlled strings (field name/crop) are
html.escape'd before interpolation.
"""

import html
from io import BytesIO

from weasyprint import HTML

from app.schemas.ledger import ReportResponse

_STYLE = """
body { font-family: sans-serif; color: #1e2b23; padding: 32px; }
.header { display: flex; align-items: center; gap: 10px; border-bottom: 2px solid #1B4332;
          padding-bottom: 14px; margin-bottom: 16px; }
.header .title { font-size: 18px; font-weight: 800; color: #1B4332; }
.header .subtitle { font-size: 11px; color: #8a927f; }
.stats { display: flex; gap: 8px; text-align: center; margin-bottom: 20px; }
.stats div { flex: 1; background: #F6F4ED; border-radius: 10px; padding: 10px; }
.stats .value { font-size: 20px; font-weight: 800; color: #1B4332; }
.stats .label { font-size: 10px; color: #8a927f; font-weight: 600; }
h2 { font-size: 12px; font-weight: 800; color: #8a927f; letter-spacing: .06em; margin-bottom: 8px; }
table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
th, td { text-align: left; padding: 6px 4px; font-size: 12px; border-bottom: 1px dashed #EAE7DA; }
th { color: #8a927f; font-weight: 700; text-transform: uppercase; font-size: 10px; }
td.num { text-align: right; }
.fert { display: flex; gap: 8px; margin-bottom: 20px; }
.fert div { flex: 1; background: #F6F4ED; border-radius: 10px; padding: 10px; font-size: 12px; }
.fert .amount { font-weight: 800; font-size: 16px; color: #1B4332; }
.footnote { font-size: 10px; color: #9aa290; border-top: 1px solid #EAE7DA; padding-top: 10px; }
"""


def render_report_pdf(report: ReportResponse, owner_email: str) -> bytes:
    generated_str = report.generated_at.strftime("%d %b %Y")
    rows = "".join(
        f"<tr><td>{html.escape(fs.name)}</td>"
        f"<td>{html.escape(fs.crop or '—')}</td>"
        f"<td class='num'>{fs.area_hectares if fs.area_hectares is not None else '—'} ha</td>"
        f"<td class='num'>{fs.ndvi_mean if fs.ndvi_mean is not None else '—'}</td>"
        f"<td class='num'>{fs.health_score if fs.health_score is not None else '—'}%</td></tr>"
        for fs in report.field_summaries
    )

    body = f"""
    <html><head><meta charset="utf-8"><style>{_STYLE}</style></head><body>
      <div class="header">
        <div>
          <div class="title">Production Report</div>
          <div class="subtitle">Jadeed Kashtkar · {html.escape(owner_email)} · {generated_str}</div>
        </div>
      </div>
      <div class="stats">
        <div><div class="value">{report.total_hectares}</div><div class="label">HECTARES</div></div>
        <div><div class="value">{report.avg_health_score}%</div><div class="label">AVG HEALTH</div></div>
        <div><div class="value">{report.field_count}</div><div class="label">FIELDS</div></div>
      </div>
      <h2>FIELD SUMMARY</h2>
      <table>
        <tr><th>Field</th><th>Crop</th><th>Area</th><th>NDVI</th><th>Health</th></tr>
        {rows or "<tr><td colspan='5'>No fields yet.</td></tr>"}
      </table>
      <h2>CALCULATED FERTILIZER REQUIREMENT</h2>
      <div class="fert">
        <div>Urea (46-0-0)<div class="amount">{report.urea_bags} bags</div></div>
        <div>DAP (18-46-0)<div class="amount">{report.dap_bags} bags</div></div>
        <div>SOP (0-0-50)<div class="amount">{report.sop_bags} bags</div></div>
      </div>
      <div class="footnote">
        Data: Sentinel-2 L2A via CDSE/openEO · Ledger entries: {report.ledger_entry_count} ·
        Fertilizer rates per PARC guidance, verify with local extension officer.
      </div>
    </body></html>
    """

    buffer = BytesIO()
    HTML(string=body).write_pdf(buffer)
    return buffer.getvalue()
