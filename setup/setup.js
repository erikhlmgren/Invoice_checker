const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = path.join(__dirname, '..');
const TASK_NAME = 'InvoiceChecker';

function run(cmd, opts = {}) {
  try {
    return execSync(cmd, { stdio: 'pipe', ...opts }).toString().trim();
  } catch (err) {
    return null;
  }
}

function log(msg) {
  console.log(`[setup] ${msg}`);
}

// Create required directories
function createDirectories() {
  const dirs = ['data/downloads', 'data/price-lists', 'output', 'logs'];
  for (const dir of dirs) {
    const full = path.join(PROJECT_ROOT, dir);
    if (!fs.existsSync(full)) {
      fs.mkdirSync(full, { recursive: true });
      log(`Created: ${dir}/`);
    } else {
      log(`Already exists: ${dir}/`);
    }
  }
}

// Register Windows Task Scheduler task
function registerTask() {
  const nodePath = process.execPath;
  const scriptPath = path.join(PROJECT_ROOT, 'src', 'main.js');
  const workingDir = PROJECT_ROOT;

  // Read schedule from config if available
  let schedule = { dayOfMonth: [5], hour: 8, minute: 0 };
  const configPath = path.join(PROJECT_ROOT, 'config.json');
  if (fs.existsSync(configPath)) {
    try {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      if (config.schedule) schedule = config.schedule;
    } catch {}
  }

  // Build Task Scheduler XML
  const days = schedule.dayOfMonth.join(',');
  const hour = String(schedule.hour).padStart(2, '0');
  const minute = String(schedule.minute).padStart(2, '0');

  const xml = generateTaskXml(nodePath, scriptPath, workingDir, hour, minute, schedule.dayOfMonth);
  const xmlPath = path.join(PROJECT_ROOT, 'setup', 'task-generated.xml');
  fs.writeFileSync(xmlPath, xml, 'utf8');

  // Delete existing task if present
  run(`schtasks /delete /tn "${TASK_NAME}" /f`);

  // Create new task
  const result = run(`schtasks /create /xml "${xmlPath}" /tn "${TASK_NAME}"`);
  if (result !== null) {
    log(`Task Scheduler: "${TASK_NAME}" registered (runs at ${hour}:${minute} on days ${days} of each month)`);
  } else {
    log(`WARNING: Could not register Task Scheduler task. You may need to run install.bat as Administrator.`);
  }

  // Clean up temp XML
  fs.unlinkSync(xmlPath);
}

function generateTaskXml(nodePath, scriptPath, workingDir, hour, minute, days) {
  // Generate one trigger per day of month
  const triggers = days.map((day) => `
    <CalendarTrigger>
      <StartBoundary>2026-01-${String(day).padStart(2, '0')}T${hour}:${minute}:00</StartBoundary>
      <Enabled>true</Enabled>
      <ScheduleByMonth>
        <DaysOfMonth>
          <Day>${day}</Day>
        </DaysOfMonth>
        <Months>
          <January/><February/><March/><April/><May/><June/>
          <July/><August/><September/><October/><November/><December/>
        </Months>
      </ScheduleByMonth>
    </CalendarTrigger>`).join('\n');

  return `<?xml version="1.0" encoding="UTF-16"?>
<Task version="1.2" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
  <RegistrationInfo>
    <Description>Automated invoice checker for Synologen optical invoices</Description>
  </RegistrationInfo>
  <Triggers>
    ${triggers}
  </Triggers>
  <Principals>
    <Principal id="Author">
      <LogonType>InteractiveToken</LogonType>
      <RunLevel>LeastPrivilege</RunLevel>
    </Principal>
  </Principals>
  <Settings>
    <MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>
    <DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries>
    <StopIfGoingOnBatteries>false</StopIfGoingOnBatteries>
    <AllowHardTerminate>true</AllowHardTerminate>
    <StartWhenAvailable>true</StartWhenAvailable>
    <RunOnlyIfNetworkAvailable>true</RunOnlyIfNetworkAvailable>
    <Hidden>true</Hidden>
    <WakeToRun>true</WakeToRun>
    <ExecutionTimeLimit>PT1H</ExecutionTimeLimit>
    <Enabled>true</Enabled>
  </Settings>
  <Actions Context="Author">
    <Exec>
      <Command>${nodePath}</Command>
      <Arguments>"${scriptPath}" --send-email</Arguments>
      <WorkingDirectory>${workingDir}</WorkingDirectory>
    </Exec>
  </Actions>
</Task>`;
}

// Main
log('Starting invoice-checker setup...');
createDirectories();
registerTask();
log('');
log('Setup complete.');
log(`Next steps:`);
log(`  1. Copy config.example.json to config.json`);
log(`  2. Fill in your Synologen credentials and email settings`);
log(`  3. Copy your PDF price lists to data/price-lists/`);
log(`  4. Test a manual run: node src/main.js`);
