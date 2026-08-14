package com.smarthotel.payment;

import com.smarthotel.payment.payos.config.PayOsPayoutProperties;
import com.smarthotel.payment.payos.config.PayOsProperties;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.scheduling.annotation.EnableScheduling;

@SpringBootApplication
@EnableScheduling
@EnableConfigurationProperties({PayOsProperties.class, PayOsPayoutProperties.class})
public class PaymentServiceApplication {
    public static void main(String[] args) {
        SpringApplication.run(PaymentServiceApplication.class, args);
    }
}
