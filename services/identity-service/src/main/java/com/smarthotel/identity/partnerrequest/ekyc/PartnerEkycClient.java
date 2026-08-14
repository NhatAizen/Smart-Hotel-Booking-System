package com.smarthotel.identity.partnerrequest.ekyc;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.smarthotel.identity.partnerrequest.config.PartnerEkycProperties;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;
import org.springframework.web.multipart.MultipartFile;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.Base64;
import java.util.Locale;
import java.util.UUID;

@Component
public class PartnerEkycClient {

    private static final Logger log = LoggerFactory.getLogger(PartnerEkycClient.class);
    private static final String INTERNAL_KEY_HEADER = "X-Internal-Api-Key";
    private static final String CRLF = "\r\n";

    private final PartnerEkycProperties properties;
    private final RestClient restClient;
    private final ObjectMapper objectMapper;
    private final HttpClient httpClient;

    public PartnerEkycClient(
            PartnerEkycProperties properties,
            ObjectMapper objectMapper
    ) {
        this.properties = properties;
        this.objectMapper = objectMapper;
        // Uvicorn/FastAPI in ekyc-service serves HTTP/1.1.
        // JDK HttpClient otherwise prefers HTTP/2 and may attempt an h2c upgrade
        // on the clear-text Docker network. Uvicorn rejects that upgrade, which
        // can corrupt large POST requests and surface as HTTP 400 /
        // "Invalid HTTP request received" before FastAPI reaches the route.
        this.httpClient = HttpClient.newBuilder()
                .version(HttpClient.Version.HTTP_1_1)
                .connectTimeout(Duration.ofSeconds(properties.connectTimeoutSeconds()))
                .build();

        JdkClientHttpRequestFactory requestFactory =
                new JdkClientHttpRequestFactory(this.httpClient);
        requestFactory.setReadTimeout(
                Duration.ofSeconds(properties.readTimeoutSeconds())
        );

        this.restClient = RestClient.builder()
                .baseUrl(properties.baseUrl())
                .requestFactory(requestFactory)
                .build();
    }

    public PartnerEkycChallengeResponse createChallenge(UUID userId) {
        try {
            PartnerEkycChallengeResponse response = restClient.post()
                    .uri("/internal/v1/challenges/{userId}", userId.toString())
                    .header(INTERNAL_KEY_HEADER, properties.internalApiKey())
                    .retrieve()
                    .body(PartnerEkycChallengeResponse.class);

            if (response == null || response.challengeToken() == null) {
                throw new PartnerEkycVerificationException(
                        "Dịch vụ eKYC không tạo được thử thách xác minh"
                );
            }
            return response;
        } catch (RestClientResponseException exception) {
            throw mapRemoteException(exception);
        } catch (PartnerEkycVerificationException exception) {
            throw exception;
        } catch (Exception exception) {
            throw new PartnerEkycVerificationException(
                    "Không thể kết nối dịch vụ eKYC. Vui lòng thử lại sau.",
                    exception
            );
        }
    }

    /**
     * Internal Identity -> eKYC transport uses JSON/Base64.
     *
     * Browser -> Identity remains multipart as before. We intentionally avoid
     * multipart on the service-to-service hop because different HTTP clients,
     * reverse proxies and multipart parsers can reject the body with HTTP 400
     * or report all parts as missing. JSON is deterministic and deploy-safe.
     */
    public PartnerEkycVerificationResult verify(
            UUID userId,
            String challengeToken,
            MultipartFile cccdFront,
            MultipartFile frame0,
            MultipartFile frame1,
            MultipartFile frame2
    ) {
        try {
            byte[] idBytes = requireImageBytes(cccdFront, "cccdFront");
            byte[] frame0Bytes = requireImageBytes(frame0, "frame0");
            byte[] frame1Bytes = requireImageBytes(frame1, "frame1");
            byte[] frame2Bytes = requireImageBytes(frame2, "frame2");

            var payload = objectMapper.createObjectNode();
            payload.put("userId", userId.toString());
            payload.put("challengeToken", challengeToken);
            payload.put("cccdFrontBase64", Base64.getEncoder().encodeToString(idBytes));
            payload.put("frame0Base64", Base64.getEncoder().encodeToString(frame0Bytes));
            payload.put("frame1Base64", Base64.getEncoder().encodeToString(frame1Bytes));
            payload.put("frame2Base64", Base64.getEncoder().encodeToString(frame2Bytes));

            byte[] body = objectMapper.writeValueAsBytes(payload);

            HttpRequest request = HttpRequest.newBuilder()
                    .uri(URI.create(trimTrailingSlash(properties.baseUrl()) + "/internal/v1/verify-json"))
                    .timeout(Duration.ofSeconds(properties.readTimeoutSeconds()))
                    .header(INTERNAL_KEY_HEADER, properties.internalApiKey())
                    .header("Content-Type", "application/json; charset=UTF-8")
                    .header("Accept", "application/json")
                    .POST(HttpRequest.BodyPublishers.ofByteArray(body))
                    .build();

            HttpResponse<byte[]> remote = httpClient.send(
                    request,
                    HttpResponse.BodyHandlers.ofByteArray()
            );

            String responseBody = new String(remote.body(), StandardCharsets.UTF_8);
            if (remote.statusCode() < 200 || remote.statusCode() >= 300) {
                throw mapRemoteStatus(remote.statusCode(), responseBody, null);
            }

            PartnerEkycVerificationResult response = objectMapper.readValue(
                    remote.body(),
                    PartnerEkycVerificationResult.class
            );
            if (response == null) {
                throw new PartnerEkycVerificationException(
                        "Dịch vụ eKYC không trả về kết quả xác minh"
                );
            }
            // A face that has not passed yet is an expected eKYC scanning state,
            // not a transport/system error. Return the structured checks so the
            // browser can keep the same camera session open and automatically
            // sample again without creating another challenge.
            return response;
        } catch (PartnerEkycVerificationException exception) {
            throw exception;
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            throw new PartnerEkycVerificationException(
                    "Xác minh eKYC bị gián đoạn. Vui lòng thử lại.",
                    exception
            );
        } catch (Exception exception) {
            throw new PartnerEkycVerificationException(
                    "Không thể hoàn tất xác minh eKYC. Vui lòng thử lại.",
                    exception
            );
        }
    }

    private byte[] requireImageBytes(MultipartFile file, String label) throws IOException {
        if (file == null || file.isEmpty()) {
            throw new PartnerEkycVerificationException("Thiếu ảnh eKYC bắt buộc: " + label);
        }
        return file.getBytes();
    }

    private byte[] buildMultipartBody(
            String boundary,
            String userId,
            String challengeToken,
            MultipartFile cccdFront,
            MultipartFile frame0,
            MultipartFile frame1,
            MultipartFile frame2
    ) throws IOException {
        ByteArrayOutputStream output = new ByteArrayOutputStream();

        writeTextPart(output, boundary, "userId", userId);
        writeTextPart(output, boundary, "challengeToken", challengeToken);
        writeFilePart(output, boundary, "cccdFront", cccdFront, "cccd-front.jpg");
        writeFilePart(output, boundary, "frame0", frame0, "liveness-0.jpg");
        writeFilePart(output, boundary, "frame1", frame1, "liveness-1.jpg");
        writeFilePart(output, boundary, "frame2", frame2, "liveness-2.jpg");
        writeUtf8(output, "--" + boundary + "--" + CRLF);

        return output.toByteArray();
    }

    private void writeTextPart(
            ByteArrayOutputStream output,
            String boundary,
            String name,
            String value
    ) {
        writeUtf8(output, "--" + boundary + CRLF);
        writeUtf8(output, "Content-Disposition: form-data; name=\"" + name + "\"" + CRLF);
        writeUtf8(output, "Content-Type: text/plain; charset=UTF-8" + CRLF + CRLF);
        writeUtf8(output, value == null ? "" : value);
        writeUtf8(output, CRLF);
    }

    private void writeFilePart(
            ByteArrayOutputStream output,
            String boundary,
            String name,
            MultipartFile file,
            String fallbackName
    ) throws IOException {
        if (file == null || file.isEmpty()) {
            throw new PartnerEkycVerificationException(
                    "Thiếu ảnh eKYC bắt buộc: " + name
            );
        }

        String filename = sanitizeFilename(file.getOriginalFilename(), fallbackName);
        String contentType = normalizeImageContentType(file.getContentType());

        writeUtf8(output, "--" + boundary + CRLF);
        writeUtf8(
                output,
                "Content-Disposition: form-data; name=\"" + name
                        + "\"; filename=\"" + filename + "\"" + CRLF
        );
        writeUtf8(output, "Content-Type: " + contentType + CRLF + CRLF);
        output.write(file.getBytes());
        writeUtf8(output, CRLF);
    }

    private void writeUtf8(ByteArrayOutputStream output, String value) {
        output.writeBytes(value.getBytes(StandardCharsets.UTF_8));
    }

    private String normalizeImageContentType(String value) {
        if (value == null || value.isBlank()) {
            return "image/jpeg";
        }
        String normalized = value.trim().toLowerCase(Locale.ROOT);
        return normalized.startsWith("image/") ? normalized : "image/jpeg";
    }

    private String sanitizeFilename(String original, String fallback) {
        String value = original == null || original.isBlank() ? fallback : original;
        value = value.replace("\r", "_").replace("\n", "_").replace("\"", "_");
        return value.isBlank() ? fallback : value;
    }

    private String trimTrailingSlash(String value) {
        String normalized = value == null ? "" : value.trim();
        while (normalized.endsWith("/")) {
            normalized = normalized.substring(0, normalized.length() - 1);
        }
        return normalized;
    }

    private PartnerEkycVerificationException mapRemoteException(
            RestClientResponseException exception
    ) {
        return mapRemoteStatus(
                exception.getStatusCode().value(),
                exception.getResponseBodyAsString(),
                exception
        );
    }

    private PartnerEkycVerificationException mapRemoteStatus(
            int status,
            String responseBody,
            Throwable cause
    ) {
        String safeBody = responseBody == null ? "" : responseBody.replaceAll("[\r\n]+", " ");
        if (safeBody.length() > 1200) safeBody = safeBody.substring(0, 1200) + "...";
        log.warn("eKYC service rejected request: status={}, body={}", status, safeBody);

        String message = extractRemoteMessage(responseBody);

        if (status == 401 || status == 403) {
            message = "Cấu hình bảo mật giữa Identity Service và eKYC Service không khớp. Hãy kiểm tra EKYC_INTERNAL_API_KEY rồi rebuild hai service.";
        } else if (status == 429 && (message == null || message.isBlank())) {
            message = "Bạn đã thử eKYC quá nhiều lần. Vui lòng chờ vài phút rồi thử lại.";
        } else if (status == 422 && message != null && message.contains("Field required")) {
            message = "Dữ liệu nội bộ gửi sang eKYC Service chưa đúng định dạng multipart. Hãy rebuild đồng thời Identity Service và eKYC Service bằng cùng bản source.";
        } else if (message == null || message.isBlank()) {
            if (status == 422) {
                message = "Dịch vụ eKYC từ chối dữ liệu xác minh (422). Hãy thực hiện lại camera eKYC.";
            } else {
                message = status >= 500
                        ? "Dịch vụ eKYC đang tạm thời không khả dụng"
                        : "Dịch vụ eKYC từ chối yêu cầu (HTTP " + status + "). Hãy xem log ekyc-service để biết chi tiết.";
            }
        }

        return cause == null
                ? new PartnerEkycVerificationException(message)
                : new PartnerEkycVerificationException(message, cause);
    }

    private String extractRemoteMessage(String responseBody) {
        String message = null;
        try {
            JsonNode node = objectMapper.readTree(responseBody == null ? "" : responseBody);
            if (node.hasNonNull("detail")) {
                JsonNode detail = node.get("detail");
                if (detail.isTextual()) {
                    message = detail.asText();
                } else if (detail.isArray()) {
                    StringBuilder builder = new StringBuilder();
                    for (JsonNode item : detail) {
                        String field = "";
                        JsonNode loc = item.get("loc");
                        if (loc != null && loc.isArray() && !loc.isEmpty()) {
                            JsonNode last = loc.get(loc.size() - 1);
                            field = last == null ? "" : last.asText();
                        }
                        String part = item.hasNonNull("msg")
                                ? item.get("msg").asText()
                                : item.toString();
                        if (!part.isBlank()) {
                            if (!builder.isEmpty()) builder.append("; ");
                            if (!field.isBlank()) builder.append(field).append(": ");
                            builder.append(part);
                        }
                    }
                    message = builder.toString();
                }
            }
            if ((message == null || message.isBlank()) && node.hasNonNull("message")) {
                message = node.get("message").asText();
            }
        } catch (Exception ignored) {
            // Fall through to a stable user-facing message.
        }
        return message;
    }

    private String buildVerificationMessage(PartnerEkycVerificationResult result) {
        var checks = result.checks();
        if (checks != null) {
            if (Boolean.FALSE.equals(checks.get("idImageQualityPassed"))) {
                return "Ảnh chân dung trên CCCD chưa đủ rõ để đối chiếu khuôn mặt. Hãy dùng ảnh CCCD mặt trước rõ hơn, không lóa và không rung.";
            }
            if (Boolean.FALSE.equals(checks.get("liveImageQualityPassed"))) {
                return "Ảnh camera chưa đủ rõ hoặc ánh sáng chưa phù hợp. Hãy nhìn thẳng, đứng nơi đủ sáng và giữ camera ổn định.";
            }
            if (Boolean.FALSE.equals(checks.get("imageQualityPassed"))) {
                return "Chất lượng ảnh eKYC chưa đạt. Hãy kiểm tra lại ảnh CCCD và camera trong điều kiện đủ sáng.";
            }
            if (Boolean.FALSE.equals(checks.get("allFrontPosePassed"))) {
                return "Khuôn mặt chưa ở tư thế chính diện ổn định. Hãy nhìn thẳng vào camera và giữ mặt trong khung oval.";
            }
            if (Boolean.FALSE.equals(checks.get("liveFramesDifferent"))) {
                return "Các ảnh chính diện quá giống nhau để xác nhận phiên camera sống. Hãy giữ mặt tự nhiên, chớp mắt và thử quét lại.";
            }
            if (Boolean.FALSE.equals(checks.get("samePersonAcrossLiveFrames"))) {
                return "Khuôn mặt giữa các bước camera không nhất quán. Chỉ một người được xuất hiện trong toàn bộ quá trình eKYC.";
            }
            if (Boolean.FALSE.equals(checks.get("idFaceMatched"))) {
                return "Khuôn mặt trực tiếp không đủ tương đồng với ảnh chân dung trên CCCD.";
            }
        }
        if (!result.livenessVerified()) {
            return "Không xác minh được phiên camera sống. Hãy nhìn thẳng, giữ mặt rõ và chớp mắt tự nhiên trong lúc quét.";
        }
        if (!result.faceVerified()) {
            return "Khuôn mặt trực tiếp không đủ tương đồng với ảnh chân dung trên CCCD.";
        }
        return "Xác minh eKYC chưa đạt yêu cầu.";
    }
}
