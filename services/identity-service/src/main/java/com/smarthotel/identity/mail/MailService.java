package com.smarthotel.identity.mail;

import com.smarthotel.identity.common.exception.MailDeliveryException;
import com.smarthotel.identity.user.entity.User;
import org.springframework.mail.MailException;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.MimeMessageHelper;
import org.springframework.stereotype.Service;

import jakarta.mail.MessagingException;
import jakarta.mail.internet.MimeMessage;

import java.nio.charset.StandardCharsets;

@Service
public class MailService {

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
        String verificationUrl =
                properties.publicBaseUrl()
                        + "/api/auth/verify-email?token="
                        + rawToken;

        String subject =
                "Xác thực tài khoản Smart Hotel";

        String html = """
                <html>
                <body style="font-family: Arial, sans-serif">
                    <h2>Xin chào %s!</h2>

                    <p>
                        Bạn vừa đăng ký tài khoản
                        Smart Hotel Booking System.
                    </p>

                    <p>
                        Hãy nhấn nút bên dưới để xác thực email:
                    </p>

                    <p>
                        <a href="%s"
                           style="
                               display:inline-block;
                               padding:12px 20px;
                               background:#2563eb;
                               color:white;
                               text-decoration:none;
                               border-radius:6px;
                           ">
                            Xác thực email
                        </a>
                    </p>

                    <p>
                        Liên kết có hiệu lực trong 24 giờ.
                    </p>

                    <p>
                        Nếu bạn không đăng ký tài khoản,
                        hãy bỏ qua email này.
                    </p>
                </body>
                </html>
                """.formatted(
                escapeHtml(user.getFullName()),
                verificationUrl
        );

        sendHtml(
                user.getEmail(),
                subject,
                html
        );
    }

    public void sendPasswordResetEmail(
            User user,
            String rawToken
    ) {
        String subject =
                "Đặt lại mật khẩu Smart Hotel";

        String html = """
                <html>
                <body style="font-family: Arial, sans-serif">
                    <h2>Xin chào %s!</h2>

                    <p>
                        Hệ thống nhận được yêu cầu
                        đặt lại mật khẩu của bạn.
                    </p>

                    <p>
                        Mã đặt lại mật khẩu:
                    </p>

                    <p style="
                        font-size:16px;
                        font-weight:bold;
                        word-break:break-all;
                        padding:12px;
                        background:#f3f4f6;
                    ">
                        %s
                    </p>

                    <p>
                        Token có hiệu lực trong 30 phút.
                    </p>

                    <p>
                        Gửi token này đến:
                    </p>

                    <pre>
POST /api/auth/reset-password
{
  "token": "...",
  "newPassword": "..."
}
                    </pre>

                    <p>
                        Nếu bạn không yêu cầu đổi mật khẩu,
                        hãy bỏ qua email này.
                    </p>
                </body>
                </html>
                """.formatted(
                escapeHtml(user.getFullName()),
                escapeHtml(rawToken)
        );

        sendHtml(
                user.getEmail(),
                subject,
                html
        );
    }

    private void sendHtml(
            String recipient,
            String subject,
            String html
    ) {
        try {
            MimeMessage message =
                    mailSender.createMimeMessage();

            MimeMessageHelper helper =
                    new MimeMessageHelper(
                            message,
                            false,
                            StandardCharsets.UTF_8.name()
                    );

            helper.setFrom(properties.from());
            helper.setTo(recipient);
            helper.setSubject(subject);
            helper.setText(html, true);

            mailSender.send(message);

        } catch (MessagingException | MailException exception) {
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