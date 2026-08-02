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


FROM eclipse-temurin:17-jre-alpine

WORKDIR /app

RUN addgroup -S spring && adduser -S spring -G spring

USER spring:spring

COPY --from=builder /app/target/booking-service-0.0.1-SNAPSHOT.jar /app/app.jar

EXPOSE 8083

ENTRYPOINT ["java", "-XX:MaxRAMPercentage=75.0", "-Djava.security.egd=file:/dev/./urandom", "-jar", "/app/app.jar"]