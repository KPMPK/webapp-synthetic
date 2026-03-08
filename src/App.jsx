import { useEffect, useMemo, useState } from 'react';
import { io } from 'socket.io-client';

const socket = io({ transports: ['websocket'] });

function App() {
  const [events, setEvents] = useState([]);

  useEffect(() => {
    socket.on('http-event', (event) => {
      setEvents((prev) => [event, ...prev].slice(0, 200));
    });

    return () => {
      socket.off('http-event');
    };
  }, []);

  const stats = useMemo(() => {
    const total = events.length;
    const byStatus = events.reduce((acc, e) => {
      acc[e.response.statusCode] = (acc[e.response.statusCode] || 0) + 1;
      return acc;
    }, {});

    return { total, byStatus };
  }, [events]);

  return (
    <main className="container">
      <header className="header">
        <h1>Real-Time HTTP Request/Response Inspector</h1>
        <p>
          Monitor live traffic with headers, body, cookies, source IP, response metadata,
          and duration.
        </p>
      </header>

      <section className="stats">
        <div className="stat-card">
          <span className="label">Total captured</span>
          <strong>{stats.total}</strong>
        </div>
        <div className="stat-card">
          <span className="label">Response statuses</span>
          <strong>{Object.entries(stats.byStatus).map(([k, v]) => `${k}: ${v}`).join(' • ') || 'No data yet'}</strong>
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

export default App;
