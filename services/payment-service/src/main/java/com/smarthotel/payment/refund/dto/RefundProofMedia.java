package com.smarthotel.payment.refund.dto;

public record RefundProofMedia(byte[] data, String contentType, String fileName) {}
