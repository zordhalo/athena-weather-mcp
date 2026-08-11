/**
 * Real open/public data sources — no API keys required.
 *
 *  - Geocoding : Open-Meteo Geocoding API   (https://open-meteo.com/en/docs/geocoding-api)
 *  - Forecast  : Open-Meteo Forecast API    (https://open-meteo.com/en/docs)
 *  - Alerts    : US National Weather Service (https://www.weather.gov/documentation/services-web-api)
 *
 * Open-Meteo is global. NWS alerts are US-only, which we surface honestly in the
 * payload via `alertCoverage` rather than silently returning an empty list.
 */

const UA = 'athena-weather-mcp/1.0 (challenge build; lucas@advancelabs.dev)';

async function getJSON(url, headers = {}) {
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, Accept: 'application/json', ...headers },
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} from ${new URL(url).host}`);
  return res.json();
}

/** WMO weather interpretation codes -> label + emoji glyph. */
export const WMO = {
  0: ['Clear sky', '☀️'], 1: ['Mainly clear', '🌤️'], 2: ['Partly cloudy', '⛅'], 3: ['Overcast', '☁️'],
  45: ['Fog', '🌫️'], 48: ['Rime fog', '🌫️'],
  51: ['Light drizzle', '🌦️'], 53: ['Drizzle', '🌦️'], 55: ['Dense drizzle', '🌧️'],
  56: ['Freezing drizzle', '🌧️'], 57: ['Freezing drizzle', '🌧️'],
  61: ['Light rain', '🌦️'], 63: ['Rain', '🌧️'], 65: ['Heavy rain', '🌧️'],
  66: ['Freezing rain', '🌧️'], 67: ['Freezing rain', '🌧️'],
  71: ['Light snow', '🌨️'], 73: ['Snow', '🌨️'], 75: ['Heavy snow', '❄️'], 77: ['Snow grains', '🌨️'],
  80: ['Rain showers', '🌦️'], 81: ['Rain showers', '🌧️'], 82: ['Violent showers', '⛈️'],
  85: ['Snow showers', '🌨️'], 86: ['Heavy snow showers', '❄️'],
  95: ['Thunderstorm', '⛈️'], 96: ['Thunderstorm + hail', '⛈️'], 99: ['Severe thunderstorm', '⛈️'],
};

export function describeCode(code) {
  return WMO[code] ?? ['Unknown', '❓'];
}

/** Resolve a free-text place name to coordinates. */
export async function geocode(query) {
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=1&language=en&format=json`;
  const data = await getJSON(url);
  const hit = data?.results?.[0];
  if (!hit) throw new Error(`No location found matching "${query}". Try "City, Region" (e.g. "Austin, Texas").`);
  return {
    name: hit.name,
    region: hit.admin1 ?? '',
    country: hit.country ?? '',
    countryCode: hit.country_code ?? '',
    lat: hit.latitude,
    lon: hit.longitude,
    timezone: hit.timezone ?? 'auto',
  };
}

/** 7-day daily + 48h hourly forecast for a coordinate. */
export async function fetchForecast(lat, lon, days = 7) {
  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    timezone: 'auto',
    forecast_days: String(Math.min(Math.max(days, 1), 7)),
    current: 'temperature_2m,apparent_temperature,relative_humidity_2m,precipitation,weather_code,wind_speed_10m,wind_gusts_10m',
    daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,wind_speed_10m_max,wind_gusts_10m_max,sunrise,sunset',
    hourly: 'temperature_2m,precipitation_probability,wind_speed_10m,weather_code',
    temperature_unit: 'fahrenheit',
    wind_speed_unit: 'mph',
    precipitation_unit: 'inch',
  });
  return getJSON(`https://api.open-meteo.com/v1/forecast?${params}`);
}

/** Active NWS alerts for a point (US only). */
export async function fetchAlertsForPoint(lat, lon) {
  const url = `https://api.weather.gov/alerts/active?point=${lat.toFixed(4)},${lon.toFixed(4)}`;
  const data = await getJSON(url, { Accept: 'application/geo+json' });
  return (data.features ?? []).map(normalizeAlert);
}

/** Active NWS alerts nationwide or by state, optionally filtered by severity. */
export async function fetchAlerts({ area, severity, limit = 60 } = {}) {
  const params = new URLSearchParams({ limit: String(Math.min(limit, 200)) });
  if (area) params.set('area', area.toUpperCase());
  if (severity) params.set('severity', severity);
  const data = await getJSON(`https://api.weather.gov/alerts/active?${params}`, {
    Accept: 'application/geo+json',
  });
  return (data.features ?? []).map(normalizeAlert);
}

const SEVERITY_RANK = { Extreme: 0, Severe: 1, Moderate: 2, Minor: 3, Unknown: 4 };

function normalizeAlert(f) {
  const p = f.properties ?? {};
  return {
    id: p.id ?? f.id,
    event: p.event ?? 'Weather Alert',
    severity: p.severity ?? 'Unknown',
    urgency: p.urgency ?? 'Unknown',
    certainty: p.certainty ?? 'Unknown',
    headline: p.headline ?? '',
    areaDesc: p.areaDesc ?? '',
    sender: p.senderName ?? 'NWS',
    onset: p.onset ?? p.effective ?? null,
    expires: p.expires ?? p.ends ?? null,
    description: (p.description ?? '').trim(),
    instruction: (p.instruction ?? '').trim(),
  };
}

export function sortAlerts(alerts) {
  return [...alerts].sort(
    (a, b) => (SEVERITY_RANK[a.severity] ?? 9) - (SEVERITY_RANK[b.severity] ?? 9)
  );
}

/**
 * Assemble the single payload the widget renders. Everything the UI needs is
 * baked in here so the iframe never has to make its own network calls.
 */
export async function buildExplorerPayload(locationQuery, days = 7) {
  const place = await geocode(locationQuery);
  const isUS = place.countryCode === 'US';

  const [forecast, alerts] = await Promise.all([
    fetchForecast(place.lat, place.lon, days),
    isUS ? fetchAlertsForPoint(place.lat, place.lon).catch(() => []) : Promise.resolve([]),
  ]);

  const d = forecast.daily;
  const daily = d.time.map((date, i) => {
    const [label, glyph] = describeCode(d.weather_code[i]);
    return {
      date,
      code: d.weather_code[i],
      label,
      glyph,
      tempMax: Math.round(d.temperature_2m_max[i]),
      tempMin: Math.round(d.temperature_2m_min[i]),
      precipSum: d.precipitation_sum[i],
      precipChance: d.precipitation_probability_max[i] ?? 0,
      windMax: Math.round(d.wind_speed_10m_max[i]),
      gustMax: Math.round(d.wind_gusts_10m_max[i] ?? 0),
      sunrise: d.sunrise[i],
      sunset: d.sunset[i],
    };
  });

  // Group the hourly series under its calendar day so the widget can pivot
  // between days without another round-trip.
  const h = forecast.hourly;
  const hourlyByDate = {};
  h.time.forEach((t, i) => {
    const date = t.slice(0, 10);
    (hourlyByDate[date] ??= []).push({
      time: t,
      hour: t.slice(11, 16),
      temp: Math.round(h.temperature_2m[i]),
      precip: h.precipitation_probability[i] ?? 0,
      wind: Math.round(h.wind_speed_10m[i]),
      code: h.weather_code[i],
    });
  });

  const c = forecast.current;
  const [curLabel, curGlyph] = describeCode(c.weather_code);

  return {
    place,
    generatedAt: new Date().toISOString(),
    timezone: forecast.timezone,
    current: {
      temp: Math.round(c.temperature_2m),
      feelsLike: Math.round(c.apparent_temperature),
      humidity: c.relative_humidity_2m,
      wind: Math.round(c.wind_speed_10m),
      gust: Math.round(c.wind_gusts_10m ?? 0),
      label: curLabel,
      glyph: curGlyph,
    },
    daily,
    hourlyByDate,
    alerts: sortAlerts(alerts),
    alertCoverage: isUS
      ? 'NWS active alerts (live)'
      : `Government alert feed unavailable outside the US — showing forecast only for ${place.country}`,
    units: { temp: '°F', wind: 'mph', precip: 'in' },
  };
}
