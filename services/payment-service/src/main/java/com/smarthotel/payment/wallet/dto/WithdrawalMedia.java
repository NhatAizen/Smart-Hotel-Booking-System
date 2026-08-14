package com.smarthotel.payment.wallet.dto;

public record WithdrawalMedia(byte[] data, String contentType, String fileName) {}
