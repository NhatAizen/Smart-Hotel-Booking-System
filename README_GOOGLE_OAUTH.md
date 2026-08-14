# Google OAuth cho EnziuRooms

## 1. Giải nén ZIP tại thư mục gốc
D:\Smart-Hotel-Booking-System

## 2. Thêm vào file .env ở thư mục gốc
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
OAUTH_FRONTEND_REDIRECT=http://localhost:5173/oauth2/callback

## 3. Thêm vào identity-service.environment trong docker-compose.yml
GOOGLE_CLIENT_ID: ${GOOGLE_CLIENT_ID}
GOOGLE_CLIENT_SECRET: ${GOOGLE_CLIENT_SECRET}
OAUTH_FRONTEND_REDIRECT: ${OAUTH_FRONTEND_REDIRECT:-http://localhost:5173/oauth2/callback}

## 4. Tạo hoặc sửa frontend/.env
VITE_API_BASE_URL=http://localhost:8080/api
VITE_GOOGLE_OAUTH_URL=http://localhost:8081/oauth2/authorization/google

## 5. Google Cloud phải có
Authorized JavaScript origin:
http://localhost:5173

Authorized redirect URI:
http://localhost:8081/login/oauth2/code/google

## 6. Test backend
cd D:\Smart-Hotel-Booking-System\services\identity-service
.\mvnw.cmd clean test

## 7. Build Docker
cd D:\Smart-Hotel-Booking-System
docker compose up -d --build --force-recreate identity-service api-gateway

docker compose ps identity-service api-gateway

## 8. Chạy frontend
cd D:\Smart-Hotel-Booking-System\frontend
npm install
npm run dev

## 9. Test
Mở http://localhost:5173/login
Bấm Tiếp tục với Google.

Backend chỉ gửi mã dùng một lần về frontend. JWT không nằm trực tiếp trên URL.
