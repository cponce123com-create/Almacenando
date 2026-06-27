/**
 * helpers.ts
 *
 * Funciones auxiliares para construir plantillas HTML de email (SMTP).
 */

export function smtpHeader(title: string, iconEmoji: string, color: string): string {
  return `<div style="background:${color};padding:20px;border-radius:8px 8px 0 0;text-align:center">
    <div style="font-size:40px;margin-bottom:8px">${iconEmoji}</div>
    <h1 style="margin:0;color:#fff;font-size:18px">${title}</h1>
  </div>`;
}

export function smtpFooter(sender: string, role: string): string {
  return `<div style="background:#f8fafc;padding:12px;border-radius:0 0 8px 8px;border-top:1px solid #e2e8f0;text-align:center;font-size:12px;color:#64748b">
    <p style="margin:2px 0"><strong>${sender}</strong></p>
    <p style="margin:2px 0">${role}</p>
  </div>`;
}

export function smtpWrap(header: string, body: string, footer: string): string {
  return `<div style="max-width:600px;margin:0 auto;font-family:system-ui,-apple-system,sans-serif">
    ${header}
    <div style="background:#fff;padding:20px;color:#1e293b;font-size:14px;line-height:1.6">${body}</div>
    ${footer}
  </div>`;
}

export function infoTable(headers: string[], rows: Array<[string, string]>, borderColor = "#3b82f6", bgColor = "#f1f5f9"): string {
  const headerRow = `<tr>${headers.map(h => `<th style="padding:8px 10px;font-weight:700;background:${borderColor};color:#fff;border-bottom:2px solid ${borderColor};text-align:left">${h}</th>`).join("")}</tr>`;
  const rowHtml = rows.map(([k, v]) =>
    `<tr><td style="padding:6px 10px;font-weight:600;border-bottom:1px solid #e2e8f0;width:40%">${k}</td><td style="padding:6px 10px;border-bottom:1px solid #e2e8f0">${v}</td></tr>`
  ).join("\n");
  return `<table style="width:100%;border-collapse:collapse;border:1px solid #e2e8f0;border-radius:6px;overflow:hidden;margin:12px 0">
    <thead>${headerRow}</thead>
    <tbody>${rowHtml}</tbody>
  </table>`;
}
