# =========================================================
# STAGE 1: BUILD SOURCE CODE THÀNH FILE JAR
# =========================================================
FROM eclipse-temurin:17-jdk-alpine AS builder

WORKDIR /app

COPY .mvn .mvn
COPY mvnw .
COPY mvnw.cmd .
COPY pom.xml .

RUN chmod +x mvnw

RUN ./mvnw --batch-mode --no-transfer-progress dependency:go-offline

COPY src src

RUN ./mvnw --batch-mode --no-transfer-progress clean package -DskipTests


# =========================================================
# STAGE 2: CHẠY ỨNG DỤNG
# =========================================================
FROM eclipse-temurin:17-jre-alpine

WORKDIR /app

# OCR CCCD chạy hoàn toàn trong container, không gửi ảnh sang dịch vụ bên thứ ba.
RUN apk add --no-cache \
    tesseract-ocr \
    tesseract-ocr-data-vie \
    tesseract-ocr-data-eng

RUN addgroup -S spring && adduser -S spring -G spring
RUN mkdir -p /app/uploads/profiles /app/uploads/partner-documents && chown -R spring:spring /app/uploads

USER spring:spring

COPY --from=builder /app/target/identity-service-0.0.1-SNAPSHOT.jar /app/app.jar

EXPOSE 8081

ENTRYPOINT ["java", "-XX:MaxRAMPercentage=75.0", "-Djava.security.egd=file:/dev/./urandom", "-jar", "/app/app.jar"]