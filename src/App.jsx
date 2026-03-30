import { useEffect, useMemo, useState } from 'react';
import { io } from 'socket.io-client';

const socket = io({ transports: ['websocket'] });
const RECENT_EVENTS_LIMIT = 200;

function resolveCity(event) {
  return event.request?.forwardedForGeo?.city || event.request?.ipGeo?.city || 'Unknown';
}

function resolveCountry(event) {
  return event.request?.forwardedForGeo?.country || event.request?.ipGeo?.country || null;
}

function EcomMockPage() {
  const products = [
    {
      name: 'E-Shop X17 Gaming Laptop',
      price: '฿39,900',
      oldPrice: '฿45,900',
      badge: 'HOT DEAL',
      image: 'https://images.unsplash.com/photo-1603302576837-37561b2e2302?auto=format&fit=crop&w=900&q=80'
    },
    {
      name: 'RGB Mechanical Keyboard',
      price: '฿2,490',
      oldPrice: '฿3,190',
      badge: 'FLASH',
      image: 'https://images.unsplash.com/photo-1595225476474-87563907a212?auto=format&fit=crop&w=900&q=80'
    },
    {
      name: '240Hz Gaming Monitor',
      price: '฿8,990',
      oldPrice: '฿10,990',
      badge: 'NEW',
      image: 'https://images.unsplash.com/photo-1587202372775-e229f172b9d7?auto=format&fit=crop&w=900&q=80'
    },
    {
      name: 'Wireless Gaming Mouse',
      price: '฿1,290',
      oldPrice: '฿1,790',
      badge: 'BEST SELLER',
      image: 'https://images.unsplash.com/photo-1615663245857-ac93bb7c39e7?auto=format&fit=crop&w=900&q=80'
    }
  ];

  return (
    <main className="container">
      <header className="shop-hero">
        <nav className="top-nav">
          <strong className="brand">E-SHOP</strong>
          <div className="hero-actions">
            <a href="#deals">Today Deals</a>
            <a href="/status">Open HTTP Inspector</a>
          </div>
        </nav>

        <div className="hero-grid">
          <div>
            <span className="pill">UP TO 70% OFF</span>
            <h1>Level Up Your Setup</h1>
            <div className="cta-row">
              <button type="button">Shop Now</button>
              <button type="button" className="ghost-btn">View Collection</button>
            </div>
          </div>
          <aside className="hero-side-card" id="deals">
            <h3>Lightning Deals</h3>
            <p>Gaming Chair X-Pro</p>
            <strong>฿5,490</strong>
            <small>Time left 03:12:45</small>
          </aside>
        </div>
      </header>

      <section className="category-row">
        {['Gaming', 'Laptop', 'Accessories', 'Audio', 'Streaming', 'Smart Home'].map((cat) => (
          <span key={cat} className="category-chip">{cat}</span>
        ))}
      </section>

      <section className="products">
        {products.map((item) => (
          <article className="product-card" key={item.name}>
            <img className="thumb" src={item.image} alt={item.name} loading="lazy" />
            <div className="product-top">
              <span className="tag">{item.badge}</span>
              <span className="rating">★ 4.8</span>
            </div>
            <h3>{item.name}</h3>
            <p className="price">{item.price} <small>{item.oldPrice}</small></p>
            <button type="button">Add to cart</button>
          </article>
        ))}
      </section>
    </main>
  );
}

function InspectorPage() {
  const [events, setEvents] = useState([]);
  const [totalCaptured, setTotalCaptured] = useState(0);
  const [blockedCountries, setBlockedCountries] = useState([]);
  const [requesterCountry, setRequesterCountry] = useState(null);

  useEffect(() => {
    fetch('/api/events')
      .then((res) => res.json())
      .then((data) => {
        setEvents(data.events || []);
        setTotalCaptured(data.totalCaptured || 0);
        setBlockedCountries(data.blockedCountries || []);
        setRequesterCountry(data.requesterCountry || null);
      })
      .catch(() => {
        setEvents([]);
        setTotalCaptured(0);
        setBlockedCountries([]);
        setRequesterCountry(null);
      });

    socket.on('http-event', (event) => {
      setTotalCaptured((prev) => prev + 1);
      setEvents((prev) => [event, ...prev].slice(0, RECENT_EVENTS_LIMIT));
    });

    socket.on('country-policy-updated', (payload) => {
      setBlockedCountries(payload.blockedCountries || []);
    });

    return () => {
      socket.off('http-event');
      socket.off('country-policy-updated');
    };
  }, []);

  const setCountryPolicy = async (countryCode, blocked) => {
    const res = await fetch('/api/block-countries', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ countryCode, blocked })
    });

    if (res.ok) {
      const data = await res.json();
      setBlockedCountries(data.blockedCountries || []);
      return;
    }

    const errorData = await res.json().catch(() => ({}));
    console.warn(errorData.error || 'Failed to update country policy');
  };

  const stats = useMemo(() => {
    const byStatus = events.reduce((acc, e) => {
      acc[e.response.statusCode] = (acc[e.response.statusCode] || 0) + 1;
      return acc;
    }, {});

    const byCity = events.reduce((acc, event) => {
      const city = resolveCity(event);
      acc[city] = (acc[city] || 0) + 1;
      return acc;
    }, {});

    const byCountry = events.reduce((acc, event) => {
      const country = resolveCountry(event);
      if (!country) {
        return acc;
      }
      acc[country] = (acc[country] || 0) + 1;
      return acc;
    }, {});

    const topCities = Object.entries(byCity)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8);

    const topCountries = Object.entries(byCountry)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);

    return { byStatus, topCities, topCountries };
  }, [events]);

  const policyCountries = useMemo(() => {
    const seen = new Set(stats.topCountries.map(([country]) => country));
    blockedCountries.forEach((country) => seen.add(country));
    return Array.from(seen);
  }, [stats.topCountries, blockedCountries]);

  return (
    <main className="container">
      <header className="header">
        <nav className="top-nav">
          <strong>HTTP Inspector</strong>
          <a href="/">Go to e-commerce mockup</a>
        </nav>
        <h1>Real-Time HTTP Request/Response Inspector</h1>
        <p>
          Monitor live traffic with headers, body, cookies, source IP, response metadata,
          and duration.
        </p>
      </header>

      <section className="stats">
        <div className="stat-card">
          <span className="label">Total captured (all time)</span>
          <strong>{totalCaptured}</strong>
        </div>
        <div className="stat-card">
          <span className="label">Showing recent events</span>
          <strong>
            {events.length} / {RECENT_EVENTS_LIMIT}
          </strong>
        </div>
        <div className="stat-card">
          <span className="label">Response statuses (recent {RECENT_EVENTS_LIMIT})</span>
          <strong>{Object.entries(stats.byStatus).map(([k, v]) => `${k}: ${v}`).join(' • ') || 'No data yet'}</strong>
        </div>
        <div className="stat-card">
          <span className="label">Top cities (recent {RECENT_EVENTS_LIMIT})</span>
          {stats.topCities.length === 0 ? (
            <strong>No city data yet</strong>
          ) : (
            <ul className="city-list">
              {stats.topCities.map(([city, count]) => (
                <li key={city}>
                  <span>{city}</span>
                  <strong>{count}</strong>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <div className="status-layout">
        <aside className="country-policy-card left-panel">
          <h2>Country Block Policy (GUI)</h2>
          <p>Use the slide toggle to allow or block country access from this page.</p>
          <div className="country-policy-grid">
            {policyCountries.length === 0 ? (
              <span className="empty-inline">No country data yet</span>
            ) : (
              policyCountries.map((country) => {
                const isBlocked = blockedCountries.includes(country);
                const isRequesterCountry = requesterCountry === country;
                const cannotBlockSelf = isRequesterCountry && !isBlocked;
                return (
                  <div key={country} className="country-policy-row">
                    <span className="country-label">
                      {country}
                      {isRequesterCountry ? ' (You)' : ''}
                    </span>
                    <button
                      type="button"
                      className={`country-slide-toggle ${isBlocked ? 'blocked' : 'allowed'} ${cannotBlockSelf ? 'disabled' : ''}`}
                      onClick={() => setCountryPolicy(country, !isBlocked)}
                      aria-pressed={isBlocked}
                      aria-label={`${country} is ${isBlocked ? 'blocked' : 'allowed'}`}
                      disabled={cannotBlockSelf}
                      title={cannotBlockSelf ? 'You cannot block your own requester country.' : ''}
                    >
                      <span className="toggle-track">
                        <span className="toggle-thumb" />
                      </span>
                      <span className="toggle-text">{isBlocked ? 'Blocked' : 'Allowed'}</span>
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </aside>

        <section className="list right-panel">
          {events.length === 0 ? (
            <div className="empty">No HTTP traffic captured yet. Try hitting any route on this app.</div>
          ) : (
            events.map((event) => (
              <article className="event-card" key={event.id}>
                <div className="event-head">
                  <span className="method">{event.request.method}</span>
                  <span className="path">{event.request.path}</span>
                  <span className="status">{event.response.statusCode}</span>
                  <span className="duration">{event.response.durationMs} ms</span>
                  <span className="time">{new Date(event.timestamp).toLocaleTimeString()}</span>
                </div>

                <details open>
                  <summary>Request</summary>
                  <pre>{JSON.stringify(event.request, null, 2)}</pre>
                </details>

                <details>
                  <summary>Response</summary>
                  <pre>{JSON.stringify(event.response, null, 2)}</pre>
                </details>
              </article>
            ))
          )}
        </section>
      </div>
    </main>
  );
}

function App() {
  const path = window.location.pathname;
  if (path === '/status') {
    return <InspectorPage />;
  }
  return <EcomMockPage />;
}

export default App;
