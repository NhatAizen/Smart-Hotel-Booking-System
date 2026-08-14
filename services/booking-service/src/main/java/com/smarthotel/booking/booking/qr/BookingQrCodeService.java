package com.smarthotel.booking.booking.qr;

import com.google.zxing.BarcodeFormat;
import com.google.zxing.EncodeHintType;
import com.google.zxing.WriterException;
import com.google.zxing.client.j2se.MatrixToImageWriter;
import com.google.zxing.common.BitMatrix;
import com.google.zxing.qrcode.QRCodeWriter;
import com.google.zxing.qrcode.decoder.ErrorCorrectionLevel;
import org.springframework.stereotype.Service;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.util.Map;

@Service
public class BookingQrCodeService {

    private static final int SIZE = 420;

    public byte[] generatePng(String payload) {
        if (payload == null || payload.isBlank()) {
            throw new IllegalArgumentException("Dữ liệu QR check-in không được để trống");
        }

        try {
            BitMatrix matrix = new QRCodeWriter().encode(
                    payload,
                    BarcodeFormat.QR_CODE,
                    SIZE,
                    SIZE,
                    Map.of(
                            EncodeHintType.CHARACTER_SET, "UTF-8",
                            EncodeHintType.ERROR_CORRECTION, ErrorCorrectionLevel.M,
                            EncodeHintType.MARGIN, 2
                    )
            );

            try (ByteArrayOutputStream output = new ByteArrayOutputStream()) {
                MatrixToImageWriter.writeToStream(matrix, "PNG", output);
                return output.toByteArray();
            }
        } catch (WriterException | IOException exception) {
            throw new IllegalStateException("Không thể tạo mã QR check-in", exception);
        }
    }
}
