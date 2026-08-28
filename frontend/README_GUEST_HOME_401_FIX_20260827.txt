ENZIUROOMS - FIX GUEST HOME REDIRECT 401 - 2026-08-27

Loi goc:
- apiClient.js bat KY response 401 nao cung window.location.replace('/login').
- Trang chu '/' la PUBLIC nhung co nhieu API public/phu tro.
- Chi can mot API tra 401 cho guest, trinh duyet bi day sang man hinh chon dang nhap.

Da sua:
- Guest khong co accessToken: 401 chi duoc tra ve cho component xu ly, KHONG redirect.
- Cac route public '/', '/hotels', '/hotels/:id' va cac trang policy/help KHONG bi ep sang /login.
- Neu user dang co token va o route protected ma session het han, van redirect /login nhu cu.

File chinh da sua:
- src/api/apiClient.js

Kiem tra cu phap:
- node --check src/api/apiClient.js : PASS

Sau khi thay folder frontend, deploy lai container frontend de bundle moi duoc build.
