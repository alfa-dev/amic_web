import { applyEvent } from './emotion.js';

let weatherInterval = null;

export async function getCoords() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('Geolocalização não suportada'));
    navigator.geolocation.getCurrentPosition(
      pos => resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
      err => reject(err),
      { timeout: 10000 }
    );
  });
}

export async function fetchWeather(lat, lon) {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,weather_code&timezone=auto`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('Erro ao buscar clima');
  return res.json();
}

function weatherCodeToCondition(code) {
  if (code === 0) return 'sunny';
  if (code <= 2) return 'partly_cloudy';
  if (code <= 9) return 'cloudy';
  if (code >= 61 && code <= 99) return 'rainy';
  return 'cloudy';
}

export function applyWeatherEffects(robot, weatherData) {
  const current = weatherData.current;
  const temp = current.temperature_2m;
  const humidity = current.relative_humidity_2m;
  const condition = weatherCodeToCondition(current.weather_code);

  if (temp >= 18 && temp <= 26) {
    applyEvent(robot, 'temp_pleasant');
  } else if (temp > 32 || temp < 10) {
    applyEvent(robot, 'temp_extreme');
  }

  if (condition === 'sunny') {
    applyEvent(robot, 'weather_sunny');
  } else if (condition === 'cloudy' || condition === 'rainy') {
    applyEvent(robot, 'weather_cloudy');
  }

  if (humidity > 80) {
    applyEvent(robot, 'humidity_high');
  }

  return robot;
}

export function startWeatherMonitoring(getRobot, setRobot, coords) {
  if (weatherInterval) clearInterval(weatherInterval);

  const update = async () => {
    try {
      const data = await fetchWeather(coords.lat, coords.lon);
      const robot = getRobot();
      const updated = applyWeatherEffects(robot, data);
      setRobot(updated);
    } catch (e) {
      console.warn('Weather update failed:', e);
    }
  };

  update();
  weatherInterval = setInterval(update, 30 * 60 * 1000);
}

export function stopWeatherMonitoring() {
  if (weatherInterval) clearInterval(weatherInterval);
}
