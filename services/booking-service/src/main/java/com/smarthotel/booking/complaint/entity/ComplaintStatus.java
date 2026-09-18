package com.smarthotel.booking.complaint.entity;

public enum ComplaintStatus {
    SUBMITTED,
    UNDER_REVIEW,
    WAITING_FOR_HOTEL,
    WAITING_FOR_CUSTOMER,
    RESOLVING,
    ESCALATED,
    SYSTEM_REVIEW,
    HOTEL_ACTION_REQUIRED,
    AWAITING_SYSTEM_CONFIRMATION,
    RESOLVED,
    REJECTED,
    CANCELLED;

    public boolean isTerminal() {
        return this == RESOLVED || this == REJECTED || this == CANCELLED;
    }
}
