/**
 * POCKET BUDGET — a free personal-finance tracker built on Google Sheets + Apps Script.
 *
 * What it does
 *  - Tracks expenses and income in a Google Sheet you own (no outside servers, no fees).
 *  - Monthly budget per category with live "spent / remaining / % used".
 *  - Tracks subscriptions & recurring bills, auto-logs them when due, warns you before they hit.
 *  - Optional Gmail scan that finds receipts / renewals so you can spot forgotten subscriptions.
 *  - Sends a morning plan, a midday check-in and a night recap by Email, WhatsApp (CallMeBot)
 *    and/or Telegram.
 *  - A phone-friendly web app (Index.html) to log an expense in seconds.
 *
 * Install: see README.md. Short version: Extensions → Apps Script in a new Google Sheet,
 * paste Code.gs and Index.html, reload the sheet, then 💰 Finance → 1. Set up this spreadsheet.
 */

const APP_NAME = 'Pocket Budget';

const SHEETS = {
  TX: 'Transactions',
  BUDGET: 'Budget',
  SUBS: 'Subscriptions',
  DETECTED: 'Detected Bills',
  SETTINGS: 'Settings',
  LOG: 'Log'
};

const DEFAULT_CATEGORIES = [
  ['Housing', 1200], ['Utilities', 200], ['Groceries', 450], ['Dining out', 150],
  ['Transport', 250], ['Health', 100], ['Subscriptions', 60], ['Entertainment', 80],
  ['Shopping', 120], ['Debt payments', 200], ['Savings', 300], ['Other', 100]
];

const PAYMENT_METHODS = ['Cash', 'Debit card', 'Credit card', 'Bank transfer', 'Mobile wallet', 'Other'];
const CYCLES = ['Weekly', 'Monthly', 'Quarterly', 'Yearly'];
const BUDGET_ROWS = 40;   // rows of Budget formulas prepared (room to add categories)
const SUB_ROWS = 100;     // rows of Subscriptions prepared

const SETTINGS_SPEC = [
  { key: 'name', label: 'Your name', value: 'Friend', help: 'Used in greetings.' },
  { key: 'email', label: 'Email for summaries', value: '', help: 'Defaults to your Google account.' },
  { key: 'currency', label: 'Currency symbol', value: '$', help: 'e.g. $  €  £  Q  S/  R$' },
  { key: 'income', label: 'Expected monthly income', value: 0, help: 'Optional. Shows what is left after your budget.' },
  { key: 'morningHour', label: 'Morning summary hour (0-23)', value: 7, help: 'After changing any hour, run 💰 Finance → 2. Turn on daily summaries again.' },
  { key: 'middayHour', label: 'Midday check-in hour (0-23)', value: 13, help: '' },
  { key: 'nightHour', label: 'Night recap hour (0-23)', value: 21, help: '' },
  { key: 'sendEmail', label: 'Send by email', value: true, help: 'Free. A normal Gmail account can send 100 emails/day; this uses 3.' },
  { key: 'sendWhatsApp', label: 'Send by WhatsApp (CallMeBot)', value: false, help: 'Optional free service. For WhatsApp through n8n, use the webhook settings below instead.' },
  { key: 'waPhone', label: 'WhatsApp phone with country code', value: '', help: 'e.g. +15551234567' },
  { key: 'waKey', label: 'CallMeBot API key', value: '', help: 'CallMeBot sends it to you on WhatsApp.' },
  { key: 'sendTelegram', label: 'Send by Telegram', value: false, help: 'Free and very reliable. See README.' },
  { key: 'tgToken', label: 'Telegram bot token', value: '', help: 'From @BotFather.' },
  { key: 'tgChatId', label: 'Telegram chat ID', value: '', help: 'Message your bot, then run 💰 Finance → Find my Telegram chat ID.' },
  { key: 'sendWebhook', label: 'Send summaries to a webhook (n8n, Make, Zapier)', value: false, help: 'Posts each summary as JSON to the URL below, e.g. so n8n can forward it to WhatsApp.' },
  { key: 'webhookUrl', label: 'Webhook URL', value: '', help: 'e.g. the Production URL of an n8n Webhook node.' },
  { key: 'incomingEnabled', label: 'Allow the GitHub phone app & n8n (API)', value: false, help: 'Turn on to use the phone app hosted on GitHub Pages and/or n8n. Needs the web app deployed with access "Anyone"; see README.' },
  { key: 'webhookToken', label: 'Secret API token', value: '', help: 'Generated for you. The GitHub app and n8n send it with every request. Never share it; change it to lock out old devices.' },
  { key: 'githubAppUrl', label: 'Phone app address (GitHub Pages)', value: '', help: 'e.g. https://yourname.github.io/pocket-budget/ — then run 💰 Finance → Connect my phone app.' },
  { key: 'billDays', label: 'Warn about bills due within (days)', value: 3, help: '' },
  { key: 'alertPct', label: 'Category alert at (% of budget)', value: 80, help: '' },
  { key: 'scanGmail', label: 'Scan Gmail every Monday for bills', value: false, help: 'Finds receipts/renewals and lists them in "Detected Bills" for you to review.' }
];

const TIPS = [
  'Pay yourself first: move savings out the day income arrives, then budget what is left.',
  'Before a non-essential purchase over a day of wages, wait 48 hours. Most urges pass.',
  'Cancel one subscription you have not used in 30 days. Check the Subscriptions tab.',
  'An emergency fund of even one month of expenses turns a crisis into an inconvenience.',
  'Pay more than the minimum on the card with the highest interest rate first.',
  'Plan meals for the week before grocery shopping; it cuts impulse buys.',
  'Small daily spends add up: a $4 habit each workday is about $1,000 a year.',
  'Call your phone or internet provider once a year and ask for a better rate.',
  'Round up: if your budget says $47, plan for $50 and keep the difference as a buffer.',
  'Review last month every 1st of the month: what surprised you? Adjust one category.',
  'Use cash or a separate debit card for categories you tend to overspend.',
  'Automate bill payments where you can, then let this app remind you they are coming.'
];

/* =========================================================================================
 * MENU & SETUP
 * ========================================================================================= */

function onOpen() {
  SpreadsheetApp.getUi().createMenu('💰 Finance')
    .addItem('1. Set up this spreadsheet', 'setup')
    .addItem('2. Turn on daily summaries', 'enableDailySummaries')
    .addItem('Turn off daily summaries', 'disableDailySummaries')
    .addSeparator()
    .addItem('Send me a test summary now', 'sendTestSummary')
    .addItem('Process due subscriptions now', 'processSubscriptionsNow')
    .addSeparator()
    .addItem('Scan Gmail for bills & subscriptions', 'scanGmailForBills')
    .addItem('Add checked emails (subscriptions / expenses)', 'importCheckedBills')
    .addSeparator()
    .addItem('Find my Telegram chat ID', 'findTelegramChatId')
    .addItem('Connect my phone app (GitHub)', 'connectGithubApp')
    .addItem('Open the mobile app (Google-hosted)', 'showAppLink')
    .addToUi();
}

function setup() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  setupSettings_(ss);
  setupBudget_(ss);
  setupTransactions_(ss);
  setupSubscriptions_(ss);
  setupDetected_(ss);
  setupLog_(ss);

  // Tidy tab order and remove the empty default sheet if it is still there.
  [SHEETS.BUDGET, SHEETS.TX, SHEETS.SUBS, SHEETS.DETECTED, SHEETS.SETTINGS, SHEETS.LOG]
    .forEach((name, i) => { ss.setActiveSheet(ss.getSheetByName(name)); ss.moveActiveSheet(i + 1); });
  ['Sheet1', 'Hoja 1', 'Hoja1', 'Feuille 1', 'Página1'].forEach(n => {
    const s = ss.getSheetByName(n);
    if (s && s.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(s);
  });
  ss.setActiveSheet(ss.getSheetByName(SHEETS.SETTINGS));

  safeAlert_('Setup complete ✅\n\n' +
    '1) Review the Settings tab (name, currency, email, hours).\n' +
    '2) Adjust your monthly limits in the Budget tab.\n' +
    '3) Add your bills in the Subscriptions tab.\n' +
    '4) Run 💰 Finance → 2. Turn on daily summaries.\n\n' +
    'Then deploy the mobile app (see README).');
}

function setupSettings_(ss) {
  const sh = getOrCreate_(ss, SHEETS.SETTINGS);
  if (sh.getLastRow() === 0) sh.getRange(1, 1, 1, 4).setValues([['Key', 'Setting', 'Value', 'Help']]);
  const existing = sh.getLastRow() > 1 ? sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues().map(r => r[0]) : [];
  SETTINGS_SPEC.forEach(spec => {
    if (existing.indexOf(spec.key) !== -1) return;
    const row = sh.getLastRow() + 1;
    sh.getRange(row, 1, 1, 4).setValues([[spec.key, spec.label, '', spec.help]]);
    const cell = sh.getRange(row, 3);
    if (typeof spec.value === 'boolean') cell.insertCheckboxes();
    cell.setValue(spec.key === 'email' ? Session.getEffectiveUser().getEmail()
      : spec.key === 'webhookToken' ? Utilities.getUuid().replace(/-/g, '')
      : spec.value);
  });
  styleHeader_(sh, 4);
  sh.hideColumns(1);
  sh.setColumnWidth(2, 290); sh.setColumnWidth(3, 260); sh.setColumnWidth(4, 520);
  sh.getRange(2, 4, sh.getMaxRows() - 1, 1).setFontColor('#6b7280').setWrap(true);
  sh.getRange(2, 3, sh.getMaxRows() - 1, 1).setBackground('#fffbea');
}

function setupBudget_(ss) {
  const sh = getOrCreate_(ss, SHEETS.BUDGET);
  if (sh.getLastRow() > 0) return;
  sh.getRange(1, 1, 1, 5).setValues([['Category', 'Monthly budget', 'Spent this month', 'Remaining', '% used']]);
  sh.getRange(2, 1, DEFAULT_CATEGORIES.length, 2).setValues(DEFAULT_CATEGORIES);

  const monthStart = 'DATE(YEAR(TODAY()),MONTH(TODAY()),1)';
  const formulas = [];
  for (let r = 2; r <= BUDGET_ROWS + 1; r++) {
    formulas.push([
      `=IF(A${r}="","",SUMIFS(${SHEETS.TX}!$E:$E,${SHEETS.TX}!$C:$C,A${r},${SHEETS.TX}!$B:$B,"Expense",` +
      `${SHEETS.TX}!$A:$A,">="&${monthStart},${SHEETS.TX}!$A:$A,"<"&EDATE(${monthStart},1)))`,
      `=IF(A${r}="","",B${r}-C${r})`,
      `=IF(OR(A${r}="",N(B${r})=0),"",C${r}/B${r})`
    ]);
  }
  sh.getRange(2, 3, BUDGET_ROWS, 3).setFormulas(formulas);
  sh.getRange(2, 2, BUDGET_ROWS, 3).setNumberFormat('#,##0.00');
  sh.getRange(2, 5, BUDGET_ROWS, 1).setNumberFormat('0%');

  // Summary block
  const incomeFormula = `=SUMIFS(${SHEETS.TX}!$E:$E,${SHEETS.TX}!$B:$B,"Income",${SHEETS.TX}!$A:$A,">="&${monthStart},${SHEETS.TX}!$A:$A,"<"&EDATE(${monthStart},1))`;
  sh.getRange('G1:H1').setValues([['This month', '']]);
  sh.getRange('G2:G6').setValues([['Total budget'], ['Spent'], ['Remaining'], ['Income received'], ['Income − spent']]);
  sh.getRange('H2:H6').setFormulas([['=SUM(B2:B)'], ['=SUM(C2:C)'], ['=H2-H3'], [incomeFormula], ['=H5-H3']]);
  sh.getRange('H2:H6').setNumberFormat('#,##0.00');
  sh.getRange('G1:H1').setFontWeight('bold').setBackground('#1f6f4a').setFontColor('#ffffff');
  sh.getRange('G2:G6').setFontWeight('bold');

  const pct = sh.getRange(2, 5, BUDGET_ROWS, 1);
  sh.setConditionalFormatRules([
    SpreadsheetApp.newConditionalFormatRule().whenNumberGreaterThanOrEqualTo(1)
      .setBackground('#fde2e1').setFontColor('#b42318').setRanges([pct]).build(),
    SpreadsheetApp.newConditionalFormatRule().whenNumberGreaterThanOrEqualTo(0.8)
      .setBackground('#fff4d6').setFontColor('#9a6700').setRanges([pct]).build(),
    SpreadsheetApp.newConditionalFormatRule().whenNumberLessThan(0.8)
      .setFontColor('#1f6f4a').setRanges([pct]).build()
  ]);

  styleHeader_(sh, 5);
  sh.setColumnWidth(1, 160); sh.setColumnWidths(2, 4, 130); sh.setColumnWidth(7, 140); sh.setColumnWidth(8, 120);

  const chart = sh.newChart().asBarChart()
    .addRange(sh.getRange(1, 1, DEFAULT_CATEGORIES.length + 1, 1))
    .addRange(sh.getRange(1, 2, DEFAULT_CATEGORIES.length + 1, 2))
    .setOption('title', 'Budget vs spent this month')
    .setOption('colors', ['#cfd8d3', '#1f6f4a'])
    .setOption('legend', { position: 'top' })
    .setPosition(9, 7, 0, 0).setOption('width', 520).setOption('height', 380)
    .build();
  sh.insertChart(chart);
}

function setupTransactions_(ss) {
  const sh = getOrCreate_(ss, SHEETS.TX);
  if (sh.getLastRow() > 0) { addHeaderIfMissing_(sh, 8, 'Receipt'); return; }
  sh.getRange(1, 1, 1, 8).setValues([['Date', 'Type', 'Category', 'Description', 'Amount', 'Payment method', 'Added via', 'Receipt']]);
  const n = sh.getMaxRows() - 1;
  sh.getRange(2, 1, n, 1).setNumberFormat('yyyy-mm-dd')
    .setDataValidation(SpreadsheetApp.newDataValidation().requireDate().setAllowInvalid(false).build());
  sh.getRange(2, 2, n, 1).setDataValidation(listRule_(['Expense', 'Income']));
  sh.getRange(2, 3, n, 1).setDataValidation(SpreadsheetApp.newDataValidation()
    .requireValueInRange(ss.getSheetByName(SHEETS.BUDGET).getRange(2, 1, BUDGET_ROWS, 1), true).build());
  sh.getRange(2, 5, n, 1).setNumberFormat('#,##0.00');
  sh.getRange(2, 6, n, 1).setDataValidation(listRule_(PAYMENT_METHODS, true));
  styleHeader_(sh, 8);
  sh.setColumnWidth(1, 105); sh.setColumnWidth(3, 140); sh.setColumnWidth(4, 260); sh.setColumnWidth(6, 130); sh.setColumnWidth(7, 150); sh.setColumnWidth(8, 220);
}

function setupSubscriptions_(ss) {
  const sh = getOrCreate_(ss, SHEETS.SUBS);
  if (sh.getLastRow() > 0) return;
  sh.getRange(1, 1, 1, 8).setValues([['Name', 'Amount', 'Billing cycle', 'Next due date', 'Category', 'Active', 'Auto-log when due', 'Notes']]);
  const t = todayParts_();
  const examples = [
    ['Rent (example)', 1200, 'Monthly', makeDate_(t.y, t.m, 1), 'Housing', true, false, 'Example — edit or delete'],
    ['Phone plan (example)', 45, 'Monthly', addDays_(today_(), 2), 'Utilities', true, true, 'Example — edit or delete'],
    ['Streaming service (example)', 15.49, 'Monthly', addDays_(today_(), 9), 'Subscriptions', true, true, 'Example — edit or delete']
  ];
  examples[0][3] = addCycle_(examples[0][3], 'Monthly'); // next 1st of the month
  sh.getRange(2, 1, examples.length, 8).setValues(examples);
  sh.getRange(2, 2, SUB_ROWS, 1).setNumberFormat('#,##0.00');
  sh.getRange(2, 3, SUB_ROWS, 1).setDataValidation(listRule_(CYCLES));
  sh.getRange(2, 4, SUB_ROWS, 1).setNumberFormat('yyyy-mm-dd');
  sh.getRange(2, 5, SUB_ROWS, 1).setDataValidation(SpreadsheetApp.newDataValidation()
    .requireValueInRange(ss.getSheetByName(SHEETS.BUDGET).getRange(2, 1, BUDGET_ROWS, 1), true).build());
  sh.getRange(2 + examples.length, 6, SUB_ROWS - examples.length, 2).insertCheckboxes();
  sh.getRange(2, 6, examples.length, 2).insertCheckboxes();
  sh.getRange(2, 6, examples.length, 2).setValues(examples.map(e => [e[5], e[6]]));
  styleHeader_(sh, 8);
  sh.setColumnWidth(1, 220); sh.setColumnWidth(4, 120); sh.setColumnWidth(5, 140); sh.setColumnWidth(7, 140); sh.setColumnWidth(8, 260);
}

function setupDetected_(ss) {
  const sh = getOrCreate_(ss, SHEETS.DETECTED);
  if (sh.getLastRow() > 0) { addHeaderIfMissing_(sh, 8, 'Log as expense?'); return; }
  sh.getRange(1, 1, 1, 8).setValues([['Found on', 'From', 'Email subject', 'Amount found', 'Add as subscription?', 'Message ID', 'Status', 'Log as expense?']]);
  sh.getRange(2, 1, sh.getMaxRows() - 1, 1).setNumberFormat('yyyy-mm-dd');
  sh.getRange(2, 4, sh.getMaxRows() - 1, 1).setNumberFormat('#,##0.00');
  styleHeader_(sh, 8);
  sh.hideColumns(6);
  sh.setColumnWidth(2, 220); sh.setColumnWidth(3, 380); sh.setColumnWidth(5, 160); sh.setColumnWidth(8, 140);
}

function setupLog_(ss) {
  const sh = getOrCreate_(ss, SHEETS.LOG);
  if (sh.getLastRow() > 0) return;
  sh.getRange(1, 1, 1, 3).setValues([['Time', 'Level', 'Message']]);
  styleHeader_(sh, 3);
  sh.setColumnWidth(1, 160); sh.setColumnWidth(3, 600);
}

/* =========================================================================================
 * SCHEDULED SUMMARIES
 * ========================================================================================= */

const TRIGGER_FUNCTIONS = ['sendMorning', 'sendMidday', 'sendNight', 'dailyMaintenance'];

function enableDailySummaries() {
  removeTriggers_();
  const st = getSettings_();
  const tz = tz_();
  [['sendMorning', st.morningHour], ['sendMidday', st.middayHour], ['sendNight', st.nightHour]]
    .forEach(([fn, h]) => ScriptApp.newTrigger(fn).timeBased().everyDays(1).atHour(clampHour_(h)).inTimezone(tz).create());
  ScriptApp.newTrigger('dailyMaintenance').timeBased().everyDays(1).atHour(1).inTimezone(tz).create();
  log_('INFO', `Daily summaries on: ${clampHour_(st.morningHour)}:00, ${clampHour_(st.middayHour)}:00, ${clampHour_(st.nightHour)}:00 (${tz})`);
  safeAlert_(`Daily summaries are ON ✅\n\nMorning ≈ ${clampHour_(st.morningHour)}:00, midday ≈ ${clampHour_(st.middayHour)}:00, ` +
    `night ≈ ${clampHour_(st.nightHour)}:00 (${tz}).\nGoogle runs each one at some point within that hour.\n\n` +
    `Channels: ${channelList_(st) || 'none — turn one on in Settings!'}`);
}

function disableDailySummaries() {
  removeTriggers_();
  log_('INFO', 'Daily summaries turned off.');
  safeAlert_('Daily summaries are OFF. Turn them back on anytime from the 💰 Finance menu.');
}

function removeTriggers_() {
  ScriptApp.getProjectTriggers()
    .filter(t => TRIGGER_FUNCTIONS.indexOf(t.getHandlerFunction()) !== -1)
    .forEach(t => ScriptApp.deleteTrigger(t));
}

function sendMorning() { processSubscriptions_(); notify_(buildMorning_(computeStats_())); }
function sendMidday() { notify_(buildMidday_(computeStats_())); }
function sendNight() { notify_(buildNight_(computeStats_())); }

function dailyMaintenance() {
  processSubscriptions_();
  const st = getSettings_();
  if (st.scanGmail && Utilities.formatDate(new Date(), tz_(), 'u') === '1') { // Monday
    try { scanGmailForBills_(true); } catch (e) { log_('ERROR', 'Gmail scan failed: ' + e.message); }
  }
}

function sendTestSummary() {
  const results = notify_(buildMorning_(computeStats_()));
  const lines = results.length
    ? results.map(r => `${r.ok ? '✅' : '❌'} ${r.channel}${r.ok ? '' : ' — ' + r.error}`).join('\n')
    : 'No channels are turned on. Tick Email (or another channel) in the Settings tab.';
  safeAlert_('Test summary sent:\n\n' + lines + '\n\nDetails are in the Log tab.');
}

/* =========================================================================================
 * NUMBERS
 * ========================================================================================= */

function computeStats_() {
  const st = getSettings_();
  const now = today_();
  const todayKey = key_(now);
  const monthKey = todayKey.slice(0, 7);
  const p = todayParts_();
  const dim = daysInMonth_(p.y, p.m);
  const daysLeft = dim - p.d + 1;

  const budgets = readBudget_();
  const tx = readTx_();
  const spentByCat = {};
  let spent = 0, income = 0, spentToday = 0;
  const todayItems = [];

  tx.forEach(t => {
    const k = key_(t.date);
    if (k.slice(0, 7) !== monthKey) return;
    if (t.type === 'Income') { income += t.amount; return; }
    spent += t.amount;
    spentByCat[t.category] = (spentByCat[t.category] || 0) + t.amount;
    if (k === todayKey) { spentToday += t.amount; todayItems.push(t); }
  });

  const budgetTotal = budgets.reduce((a, b) => a + b.limit, 0);
  const categories = budgets.map(b => {
    const s = spentByCat[b.category] || 0;
    return { category: b.category, limit: b.limit, spent: s, pct: b.limit > 0 ? s / b.limit : (s > 0 ? 1 : 0) };
  });
  Object.keys(spentByCat).forEach(c => {          // spending in categories with no budget row
    if (!budgets.some(b => b.category === c)) categories.push({ category: c, limit: 0, spent: spentByCat[c], pct: 1 });
  });

  const subs = readSubs_().filter(s => s.active && s.next);
  const withDays = subs.map(s => Object.assign({}, s, { daysUntil: dayNum_(s.next) - dayNum_(now) }));
  const upcoming = withDays.filter(s => s.daysUntil >= 0 && s.daysUntil <= st.billDays).sort((a, b) => a.daysUntil - b.daysUntil);
  const tomorrow = withDays.filter(s => s.daysUntil === 1);
  const restOfMonth = withDays.filter(s => key_(s.next).slice(0, 7) === monthKey && s.daysUntil >= 0);
  const committed = restOfMonth.reduce((a, s) => a + s.amount, 0);

  const remaining = budgetTotal - spent;
  const safeToday = Math.max(0, remaining - committed + spentToday) / daysLeft; // allowance for today, before today's spending
  const expectedPct = p.d / dim;
  const spentPct = budgetTotal > 0 ? spent / budgetTotal : 0;

  return {
    st, now, p, dim, daysLeft, budgetTotal, spent, income, remaining, committed,
    safeToday, spentToday, todayItems, categories, upcoming, tomorrow, restOfMonth,
    expectedPct, spentPct,
    alerts: categories.filter(c => c.limit > 0 && c.pct >= st.alertPct / 100).sort((a, b) => b.pct - a.pct),
    autoChargedToday: todayItems.filter(t => String(t.source).indexOf('Auto') === 0),
    monthName: Utilities.formatDate(now, tz_(), 'MMMM')
  };
}

/* =========================================================================================
 * MESSAGES
 * ========================================================================================= */

function buildMorning_(s) {
  const f = money_(s.st.currency);
  const L = [];
  L.push(`☀️ Good morning, ${s.st.name}!`);
  L.push(`📅 ${Utilities.formatDate(s.now, tz_(), 'EEEE, MMM d')} — day ${s.p.d} of ${s.dim}`);
  L.push('');
  L.push(`💰 ${s.monthName} budget`);
  if (s.budgetTotal > 0) {
    L.push(`Spent ${f(s.spent)} of ${f(s.budgetTotal)} (${pct_(s.spentPct)})`);
    L.push(`Left ${f(s.remaining)} · ${paceLine_(s)}`);
    if (s.committed > 0) L.push(`Bills still coming this month: ${f(s.committed)}`);
    L.push(`✅ Safe to spend today: ${f(s.safeToday)}`);
  } else {
    L.push('Set monthly limits in the Budget tab to get your daily safe-to-spend number.');
  }
  if (s.autoChargedToday.length) {
    L.push('');
    L.push('🧾 Charged today (logged for you)');
    s.autoChargedToday.forEach(t => L.push(`• ${t.desc.replace('Subscription: ', '')} — ${f(t.amount)}`));
  }
  if (s.upcoming.length) {
    L.push('');
    L.push('🔔 Bills coming up');
    s.upcoming.forEach(b => L.push(`• ${b.name} — ${f(b.amount)} ${whenLabel_(b.daysUntil)}`));
  }
  if (s.alerts.length) {
    L.push('');
    L.push('⚠️ Watch these categories');
    s.alerts.slice(0, 4).forEach(c => L.push(`• ${c.category}: ${pct_(c.pct)} used (${f(c.spent)} of ${f(c.limit)})`));
  }
  L.push('');
  L.push(`➕ Log an expense: ${appUrl_()}`);
  return { kind: 'morning', subject: `☀️ ${s.monthName} budget: ${f(s.safeToday)} safe to spend today`, text: L.join('\n') };
}

function buildMidday_(s) {
  const f = money_(s.st.currency);
  const left = s.safeToday - s.spentToday;
  const L = [];
  L.push('🕐 Midday check-in');
  L.push(`Spent today so far: ${f(s.spentToday)} (${s.todayItems.length} ${s.todayItems.length === 1 ? 'item' : 'items'})`);
  if (s.budgetTotal > 0) {
    L.push(left >= 0
      ? `You still have ${f(left)} of today's ${f(s.safeToday)} 👍`
      : `You are ${f(-left)} over today's ${f(s.safeToday)} — try a no-spend afternoon.`);
  }
  if (s.tomorrow.length) L.push(`Heads-up: ${s.tomorrow.map(b => `${b.name} (${f(b.amount)})`).join(', ')} due tomorrow.`);
  L.push('');
  L.push('Coffee, lunch, gas, an online order? Log it while you remember:');
  L.push(appUrl_());
  return { kind: 'midday', subject: `🕐 Midday: ${f(s.spentToday)} spent today`, text: L.join('\n') };
}

function buildNight_(s) {
  const f = money_(s.st.currency);
  const L = [];
  L.push(`🌙 Daily recap, ${s.st.name}`);
  if (s.todayItems.length) {
    L.push(`Today you spent ${f(s.spentToday)}:`);
    s.todayItems.slice(0, 12).forEach(t => L.push(`• ${t.category} — ${f(t.amount)}${t.desc ? ' (' + t.desc + ')' : ''}`));
    if (s.todayItems.length > 12) L.push(`…and ${s.todayItems.length - 12} more`);
  } else {
    L.push('No spending logged today. A no-spend day 🎉 — or anything to add?');
  }
  L.push('');
  if (s.budgetTotal > 0) {
    const daysAfterToday = s.daysLeft - 1;
    L.push(`${s.monthName}: ${f(s.spent)} of ${f(s.budgetTotal)} (${pct_(s.spentPct)}) · ${paceLine_(s)}`);
    if (daysAfterToday > 0) {
      const perDay = Math.max(0, s.remaining - s.committed) / daysAfterToday;
      L.push(`For the remaining ${daysAfterToday} days: about ${f(perDay)}/day after upcoming bills.`);
    } else {
      L.push(`Month ends today. Left over: ${f(s.remaining)}${s.remaining > 0 ? ' — consider moving it to savings!' : ''}`);
    }
  }
  if (s.tomorrow.length) {
    L.push('');
    L.push('🔔 Due tomorrow');
    s.tomorrow.forEach(b => L.push(`• ${b.name} — ${f(b.amount)}`));
  }
  L.push('');
  L.push('💡 ' + TIPS[(dayNum_(s.now)) % TIPS.length]);
  L.push('');
  L.push(`Forgot something? ${appUrl_()}`);
  return { kind: 'night', subject: `🌙 Recap: ${f(s.spentToday)} today · ${f(Math.max(0, s.remaining))} left this month`, text: L.join('\n') };
}

function paceLine_(s) {
  if (s.budgetTotal <= 0) return '';
  if (s.spentPct > 1) return '🚨 over budget';
  if (s.spentPct > s.expectedPct + 0.05) return `⚠️ ahead of pace (${pct_(s.expectedPct)} of the month has passed)`;
  return '👍 on track';
}

function whenLabel_(d) {
  if (d === 0) return 'today';
  if (d === 1) return 'tomorrow';
  return `in ${d} days`;
}

/* =========================================================================================
 * NOTIFICATIONS
 * ========================================================================================= */

function notify_(msg) {
  const st = getSettings_();
  const results = [];
  const attempt = (channel, fn) => {
    try { fn(); results.push({ channel, ok: true }); log_('INFO', `${channel}: sent "${msg.subject}"`); }
    catch (e) { results.push({ channel, ok: false, error: e.message }); log_('ERROR', `${channel}: ${e.message}`); }
  };
  if (st.sendEmail) attempt('Email', () => sendEmail_(st, msg));
  if (st.sendWhatsApp) attempt('WhatsApp', () => sendWhatsApp_(st, msg.text));
  if (st.sendTelegram) attempt('Telegram', () => sendTelegram_(st, msg.text));
  if (st.sendWebhook) attempt('Webhook', () => sendWebhook_(st, msg));
  return results;
}

/** Posts the summary as JSON — for n8n / Make / Zapier (e.g. to forward to WhatsApp). */
function sendWebhook_(st, msg) {
  if (!st.webhookUrl) throw new Error('Add a Webhook URL in Settings.');
  const res = UrlFetchApp.fetch(st.webhookUrl, {
    method: 'post', contentType: 'application/json', muteHttpExceptions: true,
    payload: JSON.stringify({
      app: APP_NAME, kind: msg.kind || 'message', subject: msg.subject, text: msg.text,
      to: { email: st.email, phone: st.waPhone }, sentAt: new Date().toISOString()
    })
  });
  const code = res.getResponseCode();
  if (code < 200 || code >= 300) throw new Error(`Webhook replied ${code}: ${res.getContentText().slice(0, 200)}`);
}

function sendEmail_(st, msg) {
  if (!st.email) throw new Error('No email set in Settings.');
  MailApp.sendEmail({ to: st.email, subject: msg.subject, body: msg.text, htmlBody: emailHtml_(msg), name: APP_NAME });
}

function sendWhatsApp_(st, text) {
  if (!st.waPhone || !st.waKey) throw new Error('Add your WhatsApp phone and CallMeBot API key in Settings.');
  const url = 'https://api.callmebot.com/whatsapp.php?phone=' + encodeURIComponent(st.waPhone) +
    '&text=' + encodeURIComponent(text) + '&apikey=' + encodeURIComponent(st.waKey);
  const res = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  if (res.getResponseCode() !== 200) throw new Error(`CallMeBot replied ${res.getResponseCode()}: ${res.getContentText().slice(0, 200)}`);
}

function sendTelegram_(st, text) {
  if (!st.tgToken || !st.tgChatId) throw new Error('Add your Telegram bot token and chat ID in Settings.');
  const res = UrlFetchApp.fetch(`https://api.telegram.org/bot${st.tgToken}/sendMessage`, {
    method: 'post', contentType: 'application/json', muteHttpExceptions: true,
    payload: JSON.stringify({ chat_id: st.tgChatId, text, disable_web_page_preview: true })
  });
  const body = JSON.parse(res.getContentText() || '{}');
  if (!body.ok) throw new Error('Telegram: ' + (body.description || res.getResponseCode()));
}

function findTelegramChatId() {
  const st = getSettings_();
  if (!st.tgToken) return safeAlert_('First paste your bot token (from @BotFather) into Settings → Telegram bot token.');
  const res = UrlFetchApp.fetch(`https://api.telegram.org/bot${st.tgToken}/getUpdates`, { muteHttpExceptions: true });
  const body = JSON.parse(res.getContentText() || '{}');
  if (!body.ok) return safeAlert_('Telegram said: ' + (body.description || 'error') + '\nCheck the bot token.');
  const msgs = (body.result || []).map(u => u.message || u.channel_post).filter(Boolean);
  if (!msgs.length) return safeAlert_('No messages found. Open Telegram, send "hi" to your bot, then run this again.');
  const chatId = String(msgs[msgs.length - 1].chat.id);
  setSetting_('tgChatId', chatId);
  setSetting_('sendTelegram', true);
  safeAlert_('Found it ✅ Chat ID ' + chatId + ' was saved and Telegram is turned on.\nTry 💰 Finance → Send me a test summary now.');
}

function emailHtml_(msg) {
  const url = appUrl_();
  const lines = msg.text.split('\n').filter(l => l.indexOf(url) === -1 && !/^(➕ Log an expense:|Forgot something\?|Coffee, lunch)/.test(l));
  const html = lines.map((l, i) => {
    const e = escapeHtml_(l);
    if (i === 0) return `<h2 style="margin:0 0 4px;font-size:20px;color:#14422c">${e}</h2>`;
    if (!l.trim()) return '<div style="height:10px"></div>';
    if (/^(💰|🔔|⚠️|🧾|✅|🌙|💡)/.test(l)) return `<p style="margin:6px 0;font-weight:600">${e}</p>`;
    return `<p style="margin:3px 0">${e}</p>`;
  }).join('');
  return `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.45;color:#1f2a24;max-width:520px;` +
    `margin:auto;padding:22px;border:1px solid #e3e8e5;border-radius:14px;background:#ffffff">${html}` +
    `<p style="margin:22px 0 6px"><a href="${url}" style="background:#1f6f4a;color:#ffffff;text-decoration:none;` +
    `padding:11px 18px;border-radius:999px;font-weight:600;display:inline-block">➕ Log an expense</a></p>` +
    `<p style="font-size:12px;color:#8a958f;margin-top:16px">${APP_NAME} · runs in your own Google account · ` +
    `change times or channels in the Settings tab</p></div>`;
}

/* =========================================================================================
 * SUBSCRIPTIONS
 * ========================================================================================= */

function processSubscriptionsNow() {
  const n = processSubscriptions_();
  safeAlert_(n ? `${n} due subscription charge(s) processed. Check Transactions.` : 'Nothing due right now. All subscriptions are up to date.');
}

/** Logs any subscription whose due date is today or earlier, then moves its date forward. */
function processSubscriptions_() {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const sh = sheet_(SHEETS.SUBS);
    const n = sh.getLastRow() - 1;
    if (n < 1) return 0;
    const rows = sh.getRange(2, 1, n, 8).getValues();
    const todayKey = key_(today_());
    let count = 0;
    rows.forEach((r, i) => {
      const [name, amount, cycle, next, category, active, autoLog] = r;
      if (!name || !active || !(next instanceof Date)) return;
      let due = next, guard = 0, changed = false;
      while (key_(due) <= todayKey && guard++ < 60) {
        if (autoLog) {
          appendTx_({ date: due, type: 'Expense', category: category || 'Subscriptions',
            desc: 'Subscription: ' + name, amount: Number(amount) || 0, method: '', source: 'Auto (subscription)' });
          count++;
        }
        due = addCycle_(due, cycle || 'Monthly');
        changed = true;
      }
      if (changed) sh.getRange(i + 2, 4).setValue(due);
    });
    if (count) log_('INFO', `Auto-logged ${count} subscription charge(s).`);
    return count;
  } finally {
    lock.releaseLock();
  }
}

/* =========================================================================================
 * GMAIL BILL SCAN
 * ========================================================================================= */

function scanGmailForBills() {
  const found = scanGmailForBills_(false);
  safeAlert_(found
    ? `Found ${found} new receipt/renewal email(s). Open the "Detected Bills" tab and tick "Add as subscription?" ` +
      `for recurring ones or "Log as expense?" for one-off purchases, then run 💰 Finance → Add checked emails.`
    : 'No new receipts or renewal emails found in the last 60 days.');
}

function scanGmailForBills_(silent) {
  const st = getSettings_();
  const sh = sheet_(SHEETS.DETECTED);
  const seen = {};
  if (sh.getLastRow() > 1) sh.getRange(2, 6, sh.getLastRow() - 1, 1).getValues().forEach(r => { seen[r[0]] = true; });

  const query = 'newer_than:60d -in:spam -in:trash subject:(receipt OR invoice OR renewal OR renew OR subscription OR ' +
    '"payment received" OR "payment confirmation" OR autopay OR "auto-pay" OR "your bill" OR "billing statement" OR membership OR ' +
    '"order confirmation" OR "your order" OR purchase OR recibo OR factura OR "comprobante")';
  const threads = GmailApp.search(query, 0, 150);
  const rows = [];
  threads.forEach(t => {
    const msgs = t.getMessages();
    const m = msgs[msgs.length - 1];
    if (seen[m.getId()]) return;
    const amount = findAmount_(m.getPlainBody().slice(0, 6000), st.currency);
    rows.push([m.getDate(), cleanSender_(m.getFrom()), m.getSubject().slice(0, 200), amount === null ? '' : amount, false, m.getId(), '', false]);
  });
  if (rows.length) {
    const start = sh.getLastRow() + 1;
    sh.getRange(start, 1, rows.length, 8).setValues(rows);
    sh.getRange(start, 5, rows.length, 1).insertCheckboxes();
    sh.getRange(start, 8, rows.length, 1).insertCheckboxes();
    sh.getRange(2, 1, sh.getLastRow() - 1, 8).sort({ column: 1, ascending: false });
  }
  log_('INFO', `Gmail scan: ${rows.length} new item(s).`);
  if (silent && rows.length && st.sendEmail) {
    MailApp.sendEmail(st.email, `🔎 ${rows.length} possible bill(s) found in your inbox`,
      `Review them in the "Detected Bills" tab of your ${APP_NAME} sheet:\n${SpreadsheetApp.getActiveSpreadsheet().getUrl()}`);
  }
  return rows.length;
}

function importCheckedBills() {
  const sh = sheet_(SHEETS.DETECTED);
  const n = sh.getLastRow() - 1;
  if (n < 1) return safeAlert_('Nothing to import yet. Run "Scan Gmail for bills & subscriptions" first.');
  const rows = sh.getRange(2, 1, n, 8).getValues();
  const categories = readBudget_().map(b => b.category);
  let subsAdded = 0, expensesAdded = 0, skipped = 0;
  rows.forEach((r, i) => {
    const [date, from, subject, amount, asSub, msgId, status, asExpense] = r;
    if (status || (asSub !== true && asExpense !== true)) return;
    const done = [];
    if (asSub === true) {
      let next = date instanceof Date ? date : today_();
      let guard = 0;
      while (key_(next) <= key_(today_()) && guard++ < 24) next = addCycle_(next, 'Monthly');
      appendSub_({ name: from || subject, amount: Number(amount) || 0, cycle: 'Monthly', next, category: 'Subscriptions',
        notes: 'From Gmail: ' + subject });
      done.push('subscription');
      subsAdded++;
    }
    if (asExpense === true) {
      if (Number(amount) > 0) {
        const p = date instanceof Date ? parts_(date) : todayParts_();
        appendTx_({ date: makeDate_(p.y, p.m, p.d), type: 'Expense',
          category: guessCategory_(from + ' ' + subject, categories) || 'Other',
          desc: String(from || subject).slice(0, 80), amount: Number(amount), method: '', source: 'Gmail receipt',
          receipt: msgId ? 'https://mail.google.com/mail/u/0/#all/' + msgId : '' });
        done.push('expense');
        expensesAdded++;
      } else {
        skipped++;
      }
    }
    if (done.length) sh.getRange(i + 2, 7).setValue('✓ Added as ' + done.join(' + ') + ' ' + key_(today_()));
  });
  safeAlert_(subsAdded || expensesAdded
    ? `Added ${subsAdded} subscription(s) and ${expensesAdded} expense(s).` +
      (skipped ? `\n${skipped} expense row(s) skipped: type the amount in "Amount found" first.` : '') +
      '\nCheck categories and dates in Transactions / Subscriptions.'
    : (skipped ? 'Type the amount in "Amount found" for the rows you ticked, then run this again.'
      : 'Tick "Add as subscription?" or "Log as expense?" on the rows you want, then run this again.'));
}

function findAmount_(text, currency) {
  const sym = escapeRegex_(String(currency || '$').trim());
  const num = '(\\d{1,3}(?:[.,\\s]\\d{3})*(?:[.,]\\d{2})?|\\d+(?:[.,]\\d{2})?)';
  const patterns = [
    new RegExp('(?:total|amount (?:due|charged|paid)|charged|you paid)[^\\n]{0,40}?' + sym + '\\s?' + num, 'i'),
    new RegExp(sym + '\\s?' + num),
    new RegExp(num + '\\s?' + sym)
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (m) {
      const v = parseLocaleNumber_(m[1]);
      if (v !== null && v > 0 && v < 100000) return v;
    }
  }
  return null;
}

/* =========================================================================================
 * MOBILE WEB APP
 * ========================================================================================= */

function doGet() {
  if (!isOwner_()) {
    return HtmlService.createHtmlOutput('<p style="font-family:Arial;padding:24px">This budget app is private.</p>').setTitle(APP_NAME);
  }
  try { PropertiesService.getScriptProperties().setProperty('APP_URL', ScriptApp.getService().getUrl()); } catch (e) { /* ignore */ }
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle(APP_NAME)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, maximum-scale=1');
}

/* Public functions for the Google-hosted app (google.script.run). Each checks the owner, then
 * calls the shared internal version that the GitHub app reaches through doPost + token. */
function getAppData() { assertOwner_(); return appData_(); }
function addTransaction(input) { assertOwner_(); return addTransaction_(input); }
function addSubscription(input) { assertOwner_(); return addSubscription_(input); }
function scanReceipt(dataUrl, fileName) { assertOwner_(); return scanReceipt_(dataUrl, fileName); }

function appData_() {
  const s = computeStats_();
  const tx = readTx_().slice(-25).reverse().map(t => ({
    date: key_(t.date), type: t.type, category: t.category, desc: t.desc, amount: t.amount, method: t.method
  }));
  const subs = readSubs_().filter(x => x.active && x.next)
    .map(x => ({ name: x.name, amount: x.amount, cycle: x.cycle, next: key_(x.next), category: x.category, daysUntil: dayNum_(x.next) - dayNum_(s.now) }))
    .sort((a, b) => a.daysUntil - b.daysUntil);
  const monthlySubTotal = readSubs_().filter(x => x.active)
    .reduce((a, x) => a + x.amount * ({ Weekly: 52 / 12, Monthly: 1, Quarterly: 1 / 3, Yearly: 1 / 12 }[x.cycle] || 1), 0);
  return {
    name: s.st.name, currency: s.st.currency, today: key_(s.now), monthName: s.monthName,
    day: s.p.d, dim: s.dim, budgetTotal: s.budgetTotal, spent: s.spent, income: s.income,
    remaining: s.remaining, committed: s.committed, safeToday: s.safeToday, spentToday: s.spentToday,
    expectedPct: s.expectedPct, spentPct: s.spentPct,
    categories: s.categories, budgetCategories: readBudget_().map(b => b.category),
    methods: PAYMENT_METHODS, cycles: CYCLES, recent: tx, subs, monthlySubTotal,
    sheetUrl: SpreadsheetApp.getActiveSpreadsheet().getUrl()
  };
}

function addTransaction_(input) {
  const amount = parseLocaleNumber_(String(input.amount));
  if (amount === null || amount <= 0) throw new Error('Enter an amount greater than zero.');
  const type = input.type === 'Income' ? 'Income' : 'Expense';
  const date = parseDateKey_(input.date) || today_();
  const receipt = /^https:\/\/(drive|docs)\.google\.com\//.test(String(input.receiptUrl || '')) ? input.receiptUrl : '';
  appendTx_({
    date, type, category: String(input.category || (type === 'Income' ? 'Income' : 'Other')).slice(0, 60),
    desc: String(input.desc || '').slice(0, 200), amount, method: String(input.method || '').slice(0, 40),
    source: receipt ? 'Mobile app (scanned receipt)' : 'Mobile app', receipt
  });
  return appData_();
}

/* ---------- Receipt scanning (photo or PDF → text with Google's free OCR) ---------- */

/**
 * Called from the phone app with a base64 data URL of a receipt photo or PDF.
 * Saves the original to Drive, reads the text with Drive OCR, and returns a suggested expense.
 * Requires the advanced "Drive API" service (Apps Script editor → Services ＋ → Drive API).
 */
function scanReceipt_(dataUrl, fileName) {
  if (typeof Drive === 'undefined') {
    throw new Error('Receipt scanning needs the Drive API service: Apps Script editor → Services ＋ → Drive API → Add.');
  }
  const m = String(dataUrl || '').match(/^data:([^;]+);base64,(.+)$/);
  if (!m) throw new Error('Could not read that file. Try a photo (JPG/PNG) or PDF.');
  const mime = m[1];
  if (!/^image\/|^application\/pdf$/.test(mime)) throw new Error('Use a photo or a PDF of the receipt.');
  const stamp = Utilities.formatDate(new Date(), tz_(), 'yyyy-MM-dd HHmmss');
  const blob = Utilities.newBlob(Utilities.base64Decode(m[2]), mime, `Receipt ${stamp}` + (mime === 'application/pdf' ? '.pdf' : '.jpg'));

  const folder = receiptsFolder_();
  const original = folder.createFile(blob);

  // OCR: convert a copy into a Google Doc, read its text, then trash the copy.
  let text = '', docId = null;
  try {
    if (Drive.Files.create) {          // Drive API v3
      docId = Drive.Files.create({ name: 'OCR ' + stamp, mimeType: MimeType.GOOGLE_DOCS, parents: [folder.getId()] },
        blob, { ocrLanguage: 'en', fields: 'id' }).id;
    } else {                            // Drive API v2
      docId = Drive.Files.insert({ title: 'OCR ' + stamp, mimeType: MimeType.GOOGLE_DOCS, parents: [{ id: folder.getId() }] },
        blob, { ocr: true }).id;
    }
    text = DocumentApp.openById(docId).getBody().getText();
  } finally {
    if (docId) try { DriveApp.getFileById(docId).setTrashed(true); } catch (e) { /* ignore */ }
  }

  const parsed = parseReceiptText_(text, getSettings_().currency, readBudget_().map(b => b.category));
  original.setName(`Receipt ${parsed.date || key_(today_())} ${parsed.merchant || ''}`.trim());
  log_('INFO', `Scanned receipt: ${parsed.merchant || '?'} ${parsed.amount === null ? '?' : parsed.amount}`);
  return Object.assign(parsed, { receiptUrl: original.getUrl(), textPreview: text.slice(0, 600) });
}

function receiptsFolder_() {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty('RECEIPTS_FOLDER');
  if (id) { try { const f = DriveApp.getFolderById(id); if (!f.isTrashed()) return f; } catch (e) { /* recreate */ } }
  const folder = DriveApp.createFolder(APP_NAME + ' Receipts');
  props.setProperty('RECEIPTS_FOLDER', folder.getId());
  return folder;
}

/** Pulls total, date, store name and a category guess out of OCR text. */
function parseReceiptText_(text, currency, categories) {
  const lines = String(text || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const moneyRe = /(?:^|[^\d])(\d{1,3}(?:[.,]\d{3})*[.,]\d{2}|\d+[.,]\d{2})(?!\d)/g;
  const amountsIn = l => { const out = []; let x; moneyRe.lastIndex = 0; while ((x = moneyRe.exec(l))) { const v = parseLocaleNumber_(x[1]); if (v !== null) out.push(v); } return out; };

  // 1) "TOTAL" lines (not subtotal), also checking the next line for receipts that print the number below.
  let amount = null;
  for (let i = 0; i < lines.length && amount === null; i++) {
    const l = lines[i];
    if (/\b(grand\s*total|total\s*(due|a pagar|amount)?|amount\s*(due|paid)|importe\s*total|total)\b/i.test(l) &&
        !/sub\s*-?\s*total|subtotal|total\s*(items|savings|discount|tax)|ahorro/i.test(l)) {
      const nums = amountsIn(l).concat(i + 1 < lines.length ? amountsIn(lines[i + 1]) : []);
      if (nums.length) amount = Math.max.apply(null, nums);
    }
  }
  // 2) Fallback: the largest money-looking number on the receipt (under a sanity cap).
  if (amount === null) {
    const all = lines.reduce((a, l) => a.concat(amountsIn(l)), []).filter(v => v > 0 && v < 20000);
    if (all.length) amount = Math.max.apply(null, all);
  }

  // Date
  let date = null;
  const dm = text.match(/\b(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})\b/) || text.match(/\b(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{2,4})\b/);
  if (dm) {
    let y, mo, d;
    if (dm[1].length === 4) { y = +dm[1]; mo = +dm[2]; d = +dm[3]; }
    else {
      y = +dm[3]; if (y < 100) y += 2000;
      // US style month/day unless the first number can only be a day
      if (+dm[1] > 12) { d = +dm[1]; mo = +dm[2]; } else { mo = +dm[1]; d = +dm[2]; }
    }
    if (mo >= 1 && mo <= 12 && d >= 1 && d <= daysInMonth_(y, mo)) {
      const key = `${y}-${pad2_(mo)}-${pad2_(d)}`;
      const age = dayNum_(today_()) - Math.round(Date.UTC(y, mo - 1, d) / 864e5);
      if (age >= 0 && age <= 120) date = key;   // ignore future dates and very old ones
    }
  }

  // Store name: first line that looks like a name, not an address/phone/number
  const merchant = (lines.slice(0, 8).find(l => /[a-z]{3,}/i.test(l) && (l.replace(/[^\d]/g, '').length < 4) &&
    !/receipt|recibo|welcome|bienvenid|thank|gracias|store\s*#|tel|phone|www\.|http/i.test(l)) || '')
    .replace(/[^\w&'\- .]/g, '').trim().slice(0, 40);

  return { amount, date, merchant, category: guessCategory_(text, categories) };
}

/** Very small keyword guesser; only returns categories that exist in the Budget tab. */
function guessCategory_(text, categories) {
  const t = String(text || '').toLowerCase();
  const rules = [
    ['Groceries', /grocer|supermarket|supermercado|market|walmart|kroger|aldi|publix|costco|whole foods|trader joe|safeway|heb\b|food lion|sam'?s club|meijer|lidl/],
    ['Transport', /\bgas\b|fuel|gasolina|shell|exxon|chevron|marathon|valero|speedway|circle k|uber|lyft|parking|toll|transit|metro/],
    ['Dining out', /restaurant|restaurante|cafe|café|coffee|starbucks|pizza|grill|burger|taco|mcdonald|chick-fil|wendy|subway|chipotle|kitchen|bistro|diner|bar\b|bakery|panader/],
    ['Health', /pharmacy|farmacia|cvs|walgreens|clinic|clínica|dental|doctor|hospital|optical/],
    ['Utilities', /electric|power|water|internet|wifi|comcast|xfinity|at&t|verizon|t-mobile|spectrum|utility|luz|agua/],
    ['Entertainment', /cinema|theater|theatre|movie|cine|concert|ticket|game|steam|playstation|xbox/],
    ['Subscriptions', /subscription|membership|suscripci|renewal|monthly plan/],
    ['Housing', /rent|renta|mortgage|hoa\b|apartment/],
    ['Shopping', /target|amazon|best buy|home depot|lowe'?s|ikea|mall|store|tienda|clothing|shoes|dollar general|dollar tree/]
  ];
  for (const [cat, re] of rules) if (re.test(t) && categories.indexOf(cat) !== -1) return cat;
  return null;
}

/* ---------- Incoming messages from n8n / Make / Zapier (off by default) ---------- */

/**
 * POST JSON to the web app URL. Examples:
 *   { "token": "...", "action": "message", "text": "lunch 12.50" }          ← free text, e.g. a WhatsApp message
 *   { "token": "...", "action": "add_expense", "amount": 12.5, "category": "Dining out", "description": "Lunch" }
 *   { "token": "...", "action": "summary", "kind": "morning" }              ← morning | midday | night
 * Returns JSON: { ok, reply } — n8n can send `reply` back to WhatsApp.
 */
function doPost(e) {
  const out = obj => ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
  try {
    const st = getSettings_();
    if (!st.incomingEnabled || !st.webhookToken) return out({ ok: false, error: 'Incoming messages are turned off in Settings.' });
    let body = {};
    try { body = JSON.parse((e && e.postData && e.postData.contents) || '{}'); } catch (err) { body = {}; }
    const params = (e && e.parameter) || {};
    const token = String(body.token || params.token || '');
    if (token !== st.webhookToken) { log_('WARN', 'Incoming request with a wrong token was rejected.'); return out({ ok: false, error: 'Invalid token.' }); }

    const action = String(body.action || params.action || 'message');
    if (action === 'summary') {
      const s = computeStats_();
      const kind = String(body.kind || 'morning');
      const msg = kind === 'night' ? buildNight_(s) : kind === 'midday' ? buildMidday_(s) : buildMorning_(s);
      return out({ ok: true, reply: msg.text, subject: msg.subject });
    }
    if (action === 'add_expense' || action === 'add_income') {
      const r = logFromParts_({
        type: action === 'add_income' ? 'Income' : 'Expense', amount: body.amount, category: body.category,
        desc: body.description || body.desc || '', date: body.date, source: String(body.source || 'Webhook').slice(0, 40)
      });
      return out(r);
    }
    if (action === 'message') return out(handleTextCommand_(String(body.text || params.text || '')));

    // Actions used by the phone app hosted on GitHub Pages
    if (action === 'app_data') return out({ ok: true, data: appData_() });
    if (action === 'add_transaction') return out({ ok: true, data: addTransaction_(body.input || {}) });
    if (action === 'add_subscription') return out({ ok: true, data: addSubscription_(body.input || {}) });
    if (action === 'scan_receipt') return out({ ok: true, data: scanReceipt_(body.dataUrl, body.fileName) });

    return out({ ok: false, error: 'Unknown action.' });
  } catch (err) {
    log_('ERROR', 'doPost: ' + err.message);
    return out({ ok: false, error: err.message });
  }
}

/** Understands short chat messages like "12.50 lunch", "gas 40", "income 500 salary", "summary", "today", "bills". */
function handleTextCommand_(text) {
  const t = text.trim();
  const low = t.toLowerCase();
  const s = () => computeStats_();
  if (!t || /^(help|ayuda|\?)$/.test(low)) {
    return { ok: true, reply: 'Send an expense like "12.50 lunch" or "gas 40". Income: "income 500 salary".\n' +
      'Other commands: summary · today · bills' };
  }
  if (/^(summary|resumen|budget|presupuesto|morning)$/.test(low)) return { ok: true, reply: buildMorning_(s()).text };
  if (/^(today|hoy|recap|night)$/.test(low)) return { ok: true, reply: buildNight_(s()).text };
  if (/^(bills|cuentas|pagos|subscriptions|suscripciones)$/.test(low)) {
    const st = getSettings_(), f = money_(st.currency), now = today_();
    const list = readSubs_().filter(x => x.active && x.next)
      .map(x => Object.assign(x, { d: dayNum_(x.next) - dayNum_(now) })).filter(x => x.d >= 0 && x.d <= 31)
      .sort((a, b) => a.d - b.d).slice(0, 10);
    return { ok: true, reply: list.length ? '🔔 Next 30 days\n' + list.map(x => `• ${x.name} — ${f(x.amount)} ${whenLabel_(x.d)}`).join('\n')
      : 'No bills due in the next 30 days.' };
  }
  const num = t.match(/(\d+(?:[.,]\d{1,2})?)/);
  if (!num) return { ok: false, reply: 'I could not find an amount. Try "12.50 lunch" or send "help".' };
  const isIncome = /^(\+|income|ingreso|salary|salario|sueldo)/i.test(t);
  const words = t.replace(num[0], ' ').replace(/^(\+|income|ingreso|spent|gast[eéo]|expense|gasto)\s*/i, ' ').replace(/\s+/g, ' ').trim();
  return logFromParts_({ type: isIncome ? 'Income' : 'Expense', amount: num[1], desc: words, category: '', source: 'Chat' });
}

function logFromParts_(p) {
  const amount = parseLocaleNumber_(String(p.amount));
  if (amount === null || amount <= 0) return { ok: false, reply: 'The amount must be greater than zero.' };
  const categories = readBudget_().map(b => b.category);
  let category = String(p.category || '').trim();
  if (p.type === 'Expense') {
    const exact = categories.find(c => c.toLowerCase() === category.toLowerCase())
      || categories.find(c => String(p.desc || '').toLowerCase().indexOf(c.toLowerCase()) !== -1);
    category = exact || guessCategory_(p.desc + ' ' + category, categories) || (categories.indexOf('Other') !== -1 ? 'Other' : categories[0] || 'Other');
  } else {
    category = category || 'Income';
  }
  appendTx_({ date: parseDateKey_(p.date) || today_(), type: p.type, category, desc: String(p.desc || '').slice(0, 200),
    amount, method: '', source: p.source || 'Webhook' });
  const s = computeStats_(), f = money_(s.st.currency);
  const reply = p.type === 'Income'
    ? `✅ Income logged: ${f(amount)} (${category}).`
    : `✅ Logged ${f(amount)} · ${category}${p.desc ? ' · ' + p.desc : ''}\n` +
      (s.budgetTotal > 0 ? `Left today: ${f(Math.max(0, s.safeToday - s.spentToday))} · Left this month: ${f(s.remaining)}` : '');
  return { ok: true, reply, category, amount };
}

function addSubscription_(input) {
  const amount = parseLocaleNumber_(String(input.amount));
  if (!input.name || amount === null || amount <= 0) throw new Error('Enter a name and an amount.');
  const next = parseDateKey_(input.next);
  if (!next) throw new Error('Pick the next due date.');
  appendSub_({ name: String(input.name).slice(0, 80), amount, cycle: CYCLES.indexOf(input.cycle) !== -1 ? input.cycle : 'Monthly',
    next, category: input.category || 'Subscriptions', notes: 'Added from mobile app' });
  return appData_();
}

/**
 * Builds a one-tap setup link for the phone app hosted on GitHub Pages and emails it to you.
 * The link carries this script's address and your secret token after "#", so it is never sent
 * to GitHub's servers; the app stores it only on your phone.
 */
function connectGithubApp() {
  const st = getSettings_();
  if (!st.githubAppUrl) {
    return safeAlert_('First put your GitHub Pages address in Settings → "Phone app address (GitHub Pages)".\n' +
      'Example: https://yourname.github.io/pocket-budget/');
  }
  const scriptUrl = scriptUrl_();
  if (!scriptUrl) {
    return safeAlert_('Deploy the backend first. In the Apps Script editor: Deploy → New deployment → type "Web app" → ' +
      'Execute as: Me → Who has access: Anyone → Deploy. Then run this again.');
  }
  if (!st.webhookToken) setSetting_('webhookToken', Utilities.getUuid().replace(/-/g, ''));
  if (!st.incomingEnabled) setSetting_('incomingEnabled', true);
  const token = getSettings_().webhookToken;
  const base = st.githubAppUrl.split('#')[0];
  const link = base + '#connect=' + Utilities.base64EncodeWebSafe(JSON.stringify({ u: scriptUrl, t: token }));

  if (st.email) {
    MailApp.sendEmail({
      to: st.email, name: APP_NAME, subject: '📱 Connect your Pocket Budget phone app',
      body: `Open this link on your phone, then use "Add to Home screen":\n\n${link}\n\n` +
        'Keep this email private: the link contains your secret key. To lock out a device later, change ' +
        '"Secret API token" in Settings and run Connect my phone app again.',
      htmlBody: `<div style="font-family:Arial;font-size:15px;line-height:1.5"><p>Open this on your phone, then use <b>Add to Home screen</b>:</p>` +
        `<p><a href="${link}" style="background:#1f6f4a;color:#fff;padding:11px 18px;border-radius:999px;text-decoration:none;font-weight:600">` +
        `📱 Connect my phone app</a></p><p style="color:#6b7280;font-size:13px">Keep this email private: the link contains your secret key. ` +
        `To lock out a device later, change "Secret API token" in Settings and run Connect my phone app again.</p></div>`
    });
  }
  log_('INFO', 'GitHub phone app connect link created.');
  const html = HtmlService.createHtmlOutput(
    `<div style="font-family:Arial;font-size:14px;line-height:1.5">` +
    `<p>${st.email ? `✅ We emailed this link to <b>${escapeHtml_(st.email)}</b>. ` : ''}Open it <b>on your phone</b>, then choose <b>Add to Home screen</b>.</p>` +
    `<p style="word-break:break-all;background:#f4f6f3;padding:8px;border-radius:8px;font-size:12px">${escapeHtml_(link)}</p>` +
    `<p style="color:#b42318">Keep it private: it contains your secret key.</p></div>`).setWidth(520).setHeight(280);
  SpreadsheetApp.getUi().showModalDialog(html, 'Connect your phone app');
}

function showAppLink() {
  const url = scriptUrl_();
  if (!url) {
    return safeAlert_('The mobile app is not deployed yet.\n\nIn the Apps Script editor: Deploy → New deployment → ' +
      'type "Web app" → Execute as: Me → Who has access: Only myself → Deploy. Then run this again.');
  }
  const html = HtmlService.createHtmlOutput(
    `<div style="font-family:Arial;padding:6px"><p>Open this link on your phone and choose <b>Add to Home screen</b>:</p>` +
    `<p><a href="${url}" target="_blank">${url}</a></p></div>`).setWidth(460).setHeight(170);
  SpreadsheetApp.getUi().showModalDialog(html, 'Your mobile app');
}

/* =========================================================================================
 * DATA ACCESS
 * ========================================================================================= */

function getSettings_() {
  const sh = sheet_(SHEETS.SETTINGS);
  const out = {};
  SETTINGS_SPEC.forEach(s => { out[s.key] = s.value; });
  if (sh.getLastRow() > 1) {
    sh.getRange(2, 1, sh.getLastRow() - 1, 3).getValues().forEach(([k, , v]) => { if (k) out[k] = v; });
  }
  ['income', 'morningHour', 'middayHour', 'nightHour', 'billDays', 'alertPct']
    .forEach(k => { const n = Number(out[k]); out[k] = isNaN(n) ? SETTINGS_SPEC.find(s => s.key === k).value : n; });
  ['sendEmail', 'sendWhatsApp', 'sendTelegram', 'scanGmail', 'sendWebhook', 'incomingEnabled'].forEach(k => { out[k] = out[k] === true || String(out[k]).toUpperCase() === 'TRUE'; });
  out.name = String(out.name || 'Friend').trim();
  out.currency = String(out.currency || '$').trim();
  out.email = String(out.email || '').trim();
  out.waPhone = String(out.waPhone || '').replace(/[^\d+]/g, '');
  if (out.waPhone && out.waPhone[0] !== '+') out.waPhone = '+' + out.waPhone;
  out.waKey = String(out.waKey || '').trim();
  out.tgToken = String(out.tgToken || '').trim();
  out.tgChatId = String(out.tgChatId || '').trim();
  out.webhookUrl = String(out.webhookUrl || '').trim();
  out.webhookToken = String(out.webhookToken || '').trim();
  out.githubAppUrl = String(out.githubAppUrl || '').trim();
  if (out.githubAppUrl && !/^https:\/\//i.test(out.githubAppUrl)) out.githubAppUrl = '';
  return out;
}

function setSetting_(key, value) {
  const sh = sheet_(SHEETS.SETTINGS);
  const keys = sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues();
  const i = keys.findIndex(r => r[0] === key);
  if (i !== -1) sh.getRange(i + 2, 3).setValue(value);
}

function readBudget_() {
  const sh = sheet_(SHEETS.BUDGET);
  const n = Math.min(sh.getLastRow() - 1, BUDGET_ROWS);
  if (n < 1) return [];
  return sh.getRange(2, 1, n, 2).getValues()
    .filter(r => String(r[0]).trim())
    .map(r => ({ category: String(r[0]).trim(), limit: Number(r[1]) || 0 }));
}

function readTx_() {
  const sh = sheet_(SHEETS.TX);
  const n = sh.getLastRow() - 1;
  if (n < 1) return [];
  return sh.getRange(2, 1, n, 7).getValues()
    .filter(r => r[0] instanceof Date && r[4] !== '' && !isNaN(Number(r[4])))
    .map(r => ({ date: r[0], type: r[1] === 'Income' ? 'Income' : 'Expense', category: String(r[2] || 'Other'),
      desc: String(r[3] || ''), amount: Number(r[4]), method: String(r[5] || ''), source: String(r[6] || '') }));
}

function readSubs_() {
  const sh = sheet_(SHEETS.SUBS);
  const n = sh.getLastRow() - 1;
  if (n < 1) return [];
  return sh.getRange(2, 1, n, 8).getValues()
    .filter(r => String(r[0]).trim())
    .map(r => ({ name: String(r[0]).trim(), amount: Number(r[1]) || 0, cycle: r[2] || 'Monthly',
      next: r[3] instanceof Date ? r[3] : null, category: String(r[4] || 'Subscriptions'), active: r[5] === true, autoLog: r[6] === true }));
}

function appendTx_(t) {
  const sh = sheet_(SHEETS.TX);
  sh.appendRow([t.date, t.type, t.category, t.desc, t.amount, t.method, t.source, t.receipt || '']);
}

function appendSub_(s) {
  const sh = sheet_(SHEETS.SUBS);
  const names = sh.getLastRow() > 1 ? sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues() : [];
  let row = names.findIndex(r => !String(r[0]).trim());
  row = row === -1 ? sh.getLastRow() + 1 : row + 2;
  sh.getRange(row, 1, 1, 5).setValues([[s.name, s.amount, s.cycle, s.next, s.category]]);
  const boxes = sh.getRange(row, 6, 1, 2);
  if (!boxes.getDataValidation()) boxes.insertCheckboxes();
  boxes.setValues([[true, true]]);
  sh.getRange(row, 8).setValue(s.notes || '');
}

/* =========================================================================================
 * HELPERS
 * ========================================================================================= */

function tz_() { return SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone() || Session.getScriptTimeZone(); }
function today_() { return new Date(); }
function key_(d) { return Utilities.formatDate(d, tz_(), 'yyyy-MM-dd'); }
function parts_(d) { const [y, m, dd] = key_(d).split('-').map(Number); return { y, m, d: dd }; }
function todayParts_() { return parts_(today_()); }
function dayNum_(d) { const p = parts_(d); return Math.round(Date.UTC(p.y, p.m - 1, p.d) / 864e5); }
function daysInMonth_(y, m) { return new Date(Date.UTC(y, m, 0)).getUTCDate(); }

/** A Date at noon on y-m-d in the spreadsheet's time zone (noon avoids day shifts). */
function makeDate_(y, m, d) {
  return Utilities.parseDate(`${y}-${pad2_(m)}-${pad2_(d)} 12:00`, tz_(), 'yyyy-MM-dd HH:mm');
}

function addDays_(date, n) {
  const p = parts_(date);
  const u = new Date(Date.UTC(p.y, p.m - 1, p.d + n));
  return makeDate_(u.getUTCFullYear(), u.getUTCMonth() + 1, u.getUTCDate());
}

function addCycle_(date, cycle) {
  if (cycle === 'Weekly') return addDays_(date, 7);
  const months = { Monthly: 1, Quarterly: 3, Yearly: 12 }[cycle] || 1;
  const p = parts_(date);
  const total = (p.m - 1) + months;
  const y = p.y + Math.floor(total / 12), m = (total % 12) + 1;
  return makeDate_(y, m, Math.min(p.d, daysInMonth_(y, m)));
}

function parseDateKey_(s) {
  const m = String(s || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? makeDate_(Number(m[1]), Number(m[2]), Number(m[3])) : null;
}

function parseLocaleNumber_(s) {
  let t = String(s || '').replace(/[^\d.,-]/g, '').replace(/\s/g, '');
  if (!t) return null;
  const lastDot = t.lastIndexOf('.'), lastComma = t.lastIndexOf(',');
  if (lastComma > lastDot) {                       // 1.234,56 or 12,5
    const decimals = t.length - lastComma - 1;
    t = decimals === 3 && lastDot === -1 ? t.replace(/,/g, '') : t.replace(/\./g, '').replace(',', '.');
  } else {
    t = t.replace(/,/g, '');                       // 1,234.56
  }
  const n = parseFloat(t);
  return isNaN(n) ? null : Math.round(n * 100) / 100;
}

function money_(cur) {
  return n => {
    const neg = n < 0;
    const s = Math.abs(n).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return (neg ? '-' : '') + cur + s;
  };
}

function pct_(x) { return Math.round(x * 100) + '%'; }
function pad2_(n) { return String(n).padStart(2, '0'); }
function clampHour_(h) { return Math.max(0, Math.min(23, Math.floor(Number(h) || 0))); }
function escapeRegex_(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
function escapeHtml_(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function cleanSender_(from) { const m = String(from).match(/^"?([^"<]+?)"?\s*</); return (m ? m[1] : String(from)).trim().slice(0, 80); }
function channelList_(st) { return [st.sendEmail && 'Email', st.sendWhatsApp && 'WhatsApp', st.sendTelegram && 'Telegram', st.sendWebhook && 'Webhook'].filter(Boolean).join(', '); }

/** Link used in emails: the GitHub-hosted app if set, else the Google-hosted app, else the sheet. */
function appUrl_() {
  const gh = getSettings_().githubAppUrl;
  if (gh) return gh;
  return scriptUrl_() || SpreadsheetApp.getActiveSpreadsheet().getUrl();
}

/** The deployed Apps Script web app address (/exec), or null if not deployed yet. */
function scriptUrl_() {
  let live = null;
  try { live = ScriptApp.getService().getUrl(); } catch (e) { /* not deployed */ }
  return live || PropertiesService.getScriptProperties().getProperty('APP_URL') || null;
}

function sheet_(name) {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
  if (!sh) throw new Error(`Missing "${name}" tab. Run 💰 Finance → 1. Set up this spreadsheet.`);
  return sh;
}

/**
 * With the web app deployed as "Only myself", Google already blocks everyone else.
 * When incoming messages are on (deployed as "Anyone" so n8n can POST), this keeps the
 * app screen and its data private to the owner.
 */
function isOwner_() {
  if (!getSettings_().incomingEnabled) return true;
  const active = Session.getActiveUser().getEmail();
  return !!active && active === Session.getEffectiveUser().getEmail();
}

function assertOwner_() { if (!isOwner_()) throw new Error('This budget app is private.'); }

function addHeaderIfMissing_(sh, col, title) {
  const cell = sh.getRange(1, col);
  if (String(cell.getValue()).trim()) return;
  cell.setValue(title).setFontWeight('bold').setBackground('#1f6f4a').setFontColor('#ffffff');
}

function getOrCreate_(ss, name) { return ss.getSheetByName(name) || ss.insertSheet(name); }

function styleHeader_(sh, cols) {
  sh.getRange(1, 1, 1, cols).setFontWeight('bold').setBackground('#1f6f4a').setFontColor('#ffffff');
  sh.setFrozenRows(1);
}

function listRule_(values, allowOther) {
  return SpreadsheetApp.newDataValidation().requireValueInList(values, true).setAllowInvalid(!!allowOther).build();
}

function log_(level, message) {
  try {
    const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEETS.LOG);
    if (sh) {
      sh.insertRowAfter(1);
      sh.getRange(2, 1, 1, 3).setValues([[new Date(), level, String(message).slice(0, 500)]]);
      if (sh.getLastRow() > 501) sh.deleteRows(502, sh.getLastRow() - 501);
    }
  } catch (e) { /* logging must never break the app */ }
  console.log(level, message);
}

function safeAlert_(msg) {
  try { SpreadsheetApp.getUi().alert(msg); }
  catch (e) { console.log(msg); }   // no UI when running from a trigger or the web app
}
