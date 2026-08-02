package com.smarthotel.identity.user.entity;

/**
 * Vai trò của người dùng trong hệ thống.
 *
 * CUSTOMER:
 * Khách hàng tìm kiếm và đặt phòng.
 *
 * HOTEL_ADMIN:
 * Quản trị viên của một hoặc nhiều khách sạn.
 *
 * SYSTEM_ADMIN:
 * Quản trị viên toàn hệ thống.
 */
public enum UserRole {

    CUSTOMER,

    HOTEL_ADMIN,

    SYSTEM_ADMIN
}