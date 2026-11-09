# Trợ lý ngữ nghĩa EnziuRooms

Trợ lý phân tích ý định và tiêu chí bằng **Qwen3-4B-Instruct-2507 chạy nội bộ trên llama.cpp**, đối chiếu tiêu chí với câu hỏi gốc, sau đó tra cứu API EnziuRooms và trả lời từ dữ liệu đã xác minh. Không gọi Gemini, OpenAI hoặc API suy luận bên ngoài. Mô hình chỉ tạo JSON quyết định nghiệp vụ; giá, phòng trống, đánh giá và chính sách của đơn không lấy từ văn bản mô hình sinh ra.

## Cách xử lý một câu hỏi

Quy tắc chung, phạm vi dữ liệu, cách xử lý thiếu thông tin và kiểm thử: [assistant-answer-contract.md](../../docs/assistant-answer-contract.md).

1. Frontend gửi câu hỏi, khách sạn đang xem, ngày ở, số khách và ID các phòng vừa được giới thiệu. ID chỉ là tham chiếu; backend đọc lại thông tin thật và kiểm tra khách sạn sở hữu loại phòng.
2. `semantic-service` gọi `dialogue-model` trong mạng nội bộ để xác định ý định, hành động hội thoại và thay đổi tiêu chí. JSON bị giới hạn bởi schema. `grounding.py` đối chiếu địa điểm, tiền, số khách và tiện nghi với câu hỏi gốc, loại tiêu chí mô hình tự thêm, và nhận diện các bộ lọc chưa hỗ trợ. Backend giới hạn giá trị và hợp nhất thay đổi với bộ nhớ có cấu trúc.
3. Backend gọi Hotel/Booking Service đúng với ý định. Mô hình không cung cấp giá, phòng trống, điểm đánh giá hoặc điều kiện hoàn tiền.
4. Trợ lý trả lời trực tiếp bằng dữ liệu vừa lấy. Khi thiếu khách sạn/ngày ở hoặc nguồn dữ liệu lỗi, nó hỏi thông tin còn thiếu hoặc báo chưa xác minh được.

So sánh theo số thứ tự được gắn với ID của các thẻ vừa hiển thị, giữ đúng thứ tự người dùng yêu cầu (ví dụ `1,3`, `2 và 3`, `thứ nhất với thứ ba`, `đầu tiên và cuối cùng`). Cùng một bộ giải tham chiếu dùng cho khách sạn và loại phòng. Số không có trong danh sách, lựa chọn trùng nhau hoặc dữ liệu đã mất phải được hỏi lại, không tự thay bằng khách sạn/phòng khác. Ý định so sánh không được bị hành động tìm thêm của mô hình ghi đè; câu thật sự yêu cầu lựa chọn khác vẫn giữ phân trang.

Kiểm tra hội thoại so sánh với mô hình nội bộ và danh mục công khai thật: `scripts/verify-local-assistant.ps1 -CatalogNetwork smart-hotel-booking-system_default -SemanticNetwork smart-hotel-booking-system_semantic-internal -Scenario comparisons`. Bằng chứng: `docs/assistant-comparison-verification.json`; kiểm thử dùng JWT riêng của container tạm, không dùng thông tin đăng nhập khách hàng.

Ví dụ “bạn xem phòng nào được nhất” và “tôi hỏi bạn phòng nào được nhất trong các phòng ở khách sạn đó” đều được giải quyết theo khách sạn đang xem. “Có cái nào đỡ tốn hơn không?” chuyển sang ưu tiên phòng có giá cơ bản thấp nhất trong các phòng đủ chỗ. Câu tìm khách sạn mới có địa điểm rõ được xử lý như một yêu cầu mới.

## Nguồn dữ liệu

- Hotel Service: khách sạn, loại phòng, diện tích, giường, sức chứa, tiện nghi, giá cơ bản và giờ nhận/trả.
- Booking Service: phòng bị giữ theo ngày, đánh giá khách thật và đơn của tài khoản đã xác thực. Đơn cá nhân chỉ lấy qua `/api/bookings/me` với token của người đang đăng nhập.
- Điều kiện hoàn của đơn dùng `roomRefundableSnapshot`, không lấy cấu hình loại phòng đã bị thay đổi sau khi đặt.
- Hướng dẫn nghiệp vụ được kiểm soát trong `SystemKnowledgeService`; `semantic-service/intents.json` chỉ chứa câu tham chiếu và nhãn, không sao chép dữ liệu hay giá của khách hàng.

Giá trong gợi ý phòng là **giá cơ bản/phòng/đêm**. Giá cuối cùng cần được xác nhận tại bước đặt. Chọn “phòng phù hợp” ưu tiên đủ sức chứa, phòng trống theo ngày, diện tích và các quyền lợi đã được cấu hình. Nếu thiếu giá/diện tích, trợ lý không khẳng định phòng rẻ/rộng nhất.

## Chạy

```powershell
python services/dialogue-model/download_model.py
docker compose up -d --build dialogue-model semantic-service ai-service
```

Frontend đang dùng production overlay:

```powershell
docker compose -f docker-compose.yml -f infrastructure/deploy/docker-compose.prod.yml --env-file infrastructure/deploy/.env.prod up -d --no-deps --build frontend-prod
```

Chạy Java ngoài Docker: đặt `AI_SEMANTIC_ENABLED=true`, `AI_SEMANTIC_URL=http://localhost:8091` và tự cung cấp máy chủ semantic nội bộ tại địa chỉ đó. Compose mặc định không publish cổng semantic ra host. Khi chủ động tắt semantic, trợ lý dùng chế độ cơ bản. Khi đã bật nhưng không nhận được kế hoạch hợp lệ, trợ lý báo chưa phân tích được yêu cầu để thử lại, không tìm khách sạn bằng tiêu chí bị thiếu; hướng dẫn nghiệp vụ đã được rà soát vẫn có đường trả lời trực tiếp.

## Không phụ thuộc API mô hình bên ngoài

- Mô hình Qwen3 GGUF Q4_K_M được tải **một lần khi thiết lập** từ `bartowski/Qwen_Qwen3-4B-Instruct-2507-GGUF`, ghim revision `ae44f08e1392f39c0e474af10c3ff8355c8b6688`, SHA-256 `2fde00ce69dd4899c70d020845e2638353015bba0fdf161b3eb965f2bca4464e`. Runtime kiểm tra checksum trước khi chạy. Tệp khoảng 2,5 GB nằm trong `services/dialogue-model/models/` và được Git bỏ qua.
- Chế độ embedding E5 còn dùng cho kiểm thử và chạy độc lập khi không đặt `DIALOGUE_MODEL_URL`; Compose hiện dùng Qwen3, không nạp E5 cùng lúc.
- Runtime chỉ đọc file mô hình nội bộ. Telemetry ONNX Runtime bị tắt.
- `semantic-service` và `dialogue-model` chỉ nằm trong mạng Docker `semantic-internal` có `internal: true`, không publish cổng ra ngoài. Runtime llama.cpp cũng được ghim theo digest image.
- Không có API key của nhà cung cấp mô hình. Không gửi token, toàn bộ bản ghi đặt phòng hoặc danh sách khách hàng vào mô hình; chỉ nội dung câu hỏi và cờ có ngữ cảnh khách sạn hay không được xử lý trong dịch vụ nội bộ.
- Tham khảo mô hình: https://huggingface.co/Xenova/multilingual-e5-small và báo cáo gốc https://arxiv.org/abs/2402.05672.

Metadata phản hồi có `model=enziuroom-local-v5`, `engine.externalModelUsed=false`. Khi mô hình đã được dùng, `engine.mode=LOCAL_SEMANTIC_AND_SYSTEM_DATA`, `engine.semanticUnderstandingUsed=true` và `engine.semanticModel=Qwen3-4B-Instruct-2507-Q4_K_M`. Khi không dùng suy luận semantic, mode là `LOCAL_RULES_AND_SYSTEM_DATA`, cờ semantic bằng false; khi semantic đã bật nhưng lỗi, câu trả lời là yêu cầu thử lại thay vì danh sách từ quy tắc cơ bản. Nhãn không tự chứng minh hoạt động mạng; cần đối chiếu cấu hình mạng và kiểm thử dưới đây. `confidence=1` trong giao thức router Qwen là dấu hiệu JSON đã hợp lệ, **không phải xác suất câu hỏi được hiểu đúng** và không hiển thị như tỷ lệ chắc chắn cho người dùng.

## Kiểm thử

```powershell
cd services/ai-service
.\mvnw.cmd test
# Từ thư mục gốc:
node --test frontend/src/ai/assistantPresentation.test.js
docker run --rm --network none enziu-semantic-service python -m unittest test_semantics test_grounding -v
.\scripts\verify-local-assistant.ps1 -CatalogNetwork smart-hotel-booking-system_default -SemanticNetwork smart-hotel-booking-system_semantic-internal
```

Kiểm thử semantic dùng những câu không trùng nguyên văn với câu tham chiếu. Script xác minh chạy hai container tạm: một container không có mạng để kiểm tra fallback, một container chỉ đọc API danh mục/phòng trống/đánh giá công khai và dịch vụ semantic nội bộ để tái hiện các câu trong ảnh bằng dữ liệu thật. JWT kiểm thử không phải token khách hàng; container tạm tự được xóa khi xong.

Báo cáo: `docs/assistant-local-verification.json`. Đây là ảnh chụp tại thời điểm kiểm tra; giá và số phòng có thể thay đổi.

## Giao diện

Chatbox giữ khách sạn đang hỏi ở thanh ngữ cảnh, dùng thẻ phòng ngắn gọn và ưu tiên đưa đầu câu trả lời mới vào vùng nhìn thấy. Phiên bản kỹ thuật không bị lặp lại trong từng tin nhắn. Chuyến đi mở khi cần; phần nhập hỗ trợ Enter để gửi, Shift+Enter để xuống dòng và Escape để thu nhỏ. Bố cục đã kiểm tra với dữ liệu minh họa trên desktop và màn hình 375px.

Để xem lại fixture giao diện độc lập (không đăng nhập và không gọi API thật):

```powershell
node scripts/preview-assistant.mjs
# http://localhost:5179/__assistant-preview
```

Khi nghiệp vụ thay đổi, cập nhật nội dung hướng dẫn và kiểm thử tương ứng. Việc bổ sung câu tham chiếu không tự huấn luyện lại trọng số mô hình; các câu mơ hồ vẫn có thể cần làm rõ.

## Bộ nhớ tìm kiếm và yêu cầu “khác”

Tìm khách sạn gần địa danh hỗ trợ bán kính 0,1–100 km (mặc định 5 km), xếp theo khoảng cách đường chim bay từ tọa độ thật; không tự suy ra thời gian đi đường. Yêu cầu khách sạn mới được ưu tiên hơn ngữ cảnh xem phòng. T3 Tân Sơn Nhất có bản ghi bản đồ đã kiểm chứng; địa danh khác tra Photon với cache và xử lý trùng tên/lỗi nguồn. `AI_PLACES_BASE_URL` cho phép thay bằng Photon tự vận hành; `AI_PLACES_ENABLED=false` tắt tra cứu ngoài và giữ các bản ghi cục bộ. Không gửi hội thoại hay dữ liệu khách hàng sang dịch vụ bản đồ, không sử dụng AI bên ngoài. Xem phạm vi/nguồn trong `docs/assistant-answer-contract.md`.

Bộ nhận diện trả về cả chủ đề (`intent`) lẫn hành động hội thoại (`conversationAction`): tìm mới, xem khách sạn khác, điều chỉnh tiêu chí hoặc kiểm tra lại chuyến đi. “Tôi cần phòng ở Sài Gòn” là tìm khách sạn tại Hồ Chí Minh, không yêu cầu người dùng phải biết tên khách sạn trước.

Frontend gửi `conversationContext.shownHotelIds`, `lastHotelSearch` và `lastIntent` từ những thẻ thực sự đã hiển thị. Bộ nhớ này độc lập với 8 tin nhắn văn bản gần nhất. `MORE_HOTELS` giữ khu vực, ngân sách, hạng sao, tiện nghi và số khách; chỉ đổi ngày/số khách khi người dùng thực sự cập nhật. Backend đọc lại dữ liệu hệ thống rồi loại các ID đã hiển thị, không tự lấy lại danh sách đầu tiên. Khi không còn khách sạn phù hợp chưa giới thiệu, phản hồi báo rõ đã hết lựa chọn theo tiêu chí hiện tại.

Tìm mới, thay tiêu chí và kiểm tra lại chuyến đi bắt đầu một bộ kết quả mới, nên khách sạn cũ có thể xuất hiện lại hợp lệ trong các trường hợp đó. Kết quả tìm nhiều khách sạn không tự ghim khách sạn đầu tiên làm ngữ cảnh chọn phòng. Nút cập nhật ngày luôn gửi hành động kiểm tra lại, thay vì lặp câu hỏi gần nhất của người dùng.

Script xác minh hiện tái hiện toàn bộ chuỗi “Tôi cần phòng ở Sài Gòn” → nhiều lần “còn khách sạn nào khác không” → hết kết quả → kiểm tra lại với ngày mới. Báo cáo chứa ID từng khách sạn qua từng lượt và kiểm tra không có ID lặp.

Phiên bản v5 dùng cùng tiêu chí có cấu trúc xuyên suốt tìm khách sạn, chọn phòng, so sánh và hỏi lựa chọn khác. Điều kiện bữa sáng/hoàn tiền được kiểm tra trên từng loại phòng; tên tiện nghi được chuẩn hóa với dữ liệu thực tế như “Wi-Fi miễn phí” hoặc “Bãi đậu xe”. Khi lấy báo giá, frontend giữ ID loại phòng backend đã xác minh; nếu loại phòng đó không còn phù hợp/trống thì báo lại, không tự đổi sang loại khác.

Chi tiết phạm vi, giới hạn và bộ hồi quy 100 câu: [assistant-semantic-design.md](../../docs/assistant-semantic-design.md). CI chạy lại các quyết định đã ghi nhận qua bước xác minh hiện tại; kiểm thử suy luận mới và script API thật vẫn cần chạy khi đổi mô hình/prompt.

## Tiếp nối hội thoại và tư vấn trong nhóm

`CHOOSE_OPTION` đưa lời khuyên dựa trên các khách sạn vừa đối chiếu, giữ nguyên chuyến đi, không lập lại bảng hoặc tìm một nhóm khác. Thiếu đánh giá thật thì không xếp hạng dịch vụ; lợi thế tiện nghi công bố và giá cơ bản được phân biệt với chất lượng thực tế và giá sau ưu đãi. Các câu hỏi tiếp theo về phòng/đánh giá giữ danh tính khách sạn đã được nhắc rõ, nhưng dữ liệu luôn đọc lại từ nguồn.

Lớp GPU tùy chọn tại [docker-compose.gpu.yml](../../infrastructure/deploy/docker-compose.gpu.yml) tăng tốc cùng mô hình Qwen, không thay bằng API AI bên ngoài. Xem lệnh cập nhật riêng ba dịch vụ trợ lý trong [hướng dẫn triển khai](../../infrastructure/deploy/README.md). Kết quả suy luận mới trên GPU gồm 75 câu hồi quy, 25 câu nghiệm thu và 20 câu ngữ cảnh; kiểm chứng toàn luồng dùng dữ liệu công khai thật và khóa xác thực của container kiểm thử riêng.
