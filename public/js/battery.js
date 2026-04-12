import { applyEvent } from './emotion.js';

let batteryInterval = null;
let lastBatteryState = null;

async function checkBattery(getRobot, setRobot) {
  if (!navigator.getBattery) return;

  try {
    const battery = await navigator.getBattery();
    const level = battery.level * 100;
    const charging = battery.charging;

    if (charging) {
      lastBatteryState = 'charging';
      return;
    }

    const robot = getRobot();

    if (level < 10 && lastBatteryState !== 'critical') {
      lastBatteryState = 'critical';
      setRobot(applyEvent(robot, 'battery_critical'));
    } else if (level < 20 && level >= 10 && lastBatteryState !== 'low') {
      lastBatteryState = 'low';
      setRobot(applyEvent(robot, 'battery_low'));
    } else if (level >= 20) {
      lastBatteryState = 'ok';
    }
  } catch (e) {
    console.warn('Battery check failed:', e);
  }
}

export function startBatteryMonitoring(getRobot, setRobot) {
  if (batteryInterval) clearInterval(batteryInterval);
  checkBattery(getRobot, setRobot);
  batteryInterval = setInterval(() => checkBattery(getRobot, setRobot), 60 * 1000);
}

export function stopBatteryMonitoring() {
  if (batteryInterval) clearInterval(batteryInterval);
}
