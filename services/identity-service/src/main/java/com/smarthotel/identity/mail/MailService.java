package com.smarthotel.identity.mail;

import com.smarthotel.identity.common.exception.MailDeliveryException;
import com.smarthotel.identity.user.entity.User;
import jakarta.mail.MessagingException;
import jakarta.mail.internet.InternetAddress;
import jakarta.mail.internet.MimeMessage;
import org.springframework.mail.MailException;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.MimeMessageHelper;
import org.springframework.stereotype.Service;
import org.springframework.web.util.UriComponentsBuilder;

import java.io.UnsupportedEncodingException;
import java.nio.charset.StandardCharsets;

@Service
public class MailService {

    private static final String APP_NAME = "EnziuRooms";

    private final JavaMailSender mailSender;
    private final AppMailProperties properties;

    public MailService(
            JavaMailSender mailSender,
            AppMailProperties properties
    ) {
        this.mailSender = mailSender;
        this.properties = properties;
    }

    public void sendVerificationEmail(
            User user,
            String rawToken
    ) {
        String verificationUrl = UriComponentsBuilder
                .fromUriString(properties.frontendBaseUrl())
                .path("/verify-email")
                .queryParam("token", rawToken)
                .build()
                .encode(StandardCharsets.UTF_8)
                .toUriString();

        String subject = "Xác thực tài khoản EnziuRooms";

        String html = """
                <!DOCTYPE html>
                <html lang="vi">
                <head>
                    <meta charset="UTF-8">
                    <meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                    <title>Xác thực tài khoản EnziuRooms</title>
                </head>
                <body style="margin:0;padding:0;background:#f3f6fa;font-family:Arial,Helvetica,sans-serif;color:#172b4d;">
                    <table role="presentation" width="100%%" cellspacing="0" cellpadding="0" border="0" style="width:100%%;background:#f3f6fa;padding:32px 12px;">
                        <tr>
                            <td align="center">
                                <table role="presentation" width="100%%" cellspacing="0" cellpadding="0" border="0" style="width:100%%;max-width:620px;background:#ffffff;border-radius:18px;overflow:hidden;box-shadow:0 12px 35px rgba(18,55,88,0.12);">
                                    <tr>
                                        <td style="padding:26px 34px;background:#0969df;color:#ffffff;">
                                            <div style="font-size:25px;font-weight:800;letter-spacing:-0.5px;">EnziuRooms</div>
                                            <div style="margin-top:5px;font-size:14px;opacity:0.92;">Đặt phòng khách sạn thông minh</div>
                                        </td>
                                    </tr>
                                    <tr>
                                        <td style="padding:34px;">
                                            <h1 style="margin:0 0 16px;font-size:25px;line-height:1.3;color:#15243a;">Xin chào %s!</h1>
                                            <p style="margin:0 0 14px;font-size:15px;line-height:1.7;color:#516173;">Cảm ơn bạn đã đăng ký tài khoản tại EnziuRooms.</p>
                                            <p style="margin:0 0 24px;font-size:15px;line-height:1.7;color:#516173;">Vui lòng nhấn nút bên dưới để xác thực địa chỉ email và kích hoạt tài khoản của bạn.</p>
                                            <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                                                <tr>
                                                    <td style="border-radius:10px;background:#0969df;">
                                                        <a href="%s" style="display:inline-block;padding:14px 24px;color:#ffffff;text-decoration:none;font-size:15px;font-weight:700;border-radius:10px;">Xác thực email</a>
                                                    </td>
                                                </tr>
                                            </table>
                                            <p style="margin:24px 0 8px;font-size:13px;line-height:1.6;color:#748296;">Liên kết xác thực có hiệu lực trong 24 giờ và chỉ sử dụng được một lần.</p>
                                            <p style="margin:0;font-size:13px;line-height:1.6;color:#748296;">Nếu bạn không đăng ký tài khoản này, hãy bỏ qua email.</p>
                                            <div style="margin-top:26px;padding-top:20px;border-top:1px solid #e7edf4;">
                                                <p style="margin:0 0 8px;font-size:12px;color:#8996a8;">Nếu nút không hoạt động, hãy sao chép liên kết sau vào trình duyệt:</p>
                                                <p style="margin:0;word-break:break-all;font-size:12px;color:#0969df;">%s</p>
                                            </div>
                                        </td>
                                    </tr>
                                    <tr>
                                        <td style="padding:18px 34px;background:#f8fafc;text-align:center;font-size:12px;color:#8b98a8;">© EnziuRooms · Email tự động, vui lòng không trả lời.</td>
                                    </tr>
                                </table>
                            </td>
                        </tr>
                    </table>
                </body>
                </html>
                """.formatted(
                escapeHtml(user.getFullName()),
                escapeHtml(verificationUrl),
                escapeHtml(verificationUrl)
        );

        sendHtml(user.getEmail(), subject, html);
    }

    public void sendPasswordResetEmail(
            User user,
            String rawToken
    ) {
        String resetUrl = UriComponentsBuilder
                .fromUriString(properties.frontendBaseUrl())
                .path("/reset-password")
                .queryParam("token", rawToken)
                .build()
                .encode(StandardCharsets.UTF_8)
                .toUriString();

        String subject = "Đặt lại mật khẩu EnziuRooms";

        String html = """
                <!DOCTYPE html>
                <html lang="vi">
                <head>
                    <meta charset="UTF-8">
                    <meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                    <title>Đặt lại mật khẩu EnziuRooms</title>
                </head>
                <body style="margin:0;padding:0;background:#f3f6fa;font-family:Arial,Helvetica,sans-serif;color:#172b4d;">
                    <table role="presentation" width="100%%" cellspacing="0" cellpadding="0" border="0" style="width:100%%;background:#f3f6fa;padding:32px 12px;">
                        <tr>
                            <td align="center">
                                <table role="presentation" width="100%%" cellspacing="0" cellpadding="0" border="0" style="width:100%%;max-width:620px;background:#ffffff;border-radius:18px;overflow:hidden;box-shadow:0 12px 35px rgba(18,55,88,0.12);">
                                    <tr>
                                        <td style="padding:26px 34px;background:#0969df;color:#ffffff;">
                                            <div style="font-size:25px;font-weight:800;">EnziuRooms</div>
                                            <div style="margin-top:5px;font-size:14px;opacity:0.92;">Yêu cầu đặt lại mật khẩu</div>
                                        </td>
                                    </tr>
                                    <tr>
                                        <td style="padding:34px;">
                                            <h1 style="margin:0 0 16px;font-size:25px;color:#15243a;">Xin chào %s!</h1>
                                            <p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:#516173;">EnziuRooms đã nhận được yêu cầu đặt lại mật khẩu cho tài khoản của bạn.</p>
                                            <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                                                <tr>
                                                    <td style="border-radius:10px;background:#0969df;">
                                                        <a href="%s" style="display:inline-block;padding:14px 24px;color:#ffffff;text-decoration:none;font-size:15px;font-weight:700;border-radius:10px;">Đặt lại mật khẩu</a>
                                                    </td>
                                                </tr>
                                            </table>
                                            <p style="margin:20px 0 8px;font-size:13px;line-height:1.6;color:#748296;">Liên kết có hiệu lực trong 30 phút và chỉ sử dụng được một lần.</p>
                                            <p style="margin:0;font-size:13px;line-height:1.6;color:#748296;">Nếu bạn không yêu cầu đổi mật khẩu, hãy bỏ qua email này.</p>
                                            <div style="margin-top:26px;padding-top:20px;border-top:1px solid #e7edf4;">
                                                <p style="margin:0 0 8px;font-size:12px;color:#8996a8;">Nếu nút không hoạt động, hãy sao chép liên kết sau:</p>
                                                <p style="margin:0;word-break:break-all;font-size:12px;color:#0969df;">%s</p>
                                            </div>
                                        </td>
                                    </tr>
                                    <tr>
                                        <td style="padding:18px 34px;background:#f8fafc;text-align:center;font-size:12px;color:#8b98a8;">© EnziuRooms · Email tự động, vui lòng không trả lời.</td>
                                    </tr>
                                </table>
                            </td>
                        </tr>
                    </table>
                </body>
                </html>
                """.formatted(
                escapeHtml(user.getFullName()),
                escapeHtml(resetUrl),
                escapeHtml(resetUrl)
        );

        sendHtml(user.getEmail(), subject, html);
    }

    private void sendHtml(
            String recipient,
            String subject,
            String html
    ) {
        try {
            MimeMessage message = mailSender.createMimeMessage();

            MimeMessageHelper helper = new MimeMessageHelper(
                    message,
                    false,
                    StandardCharsets.UTF_8.name()
            );

            helper.setFrom(new InternetAddress(
                    properties.from(),
                    APP_NAME,
                    StandardCharsets.UTF_8.name()
            ));
            helper.setTo(recipient);
            helper.setSubject(subject);
            helper.setText(html, true);

            mailSender.send(message);
        } catch (
                MessagingException
                | UnsupportedEncodingException
                | MailException exception
        ) {
            throw new MailDeliveryException(exception);
        }
    }

    private String escapeHtml(String value) {
        if (value == null) {
            return "";
        }

        return value
                .replace("&", "&amp;")
                .replace("<", "&lt;")
                .replace(">", "&gt;")
                .replace("\"", "&quot;")
                .replace("'", "&#39;");
    }
}
