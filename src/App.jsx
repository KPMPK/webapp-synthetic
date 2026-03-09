import { useEffect, useMemo, useState } from 'react';
import { io } from 'socket.io-client';

const socket = io({ transports: ['websocket'] });
const RECENT_EVENTS_LIMIT = 200;

function resolveCity(event) {
  return event.request?.forwardedForGeo?.city || event.request?.ipGeo?.city || 'Unknown';
}

function EcomMockPage() {
  const products = [
    { name: 'HackBox X17 Gaming Laptop', price: '฿39,900', oldPrice: '฿45,900', badge: 'HOT DEAL' },
    { name: 'Stealth Pro RGB Keyboard', price: '฿2,490', oldPrice: '฿3,190', badge: 'FLASH' },
    { name: 'NovaPulse 240Hz Monitor', price: '฿8,990', oldPrice: '฿10,990', badge: 'NEW' },
    { name: 'Phantom Wireless Mouse', price: '฿1,290', oldPrice: '฿1,790', badge: 'BEST SELLER' }
  ];

  return (
    <main className="container hackazon-page">
      <header className="shop-hero">
        <nav className="top-nav">
          <strong className="brand">HACKAZON</strong>
          <div className="hero-actions">
            <a href="#deals">Today Deals</a>
            <a href="/status">Open HTTP Inspector</a>
          </div>
        </nav>

        <div className="hero-grid">
          <div>
            <span className="pill">UP TO 70% OFF</span>
            <h1>Level Up Your Setup</h1>
            <p>Mockup หน้า e-commerce สไตล์ Hackazon สำหรับหน้าแรก พร้อมโปรโมชั่นและสินค้าเด่น</p>
            <div className="cta-row">
              <button type="button">Shop Now</button>
              <button type="button" className="ghost-btn">View Collection</button>
            </div>
          </div>
          <aside className="hero-side-card" id="deals">
            <h3>Lightning Deals</h3>
            <p>Gaming Chair X-Pro</p>
            <strong>฿5,490</strong>
            <small>เหลือเวลา 03:12:45</small>
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
            <div className="thumb" />
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

  useEffect(() => {
    socket.on('http-event', (event) => {
      setTotalCaptured((prev) => prev + 1);
      setEvents((prev) => [event, ...prev].slice(0, RECENT_EVENTS_LIMIT));
    });

    return () => {
      socket.off('http-event');
    };
  }, []);

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

    const topCities = Object.entries(byCity)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8);

    return { byStatus, topCities };
  }, [events]);

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

      <section className="list">
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
