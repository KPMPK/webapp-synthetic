import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer } from 'http';
import { Server } from 'socket.io';
import geoip from 'geoip-lite';

const app = express();
const port = process.env.PORT || 8443;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const blockedCountrySet = new Set();
const recentEvents = [];
const MAX_RECENT_EVENTS = 200;
let totalCaptured = 0;

app.set('trust proxy', true);
app.use(cors());
app.use(cookieParser());
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true }));

const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*'
  }
});

function safeBody(body) {
  if (body === undefined || body === null || body === '') {
    return null;
  }
  return body;
}

function normalizeIp(ipValue) {
  if (!ipValue || typeof ipValue !== 'string') {
    return null;
  }

  const firstIp = ipValue.split(',')[0]?.trim() || null;
  if (!firstIp) {
    return null;
  }

  if (firstIp.startsWith('::ffff:')) {
    return firstIp.replace('::ffff:', '');
  }

  return firstIp;
}

function getGeoByIp(ipValue) {
  const ip = normalizeIp(ipValue);
  if (!ip) {
    return null;
  }

  const geo = geoip.lookup(ip);
  if (!geo) {
    return {
      ip,
      country: null,
      region: null,
      city: null,
      timezone: null,
      ll: null
    };
  }

  return {
    ip,
    country: geo.country || null,
    region: geo.region || null,
    city: geo.city || null,
    timezone: geo.timezone || null,
    ll: geo.ll || null
  };
}

function normalizeCountryCode(country) {
  if (!country || typeof country !== 'string') {
    return null;
  }
  const code = country.trim().toUpperCase();
  return code.length === 2 ? code : null;
}

function getSourceGeo(req) {
  const forwardedFor = req.headers['x-forwarded-for'] || null;
  const forwardedGeo = getGeoByIp(forwardedFor);
  const ipGeo = getGeoByIp(req.ip);

  return {
    forwardedFor,
    forwardedGeo,
    ipGeo,
    sourceGeo: forwardedGeo || ipGeo
  };
}

function emitCountryPolicyUpdate() {
  io.emit('country-policy-updated', {
    blockedCountries: Array.from(blockedCountrySet)
  });
}

function pushEvent(httpEvent) {
  totalCaptured += 1;
  recentEvents.unshift(httpEvent);
  if (recentEvents.length > MAX_RECENT_EVENTS) {
    recentEvents.length = MAX_RECENT_EVENTS;
  }
}

app.get('/api/events', (req, res) => {
  res.json({
    totalCaptured,
    events: recentEvents,
    blockedCountries: Array.from(blockedCountrySet)
  });
});

app.get('/api/block-countries', (req, res) => {
  res.json({ blockedCountries: Array.from(blockedCountrySet) });
});

app.post('/api/block-countries', (req, res) => {
  const countryCode = normalizeCountryCode(req.body?.countryCode);
  const shouldBlock = Boolean(req.body?.blocked);

  if (!countryCode) {
    return res.status(400).json({ error: 'countryCode must be a 2-letter code' });
  }

  if (shouldBlock) {
    blockedCountrySet.add(countryCode);
  } else {
    blockedCountrySet.delete(countryCode);
  }

  emitCountryPolicyUpdate();

  return res.json({ blockedCountries: Array.from(blockedCountrySet) });
});

app.use((req, res, next) => {
  const start = Date.now();
  const { forwardedFor, forwardedGeo, ipGeo, sourceGeo } = getSourceGeo(req);
  const sourceCountry = normalizeCountryCode(sourceGeo?.country);
  const blockedSourceCountry = sourceCountry && blockedCountrySet.has(sourceCountry) ? sourceCountry : null;

  const reqSnapshot = {
    method: req.method,
    path: req.originalUrl,
    httpVersion: req.httpVersion,
    ip: req.ip,
    ipGeo,
    forwardedFor,
    forwardedForGeo: forwardedGeo,
    headers: req.headers,
    query: req.query,
    cookies: req.cookies,
    body: safeBody(req.body),
    blockedSourceCountry
  };

  let responseBody;
  const originalSend = res.send.bind(res);
  res.send = (body) => {
    responseBody = body;
    return originalSend(body);
  };

  res.on('finish', () => {
    const httpEvent = {
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      timestamp: new Date().toISOString(),
      request: reqSnapshot,
      response: {
        statusCode: res.statusCode,
        headers: res.getHeaders(),
        body: responseBody ?? null,
        durationMs: Date.now() - start
      }
    };

    pushEvent(httpEvent);
    io.emit('http-event', httpEvent);
  });

  const isCountryPolicyEndpoint = req.path.startsWith('/api/block-countries');
  if (blockedSourceCountry && !isCountryPolicyEndpoint) {
    return res.status(403).json({
      error: 'Request denied by country policy',
      blockedSourceCountry
    });
  }

  return next();
});

app.get('/api/health', (req, res) => {
  res.json({ ok: true, at: new Date().toISOString() });
});

app.all('/api/echo', (req, res) => {
  res.status(200).json({
    received: {
      method: req.method,
      path: req.originalUrl,
      headers: req.headers,
      query: req.query,
      body: req.body,
      cookies: req.cookies,
      ip: req.ip,
      ipGeo: getGeoByIp(req.ip),
      forwardedFor: req.headers['x-forwarded-for'] || null,
      forwardedForGeo: getGeoByIp(req.headers['x-forwarded-for'] || null)
    }
  });
});

const distPath = path.resolve(__dirname, '../dist');
app.use(express.static(distPath));
app.get('*', (req, res) => {
  res.sendFile(path.join(distPath, 'index.html'));
});

server.listen(port, '0.0.0.0', () => {
  console.log(`HTTP inspector app running on port ${port}`);
  console.log('Country blocking is managed from /status UI.');
});
