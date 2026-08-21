package com.smarthotel.payment.refund.dto;

import jakarta.validation.constraints.Size;

public record ReviewRefundRequest(@Size(max = 1000) String note) {}
