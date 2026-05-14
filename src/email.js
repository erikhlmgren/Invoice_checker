// email.js
// Sends the invoice check report by email.
//
// Requires smtp config in config.json:
//   smtp.host, smtp.port, smtp.user, smtp.password, smtp.from, smtp.to
//
// The email includes:
//   - Subject with date and discrepancy count
//   - Plain text summary (counts + total delta)
//   - Excel report as attachment

const nodemailer = require('nodemailer');
const path = require('path');
const fs = require('fs');

function buildSubject(summary, date) {
  const d = date || new Date().toLocaleDateString('sv-SE');
  if (summary.DISCREPANCY > 0) {
    return `Fakturacheck ${d} — ${summary.DISCREPANCY} avvikelser (${summary.netDelta >= 0 ? '+' : ''}${summary.netDelta.toFixed(0)} SEK)`;
  }
  return `Fakturacheck ${d} — Inga avvikelser`;
}

function buildBody(summary) {
  const lines = [
    `Fakturacheck ${new Date().toLocaleDateString('sv-SE')}`,
    '',
    `Totalt rader:      ${summary.total}`,
    `Korrekt:           ${summary.CORRECT   || 0}`,
    `Avvikelser:        ${summary.DISCREPANCY || 0}`,
    `Ej hittad:         ${summary.NOT_FOUND  || 0}  (ramar, okänd vara, FSV)`,
    `Befriad (0 SEK):   ${summary.WAIVED     || 0}`,
    `Returer (hoppade): ${summary.SKIP       || 0}`,
    `Frakt:             ${summary.SHIPPING   || 0}`,
  ];

  if (summary.DISCREPANCY > 0) {
    lines.push('');
    lines.push(`Netto-delta avvikelser: ${summary.netDelta >= 0 ? '+' : ''}${summary.netDelta.toFixed(2)} SEK`);
    lines.push('');
    lines.push('Se bilaga för fullständig rapport.');
  } else {
    lines.push('');
    lines.push('Inga prisavvikelser hittades. Se bilaga för fullständig rapport.');
  }

  return lines.join('\n');
}

async function sendReport(reportPath, summary, smtpConfig) {
  if (!fs.existsSync(reportPath)) {
    throw new Error(`Report file not found: ${reportPath}`);
  }

  const transporter = nodemailer.createTransport({
    host:   smtpConfig.host,
    port:   smtpConfig.port,
    secure: smtpConfig.port === 465,
    auth: {
      user: smtpConfig.user,
      pass: smtpConfig.password,
    },
  });

  const subject = buildSubject(summary);
  const body    = buildBody(summary);

  const info = await transporter.sendMail({
    from:    smtpConfig.from,
    to:      smtpConfig.to,
    subject,
    text:    body,
    attachments: [{
      filename: path.basename(reportPath),
      path:     reportPath,
    }],
  });

  return info.messageId;
}

module.exports = { sendReport };
