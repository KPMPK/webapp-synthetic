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
const blockedIpsEnv = process.env.BLOCKED_IPS || '';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

function getForwardedIpList(forwardedForHeader) {
  if (!forwardedForHeader || typeof forwardedForHeader !== 'string') {
    return [];
  }

  return forwardedForHeader
    .split(',')
    .map((ip) => normalizeIp(ip))
    .filter(Boolean);
}

function getBlockedIpSet(rawBlockedIps) {
  return new Set(
    rawBlockedIps
      .split(',')
      .map((ip) => normalizeIp(ip))
      .filter(Boolean)
  );
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

const blockedIpSet = getBlockedIpSet(blockedIpsEnv);

app.use((req, res, next) => {
  const start = Date.now();
  const forwardedFor = req.headers['x-forwarded-for'] || null;
  const normalizedIp = normalizeIp(req.ip);
  const forwardedIps = getForwardedIpList(forwardedFor);
  const blockedSourceIp = [normalizedIp, ...forwardedIps].find((ip) => blockedIpSet.has(ip)) || null;

  const reqSnapshot = {
    method: req.method,
    path: req.originalUrl,
    httpVersion: req.httpVersion,
    ip: req.ip,
    ipGeo: getGeoByIp(req.ip),
    forwardedFor,
    forwardedForGeo: getGeoByIp(forwardedFor),
    headers: req.headers,
    query: req.query,
    cookies: req.cookies,
    body: safeBody(req.body),
    blockedSourceIp
  };

  let responseBody;
  const originalSend = res.send.bind(res);
  res.send = (body) => {
    responseBody = body;
    return originalSend(body);
  };

  res.on('finish', () => {
    io.emit('http-event', {
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      timestamp: new Date().toISOString(),
      request: reqSnapshot,
      response: {
        statusCode: res.statusCode,
        headers: res.getHeaders(),
        body: responseBody ?? null,
        durationMs: Date.now() - start
      }
    });
  });

  if (blockedSourceIp) {
    return res.status(403).json({
      error: 'Request denied by IP policy',
      blockedSourceIp
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
  console.log(
    blockedIpSet.size > 0
      ? `Blocked IP policy is active for: ${Array.from(blockedIpSet).join(', ')}`
      : 'Blocked IP policy is not set (BLOCKED_IPS is empty).'
  );
});
