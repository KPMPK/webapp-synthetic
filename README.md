# Real-Time HTTP Inspector (React + Express)

เว็บแอปนี้แสดง HTTP Request/Response แบบ real-time โดยรองรับข้อมูล:
- Request method/path/http version
- Source IP (`req.ip`) และ `x-forwarded-for` พร้อม Geo lookup (country/region/city/timezone)
- Headers, query params, body, cookies
- Response status, headers, body และ response duration

## Run locally

```bash
npm install
npm run build
npm start
```

เปิดที่ `http://localhost:8443`

## Docker

Build image:

```bash
docker build -t http-inspector .
```

Run container on port 8443:

```bash
docker run --rm -p 8443:8443 http-inspector
```

หน้า `/status` สามารถกดปุ่มจาก GUI เพื่อ block/unblock ประเทศได้โดยตรง (อิงจาก country code ที่พบใน traffic ล่าสุด)

จากนั้นเปิด `http://localhost:8443` และลองยิง request ไปที่:
- `GET /api/health`
- `POST /api/echo`

ทุก request/response ที่เข้ามาในแอปจะถูกส่งขึ้นหน้าจอแบบ real-time ผ่าน Socket.IO


## Routes

- `/` หน้า mockup e-commerce
- `/status` หน้า real-time HTTP inspector
