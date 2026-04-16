import { applyEvent } from './emotion.js';

let batteryInterval = null;
let lastBatteryState = null;
let batteryObj = null;

function dispatchHUD(level, charging) {
  if (typeof document !== 'undefined') {
    document.dispatchEvent(new CustomEvent('amic:battery-change', {
      detail: { level, charging }
    }));
  }
}

async function checkBattery(getRobot, setRobot) {
  if (!navigator.getBattery) return;

  try {
    if (!batteryObj) {
      batteryObj = await navigator.getBattery();
      // React immediately to plug/unplug events
      batteryObj.addEventListener('chargingchange', () => checkBattery(getRobot, setRobot));
      batteryObj.addEventListener('levelchange',    () => checkBattery(getRobot, setRobot));
    }

    const level    = Math.round(batteryObj.level * 100);
    const charging = batteryObj.charging;

    dispatchHUD(level, charging);

    const robot = getRobot();

    if (charging) {
      const wasCharging = lastBatteryState === 'charging';
      lastBatteryState = 'charging';
      if (!wasCharging || (robot.stamina ?? 100) < 100) {
        // Just plugged in, or stamina still recovering → full restore + mood lift
        setRobot(applyEvent(robot, 'battery_charging'));
      } else {
        // Already charging and full stamina → small passive mood tick
        setRobot(applyEvent(robot, 'charging_tick'));
      }
      return;
    }

    // Not charging — react once per level threshold crossing
    if (level < 10 && lastBatteryState !== 'critical') {
      lastBatteryState = 'critical';
      setRobot(applyEvent(robot, 'battery_critical'));
    } else if (level < 20 && level >= 10 && lastBatteryState !== 'low') {
      lastBatteryState = 'low';
      setRobot(applyEvent(robot, 'battery_low'));
    } else if (level >= 20 && lastBatteryState !== 'ok') {
      lastBatteryState = 'ok';
      // Battery recovered (e.g. was low, now charged above 20% without being plugged in)
      // Restore stamina proportionally so the robot feels the improvement
      if ((robot.stamina ?? 100) < 60) {
        setRobot(applyEvent(robot, 'battery_charging'));
      }
    }
  } catch (e) {
    console.warn('Battery check failed:', e);
  }
}

export function startBatteryMonitoring(getRobot, setRobot) {
  if (batteryInterval) clearInterval(batteryInterval);
  checkBattery(getRobot, setRobot);
  // Check every 30 s so charging recovery updates the HUD quickly
  batteryInterval = setInterval(() => checkBattery(getRobot, setRobot), 30 * 1000);
}

export function stopBatteryMonitoring() {
  if (batteryInterval) clearInterval(batteryInterval);
}
