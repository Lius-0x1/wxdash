import { useState, useCallback, useEffect, useRef } from "react";
import "./App.css";

const API_KEY = import.meta.env.VITE_WEATHER_API_KEY;
const BASE = "https://api.openweathermap.org/data/2.5";
const GEO = "https://api.openweathermap.org/geo/1.0";

const WX_ICONS = {
  Clear: "☀️", Clouds: "☁️", Rain: "🌧️", Drizzle: "🌦️",
  Thunderstorm: "⛈️", Snow: "❄️", Mist: "🌫️", Fog: "🌫️",
  Haze: "🌫️", Smoke: "🌫️", Dust: "🌪️", Tornado: "🌪️",
};

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function getBg(condition) {
  const map = {
    Clear: "linear-gradient(135deg, #0f172a 0%, #1e3a5f 50%, #0f2744 100%)",
    Clouds: "linear-gradient(135deg, #1a1a2e 0%, #2d3561 50%, #1a1a2e 100%)",
    Rain: "linear-gradient(135deg, #0d1b2a 0%, #1b3a4b 50%, #0d1b2a 100%)",
    Drizzle: "linear-gradient(135deg, #0d1b2a 0%, #1b3a4b 50%, #0d1b2a 100%)",
    Thunderstorm: "linear-gradient(135deg, #0a0a0f 0%, #1a0a2e 50%, #0a0a0f 100%)",
    Snow: "linear-gradient(135deg, #1a2a3a 0%, #2a3a5a 50%, #1a2a3a 100%)",
  };
  return map[condition] || "linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)";
}

function uvLabel(uv) {
  if (uv <= 2) return { label: "Low", color: "#4ade80" };
  if (uv <= 5) return { label: "Moderate", color: "#facc15" };
  if (uv <= 7) return { label: "High", color: "#fb923c" };
  if (uv <= 10) return { label: "Very High", color: "#f87171" };
  return { label: "Extreme", color: "#e879f9" };
}

function toF(c) { return Math.round((c * 9) / 5 + 32); }

function parseForecast(fData) {
  const daily = {};
  fData.list.forEach((item) => {
    const d = new Date(item.dt * 1000);
    const key = d.toDateString();
    if (!daily[key]) {
      daily[key] = { day: DAYS[d.getDay()], highs: [], lows: [], icon: item.weather[0].main };
    }
    daily[key].highs.push(item.main.temp_max);
    daily[key].lows.push(item.main.temp_min);
  });
  const todayKey = new Date().toDateString();
  return Object.entries(daily)
    .filter(([k]) => k !== todayKey)
    .slice(0, 5)
    .map(([, v]) => ({
      day: v.day,
      icon: WX_ICONS[v.icon] || "🌡️",
      high: Math.round(Math.max(...v.highs)),
      low: Math.round(Math.min(...v.lows)),
    }));
}

function StatCard({ icon, label, value, unit, sub }) {
  return (
    <div className="stat-card">
      <span className="stat-icon">{icon}</span>
      <div className="stat-body">
        <span className="stat-label">{label}</span>
        <span className="stat-value">{value}<span className="stat-unit">{unit}</span></span>
        {sub && <span className="stat-sub">{sub}</span>}
      </div>
    </div>
  );
}

function ForecastCard({ day, icon, high, low, unit }) {
  return (
    <div className="forecast-card">
      <span className="fc-day">{day}</span>
      <span className="fc-icon">{icon}</span>
      <span className="fc-high">{unit === "C" ? high : toF(high)}°</span>
      <span className="fc-low">{unit === "C" ? low : toF(low)}°</span>
    </div>
  );
}

export default function App() {
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [weather, setWeather] = useState(null);
  const [forecast, setForecast] = useState([]);
  const [uv, setUv] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [unit, setUnit] = useState("C");
  const [locating, setLocating] = useState(false);
  const [history, setHistory] = useState(() => {
    try { return JSON.parse(localStorage.getItem("wx_history")) || []; }
    catch { return []; }
  });

  const debounceRef = useRef(null);
  const searchWrapRef = useRef(null);

  const addToHistory = (cityName) => {
    setHistory((prev) => {
      const filtered = prev.filter((c) => c.toLowerCase() !== cityName.toLowerCase());
      const updated = [cityName, ...filtered].slice(0, 5);
      localStorage.setItem("wx_history", JSON.stringify(updated));
      return updated;
    });
  };

  const applyData = (wData, fData, uvData) => {
    setWeather(wData);
    setUv(uvData?.value ?? null);
    setForecast(parseForecast(fData));
    addToHistory(wData.name);
  };

  // fetch suggestions from geocoding API
  const fetchSuggestions = useCallback(async (input) => {
    if (input.trim().length < 2) { setSuggestions([]); return; }
    try {
      const res = await fetch(`${GEO}/direct?q=${encodeURIComponent(input)}&limit=5&appid=${API_KEY}`);
      if (!res.ok) return;
      const data = await res.json();
      setSuggestions(data);
      setShowSuggestions(data.length > 0);
    } catch {
      setSuggestions([]);
    }
  }, []);

  const handleQueryChange = (e) => {
    const val = e.target.value;
    setQuery(val);
    setError("");
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchSuggestions(val), 350);
  };

  const searchByCoords = useCallback(async (lat, lon) => {
    setLoading(true);
    setError("");
    setWeather(null);
    setForecast([]);
    setUv(null);
    setSuggestions([]);
    setShowSuggestions(false);
    try {
      const [wRes, fRes] = await Promise.all([
        fetch(`${BASE}/weather?lat=${lat}&lon=${lon}&appid=${API_KEY}&units=metric`),
        fetch(`${BASE}/forecast?lat=${lat}&lon=${lon}&appid=${API_KEY}&units=metric`),
      ]);
      if (!wRes.ok) throw new Error("Could not fetch weather for your location.");
      const wData = await wRes.json();
      const fData = await fRes.json();
      const uvRes = await fetch(`${BASE}/uvi?appid=${API_KEY}&lat=${lat}&lon=${lon}`);
      const uvData = uvRes.ok ? await uvRes.json() : null;
      applyData(wData, fData, uvData);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
      setLocating(false);
    }
  }, []);

  const search = useCallback(async (city) => {
    if (!city.trim()) return;
    setLoading(true);
    setError("");
    setWeather(null);
    setForecast([]);
    setUv(null);
    setSuggestions([]);
    setShowSuggestions(false);
    try {
      const [wRes, fRes] = await Promise.all([
        fetch(`${BASE}/weather?q=${encodeURIComponent(city)}&appid=${API_KEY}&units=metric`),
        fetch(`${BASE}/forecast?q=${encodeURIComponent(city)}&appid=${API_KEY}&units=metric`),
      ]);
      if (!wRes.ok) throw new Error("City not found. Check spelling and try again.");
      const wData = await wRes.json();
      const fData = await fRes.json();
      const uvRes = await fetch(`${BASE}/uvi?appid=${API_KEY}&lat=${wData.coord.lat}&lon=${wData.coord.lon}`);
      const uvData = uvRes.ok ? await uvRes.json() : null;
      applyData(wData, fData, uvData);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const pickSuggestion = (s) => {
    const label = [s.name, s.state, s.country].filter(Boolean).join(", ");
    setQuery(label);
    setShowSuggestions(false);
    setSuggestions([]);
    searchByCoords(s.lat, s.lon);
  };

  const geoLocate = useCallback(() => {
    if (!navigator.geolocation) { setError("Geolocation not supported by your browser."); return; }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => searchByCoords(coords.latitude, coords.longitude),
      () => { setLocating(false); setError("Location access denied. Search manually instead."); }
    );
  }, [searchByCoords]);

  useEffect(() => { geoLocate(); }, []);

  // close suggestions on outside click
  useEffect(() => {
    const handler = (e) => {
      if (searchWrapRef.current && !searchWrapRef.current.contains(e.target)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const displayTemp = (c) => (unit === "C" ? Math.round(c) : toF(c));
  const condition = weather?.weather?.[0]?.main || "Clear";
  const uvInfo = uv !== null ? uvLabel(uv) : null;

  return (
    <div className="app" style={{ background: getBg(condition) }}>
      <div className="container">
        <header className="header">
          <h1 className="logo">WXDASH</h1>
          <div className="header-controls">
            <button className="unit-toggle" onClick={() => setUnit((u) => u === "C" ? "F" : "C")}>
              °{unit === "C" ? "F" : "C"}
            </button>
            <button className="geo-btn" onClick={geoLocate} disabled={locating} title="Use my location">
              {locating ? "..." : "📍"}
            </button>
            <div className="search-wrap" ref={searchWrapRef}>
              <input
                className="search"
                type="text"
                placeholder="Search city..."
                value={query}
                onChange={handleQueryChange}
                onKeyDown={(e) => { if (e.key === "Enter") { setShowSuggestions(false); search(query); } }}
                onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
                autoComplete="off"
              />
              <button className="search-btn" onClick={() => { setShowSuggestions(false); search(query); }}>
                {loading ? "..." : "→"}
              </button>

              {showSuggestions && suggestions.length > 0 && (
                <ul className="suggestions">
                  {suggestions.map((s, i) => {
                    const label = [s.name, s.state, s.country].filter(Boolean).join(", ");
                    return (
                      <li key={i} className="suggestion-item" onMouseDown={() => pickSuggestion(s)}>
                        <span className="suggestion-name">{s.name}</span>
                        {(s.state || s.country) && (
                          <span className="suggestion-sub">{[s.state, s.country].filter(Boolean).join(", ")}</span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        </header>

        {history.length > 0 && (
          <div className="history-row">
            <span className="history-label">recent</span>
            {history.map((city, i) => (
              <button key={i} className="history-pill" onClick={() => { setQuery(city); search(city); }}>
                {city}
              </button>
            ))}
          </div>
        )}

        {error && <div className="error-msg">{error}</div>}

        {(locating || loading) && !weather && (
          <div className="empty">
            <span className="empty-icon">{locating ? "📍" : "⏳"}</span>
            <p>{locating ? "Detecting your location..." : "Loading..."}</p>
          </div>
        )}

        {!weather && !loading && !locating && !error && (
          <div className="empty">
            <span className="empty-icon">🌍</span>
            <p>Enter a city to get started</p>
          </div>
        )}

        {weather && (
          <div className="dashboard">
            <div className="hero">
              <div className="hero-left">
                <div className="city-name">{weather.name}, {weather.sys.country}</div>
                <div className="temp-big">
                  {displayTemp(weather.main.temp)}<span className="deg">°{unit}</span>
                </div>
                <div className="condition-label">
                  {WX_ICONS[condition] || "🌡️"} {weather.weather[0].description}
                </div>
                <div className="feels-like">
                  Feels like {displayTemp(weather.main.feels_like)}°{unit} &nbsp;·&nbsp;
                  H: {displayTemp(weather.main.temp_max)}° &nbsp;L: {displayTemp(weather.main.temp_min)}°
                </div>
              </div>
              <div className="hero-icon">{WX_ICONS[condition] || "🌡️"}</div>
            </div>

            <div className="stats-grid">
              <StatCard icon="💧" label="Humidity" value={weather.main.humidity} unit="%" />
              <StatCard icon="💨" label="Wind" value={Math.round(weather.wind.speed * 3.6)} unit=" km/h" sub={`${weather.wind.deg ?? "--"}° direction`} />
              <StatCard icon="🔵" label="Pressure" value={weather.main.pressure} unit=" hPa" />
              <StatCard icon="👁️" label="Visibility" value={Math.round((weather.visibility || 0) / 1000)} unit=" km" />
              <StatCard icon="☁️" label="Cloud Cover" value={weather.clouds.all} unit="%" />
              {uv !== null && (
                <StatCard icon="🌞" label="UV Index" value={Math.round(uv)} unit=""
                  sub={<span style={{ color: uvInfo.color }}>{uvInfo.label}</span>} />
              )}
            </div>

            {forecast.length > 0 && (
              <div className="forecast-section">
                <h2 className="section-title">5-day forecast</h2>
                <div className="forecast-row">
                  {forecast.map((f, i) => <ForecastCard key={i} {...f} unit={unit} />)}
                </div>
              </div>
            )}

            <div className="sun-row">
              <div className="sun-item">
                <span className="sun-icon">🌅</span>
                <div>
                  <div className="sun-label">Sunrise</div>
                  <div className="sun-time">
                    {new Date(weather.sys.sunrise * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </div>
                </div>
              </div>
              <div className="sun-divider" />
              <div className="sun-item">
                <span className="sun-icon">🌇</span>
                <div>
                  <div className="sun-label">Sunset</div>
                  <div className="sun-time">
                    {new Date(weather.sys.sunset * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}