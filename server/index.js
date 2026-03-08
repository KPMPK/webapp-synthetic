import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer } from 'http';
import { Server } from 'socket.io';

const app = express();
const port = process.env.PORT || 8443;
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

app.use((req, res, next) => {
  const start = Date.now();
  const reqSnapshot = {
    method: req.method,
    path: req.originalUrl,
    httpVersion: req.httpVersion,
    ip: req.ip,
    forwardedFor: req.headers['x-forwarded-for'] || null,
    headers: req.headers,
    query: req.query,
    cookies: req.cookies,
    body: safeBody(req.body)
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

  next();
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
      ip: req.ip
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
});
