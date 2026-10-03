# Security baseline remediation — 2026-10

Date: 2026-10-03 (Asia/Bangkok).

Status: **Local remediation validated; remote Security PR and Dependency Review are separate final gates.** Dependency Review is not claimed PASS while repository capability is unavailable. This is not a merge/deployment approval.

## A. Branch and scope

Branch: `fix/security-baseline-2026-10`, independently based on integration commit `4146b8c32f67f8c2621f8e856922cfe0541005ad`.
Target: `ui/enziu-home-creative-rebuild`, not the financial feature branch.

PR #6 remains at `d29672c300d59e9a61c7f16c510608f2b8c85aff`. Its source, commits and metadata are not modified by this remediation task.
The older security branch `chore/security-trivy-remediation-2026-10-02` at `5b905d0b28b3d2033bf732fcb9cafe92fc8220ec` and its historical report remain intact; selected security/test-isolation work was reused without rewriting that history. Existing security working-tree work was preserved.

No main Java business implementation was edited. No migration SQL, Customer Wallet semantics, room-change reconciliation implementation, V13/V14, production secrets, feature flags or Cloudflare configuration were changed. The independent integration base does not contain PR #6's V13/V14; they were not copied into this branch.

## B. Original baseline and exact finding ownership

Trivy 0.70.0 actually scanned a source-only Git archive of the integration base.
CI-equivalent command:

```text
trivy fs --scanners vuln,misconfig --severity HIGH,CRITICAL
  --ignore-unfixed --exit-code 1 --format json /src
```

Original result: **14 HIGH dependency occurrences + 2 HIGH Docker misconfigurations; 0 CRITICAL**.
Before JSON: `C:\Users\DELL\AppData\Local\Temp\EnziuBaseline-3fce09b52a434df286a15567e6bcea29\trivy-before.json`.
Maven filesystem analysis warns about missing BOM-managed versions; it is not proof of all resolved runtime dependencies.

Each original finding is mapped below. All nine Java services were audited even where the source scanner only resolved directly declared dependencies.

| Component | Package | Installed | ID | Severity | Fixed | Relationship | Controlling file | Applied |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| frontend | axios | 1.19.0 | CVE-2026-101898 | HIGH | 1.20.0 | direct | frontend/package.json + frontend/package-lock.json | 1.20.0 |
| frontend | axios | 1.19.0 | CVE-2026-101901 | HIGH | 1.20.0 | direct | frontend/package.json + frontend/package-lock.json | 1.20.0 |
| frontend | axios | 1.19.0 | CVE-2026-101903 | HIGH | 1.20.0 | direct | frontend/package.json + frontend/package-lock.json | 1.20.0 |
| frontend | axios | 1.19.0 | CVE-2026-101905 | HIGH | 1.20.0 | direct | frontend/package.json + frontend/package-lock.json | 1.20.0 |
| frontend | axios | 1.19.0 | CVE-2026-101906 | HIGH | 1.20.0 | direct | frontend/package.json + frontend/package-lock.json | 1.20.0 |
| frontend | axios | 1.19.0 | CVE-2026-101907 | HIGH | 1.20.0 | direct | frontend/package.json + frontend/package-lock.json | 1.20.0 |
| frontend | axios | 1.19.0 | CVE-2026-101909 | HIGH | 1.20.0 | direct | frontend/package.json + frontend/package-lock.json | 1.20.0 |
| frontend | brace-expansion | 5.0.9 | CVE-2026-102276 | HIGH | 5.0.10 | transitive (minimatch) | frontend/package-lock.json | 5.0.12 (same major patch) |
| frontend | brace-expansion | 5.0.9 | CVE-2026-102278 | HIGH | 5.0.11 | transitive (minimatch) | frontend/package-lock.json | 5.0.12 (same major patch) |
| ai-service | Actuator | 3.2.12 | CVE-2026-22733 | HIGH | 3.5.12 / 4.0.4 | direct, Boot-managed | services/ai-service/pom.xml | Boot 3.5.15 |
| api-gateway | Actuator | 3.2.12 | CVE-2026-22733 | HIGH | 3.5.12 / 4.0.4 | direct, Boot-managed | services/api-gateway/pom.xml | Boot 3.5.15 |
| booking-service | Actuator | 3.2.12 | CVE-2026-22733 | HIGH | 3.5.12 / 4.0.4 | direct, Boot-managed | services/booking-service/pom.xml | Boot 3.5.15 |
| booking-service | pgJDBC | 42.6.2 | CVE-2026-42198 | HIGH | 42.7.11 | direct, Boot-managed | services/booking-service/pom.xml | 42.7.12 (also fixes CVE-2026-54291) |
| ekyc-service | python-multipart | 0.0.29 | CVE-2026-53539 | HIGH | 0.0.30 | direct pin | services/ekyc-service/requirements.txt | 0.0.30 |
| frontend | Docker USER | root | DS-0002 | HIGH | non-root | runtime config | infrastructure/deploy/frontend/Dockerfile | UID 101 |
| realtime-service | Docker USER | root | DS-0002 | HIGH | non-root | runtime config | services/realtime-service/Dockerfile | UID 10001 |

## C. Coordinated Java dependency remedy

All nine Java services use Boot **3.5.15**, retaining Java 17 and Boot 3. Gateway uses Cloud **2025.0.3**, the compatible 2025.0 train, and the current WebFlux Gateway starter/property namespace. All ten route definitions, ordering, upstream URLs, CORS and default filters were compared semantically against the base and preserved.

Boot 3.5.12 fixes the original Actuator advisory but its real resolved JARs were not safe: the first candidate scan found **242 HIGH / 52 CRITICAL occurrences**. Boot 3.5.14 still manages Spring 6.2.18. Boot 3.5.15 supplies Spring 6.2.19, Data Commons 3.5.12 and Micrometer 1.15.12 together; no isolated Spring/Security/Data/Micrometer overrides were added.

Patch-family alignment:

- Jackson BOM **2.21.7**, all nine services.
- Tomcat family **10.1.60**, all eight servlet services; Gateway remains WebFlux.
- Netty BOM **4.1.137.Final**, AI/Gateway/Booking/Chat/Notification/Realtime.
- Rabbit Java client **5.34.0**, Booking/Chat/Notification/Realtime.
- Existing Gateway Bouncy Castle dependency **1.85**, via dependency management.
- Springdoc **2.8.17** in the seven services which already use it.
- pgJDBC **42.7.12**, all six PostgreSQL services: Booking/Chat/Hotel/Identity/Notification/Payment.
- Boot-managed `flyway-database-postgresql` module in those six services, required by Flyway 11's database modularization. No migration changes.

pgJDBC 42.7.12 also fixes CVE-2026-54291 affecting 42.7.11; stopping at 42.7.11 would leave that newer advisory.
Tomcat 10.1.58 failed its release vote. 10.1.59 initially satisfied scanned findings, but the official Apache page subsequently exposed important 10.1.60 fixes affecting 10.1.59 (CVE-2026-86350, CVE-2026-78383, CVE-2026-77791, CVE-2026-76183). The final implementation uses 10.1.60 and affected tests/images were rerun, rather than trusting the scanner's earlier zero result alone.
Rabbit's new transitive Netty 4.1.135 initially introduced 3 HIGH / 3 CRITICAL occurrences in Chat/Notification/Realtime; all six Netty consumers are now aligned to 4.1.137.Final.

These are dependency-family patches, not a new cryptographic feature or a claim that upstream tests this custom bundle. Compatibility is backed by the local evidence below.
Boot 3.5.16 is the last OSS Boot 3.5 release. The Boot-3.5 OSS lifecycle is a known rollout risk: this report does not claim ongoing OSS support. Commercial support or a separately approved major upgrade requires its own decision; an unrequested Boot-4 migration was not performed.

Primary references:
[Boot Actuator advisory](https://spring.io/security/cve-2026-22733/),
[Cloud compatibility matrix](https://github.com/spring-cloud/spring-cloud-release/wiki/Supported-Versions),
[Springdoc matrix](https://springdoc.org/v2/),
[Spring 6.2.19 advisory](https://spring.io/security/cve-2026-41850/),
[Boot dependency-version customization](https://docs.spring.io/spring-boot/how-to/build.html#howto.build.customize-dependency-versions),
[Boot 3.5 OSS lifecycle](https://spring.io/blog/2026/06/25/spring-boot-3-5-16-available-now/),
[pgJDBC 42.7.12](https://github.com/pgjdbc/pgjdbc/releases/tag/REL42.7.12),
[Tomcat advisories](https://tomcat.apache.org/security-10.html).

## D. Expanded resolved-runtime finding map

The following table is from the first real Boot-3.5.12 candidate **rootfs JAR scan**, not the original source-only baseline. It retains all 53 package/advisory/version groups and ownership; occurrence counts cover the nine JARs, not unique CVE counts.

| Package | Installed in first candidate | Advisory | Severity | Scanner fixed versions | Occurrences | Controlling POM(s) | Applied |
| --- | --- | --- | --- | --- | --- | --- | --- |
| com.fasterxml.jackson.core:jackson-core | 2.19.4 | CVE-2026-89407 | HIGH | 2.18.11, 2.21.7, 2.22.3 | 9 | services/ai-service/pom.xml<br>services/api-gateway/pom.xml<br>services/booking-service/pom.xml<br>services/chat-service/pom.xml<br>services/hotel-service/pom.xml<br>services/identity-service/pom.xml<br>services/notification-service/pom.xml<br>services/payment-service/pom.xml<br>services/realtime-service/pom.xml | Boot 3.5.15 + jackson-bom 2.21.7 |
| com.fasterxml.jackson.core:jackson-core | 2.19.4 | CVE-2026-89425 | HIGH | 2.21.7, 2.22.3, 2.18.11 | 9 | services/ai-service/pom.xml<br>services/api-gateway/pom.xml<br>services/booking-service/pom.xml<br>services/chat-service/pom.xml<br>services/hotel-service/pom.xml<br>services/identity-service/pom.xml<br>services/notification-service/pom.xml<br>services/payment-service/pom.xml<br>services/realtime-service/pom.xml | Boot 3.5.15 + jackson-bom 2.21.7 |
| com.fasterxml.jackson.core:jackson-core | 2.19.4 | GHSA-r7wm-3cxj-wff9 | HIGH | 2.18.8, 2.21.4 | 9 | services/ai-service/pom.xml<br>services/api-gateway/pom.xml<br>services/booking-service/pom.xml<br>services/chat-service/pom.xml<br>services/hotel-service/pom.xml<br>services/identity-service/pom.xml<br>services/notification-service/pom.xml<br>services/payment-service/pom.xml<br>services/realtime-service/pom.xml | Boot 3.5.15 + jackson-bom 2.21.7 |
| com.fasterxml.jackson.core:jackson-databind | 2.19.4 | CVE-2026-54512 | HIGH | 2.18.8, 3.1.4, 2.21.4 | 9 | services/ai-service/pom.xml<br>services/api-gateway/pom.xml<br>services/booking-service/pom.xml<br>services/chat-service/pom.xml<br>services/hotel-service/pom.xml<br>services/identity-service/pom.xml<br>services/notification-service/pom.xml<br>services/payment-service/pom.xml<br>services/realtime-service/pom.xml | Boot 3.5.15 + jackson-bom 2.21.7 |
| com.fasterxml.jackson.core:jackson-databind | 2.19.4 | CVE-2026-54513 | HIGH | 2.18.8, 2.21.4, 3.1.4 | 9 | services/ai-service/pom.xml<br>services/api-gateway/pom.xml<br>services/booking-service/pom.xml<br>services/chat-service/pom.xml<br>services/hotel-service/pom.xml<br>services/identity-service/pom.xml<br>services/notification-service/pom.xml<br>services/payment-service/pom.xml<br>services/realtime-service/pom.xml | Boot 3.5.15 + jackson-bom 2.21.7 |
| com.fasterxml.jackson.core:jackson-databind | 2.19.4 | CVE-2026-68497 | HIGH | 2.18.10, 2.21.6, 2.22.2 | 9 | services/ai-service/pom.xml<br>services/api-gateway/pom.xml<br>services/booking-service/pom.xml<br>services/chat-service/pom.xml<br>services/hotel-service/pom.xml<br>services/identity-service/pom.xml<br>services/notification-service/pom.xml<br>services/payment-service/pom.xml<br>services/realtime-service/pom.xml | Boot 3.5.15 + jackson-bom 2.21.7 |
| com.fasterxml.jackson.core:jackson-databind | 2.19.4 | CVE-2026-91776 | HIGH | 2.18.11, 2.21.7, 2.22.3 | 9 | services/ai-service/pom.xml<br>services/api-gateway/pom.xml<br>services/booking-service/pom.xml<br>services/chat-service/pom.xml<br>services/hotel-service/pom.xml<br>services/identity-service/pom.xml<br>services/notification-service/pom.xml<br>services/payment-service/pom.xml<br>services/realtime-service/pom.xml | Boot 3.5.15 + jackson-bom 2.21.7 |
| com.fasterxml.jackson.core:jackson-databind | 2.19.4 | CVE-2026-91777 | HIGH | 2.21.7, 2.18.11, 2.22.3 | 9 | services/ai-service/pom.xml<br>services/api-gateway/pom.xml<br>services/booking-service/pom.xml<br>services/chat-service/pom.xml<br>services/hotel-service/pom.xml<br>services/identity-service/pom.xml<br>services/notification-service/pom.xml<br>services/payment-service/pom.xml<br>services/realtime-service/pom.xml | Boot 3.5.15 + jackson-bom 2.21.7 |
| com.rabbitmq:amqp-client | 5.25.0 | CVE-2026-63337 | HIGH | 5.33.0 | 4 | services/booking-service/pom.xml<br>services/chat-service/pom.xml<br>services/notification-service/pom.xml<br>services/realtime-service/pom.xml | amqp-client 5.34.0 |
| com.rabbitmq:amqp-client | 5.25.0 | CVE-2026-69219 | HIGH | 5.33.1 | 4 | services/booking-service/pom.xml<br>services/chat-service/pom.xml<br>services/notification-service/pom.xml<br>services/realtime-service/pom.xml | amqp-client 5.34.0 |
| com.rabbitmq:amqp-client | 5.25.0 | CVE-2026-69220 | HIGH | 5.33.1 | 4 | services/booking-service/pom.xml<br>services/chat-service/pom.xml<br>services/notification-service/pom.xml<br>services/realtime-service/pom.xml | amqp-client 5.34.0 |
| com.rabbitmq:amqp-client | 5.25.0 | CVE-2026-75516 | HIGH | 5.34.0 | 4 | services/booking-service/pom.xml<br>services/chat-service/pom.xml<br>services/notification-service/pom.xml<br>services/realtime-service/pom.xml | amqp-client 5.34.0 |
| io.micrometer:micrometer-core | 1.15.10 | CVE-2026-40983 | HIGH | 1.16.6, 1.15.12 | 9 | services/ai-service/pom.xml<br>services/api-gateway/pom.xml<br>services/booking-service/pom.xml<br>services/chat-service/pom.xml<br>services/hotel-service/pom.xml<br>services/identity-service/pom.xml<br>services/notification-service/pom.xml<br>services/payment-service/pom.xml<br>services/realtime-service/pom.xml | Boot 3.5.15 managed family |
| io.micrometer:micrometer-core | 1.15.10 | CVE-2026-40984 | HIGH | 1.16.6, 1.15.12 | 9 | services/ai-service/pom.xml<br>services/api-gateway/pom.xml<br>services/booking-service/pom.xml<br>services/chat-service/pom.xml<br>services/hotel-service/pom.xml<br>services/identity-service/pom.xml<br>services/notification-service/pom.xml<br>services/payment-service/pom.xml<br>services/realtime-service/pom.xml | Boot 3.5.15 managed family |
| io.netty:netty-codec | 4.1.131.Final | CVE-2026-42583 | HIGH | 4.1.133.Final | 3 | services/ai-service/pom.xml<br>services/api-gateway/pom.xml<br>services/booking-service/pom.xml | netty-bom 4.1.137.Final |
| io.netty:netty-codec | 4.1.131.Final | CVE-2026-59901 | HIGH | 4.1.136.Final | 3 | services/ai-service/pom.xml<br>services/api-gateway/pom.xml<br>services/booking-service/pom.xml | netty-bom 4.1.137.Final |
| io.netty:netty-codec-dns | 4.1.131.Final | CVE-2026-42579 | HIGH | 4.2.13.Final, 4.1.133.Final | 2 | services/ai-service/pom.xml<br>services/api-gateway/pom.xml | netty-bom 4.1.137.Final |
| io.netty:netty-codec-http | 4.1.131.Final | CVE-2026-33870 | HIGH | 4.1.132.Final, 4.2.10.Final | 2 | services/ai-service/pom.xml<br>services/api-gateway/pom.xml | netty-bom 4.1.137.Final |
| io.netty:netty-codec-http | 4.1.131.Final | CVE-2026-42584 | HIGH | 4.2.13.Final, 4.1.133.Final | 2 | services/ai-service/pom.xml<br>services/api-gateway/pom.xml | netty-bom 4.1.137.Final |
| io.netty:netty-codec-http | 4.1.131.Final | CVE-2026-42587 | HIGH | 4.2.13.Final, 4.1.133.Final | 2 | services/ai-service/pom.xml<br>services/api-gateway/pom.xml | netty-bom 4.1.137.Final |
| io.netty:netty-codec-http | 4.1.131.Final | CVE-2026-55831 | HIGH | 4.2.16.Final, 4.1.136.Final | 2 | services/ai-service/pom.xml<br>services/api-gateway/pom.xml | netty-bom 4.1.137.Final |
| io.netty:netty-codec-http | 4.1.131.Final | CVE-2026-55833 | HIGH | 4.2.16.Final, 4.1.136.Final | 2 | services/ai-service/pom.xml<br>services/api-gateway/pom.xml | netty-bom 4.1.137.Final |
| io.netty:netty-codec-http | 4.1.131.Final | CVE-2026-56745 | HIGH | 4.2.16.Final, 4.1.136.Final | 2 | services/ai-service/pom.xml<br>services/api-gateway/pom.xml | netty-bom 4.1.137.Final |
| io.netty:netty-codec-http2 | 4.1.131.Final | CVE-2026-33871 | HIGH | 4.1.132.Final, 4.2.11.Final | 2 | services/ai-service/pom.xml<br>services/api-gateway/pom.xml | netty-bom 4.1.137.Final |
| io.netty:netty-codec-http2 | 4.1.131.Final | CVE-2026-42587 | HIGH | 4.2.13.Final, 4.1.133.Final | 2 | services/ai-service/pom.xml<br>services/api-gateway/pom.xml | netty-bom 4.1.137.Final |
| io.netty:netty-codec-http2 | 4.1.131.Final | CVE-2026-56819 | HIGH | 4.2.16.Final, 4.1.136.Final | 2 | services/ai-service/pom.xml<br>services/api-gateway/pom.xml | netty-bom 4.1.137.Final |
| io.netty:netty-handler | 4.1.131.Final | CVE-2026-44249 | HIGH | 4.2.15.Final, 4.1.135.Final | 3 | services/ai-service/pom.xml<br>services/api-gateway/pom.xml<br>services/booking-service/pom.xml | netty-bom 4.1.137.Final |
| io.netty:netty-handler | 4.1.131.Final | CVE-2026-45416 | HIGH | 4.2.15.Final, 4.1.135.Final | 3 | services/ai-service/pom.xml<br>services/api-gateway/pom.xml<br>services/booking-service/pom.xml | netty-bom 4.1.137.Final |
| io.netty:netty-handler | 4.1.131.Final | CVE-2026-50010 | HIGH | 4.2.15.Final, 4.1.135.Final | 3 | services/ai-service/pom.xml<br>services/api-gateway/pom.xml<br>services/booking-service/pom.xml | netty-bom 4.1.137.Final |
| io.netty:netty-handler | 4.1.131.Final | CVE-2026-75595 | CRITICAL | 4.2.17.Final, 4.1.137.Final | 3 | services/ai-service/pom.xml<br>services/api-gateway/pom.xml<br>services/booking-service/pom.xml | netty-bom 4.1.137.Final |
| io.netty:netty-resolver-dns | 4.1.131.Final | CVE-2026-45674 | HIGH | 4.2.15.Final, 4.1.135.Final | 2 | services/ai-service/pom.xml<br>services/api-gateway/pom.xml | netty-bom 4.1.137.Final |
| io.netty:netty-resolver-dns | 4.1.131.Final | CVE-2026-47691 | HIGH | 4.2.15.Final, 4.1.135.Final | 2 | services/ai-service/pom.xml<br>services/api-gateway/pom.xml | netty-bom 4.1.137.Final |
| org.apache.tomcat.embed:tomcat-embed-core | 10.1.52 | CVE-2026-29129 | HIGH | 9.0.116, 10.1.53, 11.0.20 | 8 | services/ai-service/pom.xml<br>services/booking-service/pom.xml<br>services/chat-service/pom.xml<br>services/hotel-service/pom.xml<br>services/identity-service/pom.xml<br>services/notification-service/pom.xml<br>services/payment-service/pom.xml<br>services/realtime-service/pom.xml | Tomcat 10.1.60 (10.1.58 release vote failed; later official advisories also checked) |
| org.apache.tomcat.embed:tomcat-embed-core | 10.1.52 | CVE-2026-34483 | HIGH | 9.0.116, 10.1.54, 11.0.21 | 8 | services/ai-service/pom.xml<br>services/booking-service/pom.xml<br>services/chat-service/pom.xml<br>services/hotel-service/pom.xml<br>services/identity-service/pom.xml<br>services/notification-service/pom.xml<br>services/payment-service/pom.xml<br>services/realtime-service/pom.xml | Tomcat 10.1.60 (10.1.58 release vote failed; later official advisories also checked) |
| org.apache.tomcat.embed:tomcat-embed-core | 10.1.52 | CVE-2026-34487 | HIGH | 9.0.117, 10.1.54, 11.0.21 | 8 | services/ai-service/pom.xml<br>services/booking-service/pom.xml<br>services/chat-service/pom.xml<br>services/hotel-service/pom.xml<br>services/identity-service/pom.xml<br>services/notification-service/pom.xml<br>services/payment-service/pom.xml<br>services/realtime-service/pom.xml | Tomcat 10.1.60 (10.1.58 release vote failed; later official advisories also checked) |
| org.apache.tomcat.embed:tomcat-embed-core | 10.1.52 | CVE-2026-41284 | HIGH | 9.0.118, 10.1.55, 11.0.22 | 8 | services/ai-service/pom.xml<br>services/booking-service/pom.xml<br>services/chat-service/pom.xml<br>services/hotel-service/pom.xml<br>services/identity-service/pom.xml<br>services/notification-service/pom.xml<br>services/payment-service/pom.xml<br>services/realtime-service/pom.xml | Tomcat 10.1.60 (10.1.58 release vote failed; later official advisories also checked) |
| org.apache.tomcat.embed:tomcat-embed-core | 10.1.52 | CVE-2026-41293 | CRITICAL | 9.0.118, 10.1.55, 11.0.22 | 8 | services/ai-service/pom.xml<br>services/booking-service/pom.xml<br>services/chat-service/pom.xml<br>services/hotel-service/pom.xml<br>services/identity-service/pom.xml<br>services/notification-service/pom.xml<br>services/payment-service/pom.xml<br>services/realtime-service/pom.xml | Tomcat 10.1.60 (10.1.58 release vote failed; later official advisories also checked) |
| org.apache.tomcat.embed:tomcat-embed-core | 10.1.52 | CVE-2026-42498 | HIGH | 9.0.118, 10.1.55, 11.0.22 | 8 | services/ai-service/pom.xml<br>services/booking-service/pom.xml<br>services/chat-service/pom.xml<br>services/hotel-service/pom.xml<br>services/identity-service/pom.xml<br>services/notification-service/pom.xml<br>services/payment-service/pom.xml<br>services/realtime-service/pom.xml | Tomcat 10.1.60 (10.1.58 release vote failed; later official advisories also checked) |
| org.apache.tomcat.embed:tomcat-embed-core | 10.1.52 | CVE-2026-43512 | CRITICAL | 9.0.118, 10.1.55, 11.0.22 | 8 | services/ai-service/pom.xml<br>services/booking-service/pom.xml<br>services/chat-service/pom.xml<br>services/hotel-service/pom.xml<br>services/identity-service/pom.xml<br>services/notification-service/pom.xml<br>services/payment-service/pom.xml<br>services/realtime-service/pom.xml | Tomcat 10.1.60 (10.1.58 release vote failed; later official advisories also checked) |
| org.apache.tomcat.embed:tomcat-embed-core | 10.1.52 | CVE-2026-43513 | HIGH | 9.0.118, 10.1.55, 11.0.22 | 8 | services/ai-service/pom.xml<br>services/booking-service/pom.xml<br>services/chat-service/pom.xml<br>services/hotel-service/pom.xml<br>services/identity-service/pom.xml<br>services/notification-service/pom.xml<br>services/payment-service/pom.xml<br>services/realtime-service/pom.xml | Tomcat 10.1.60 (10.1.58 release vote failed; later official advisories also checked) |
| org.apache.tomcat.embed:tomcat-embed-core | 10.1.52 | CVE-2026-43515 | CRITICAL | 9.0.118, 10.1.55, 11.0.22 | 8 | services/ai-service/pom.xml<br>services/booking-service/pom.xml<br>services/chat-service/pom.xml<br>services/hotel-service/pom.xml<br>services/identity-service/pom.xml<br>services/notification-service/pom.xml<br>services/payment-service/pom.xml<br>services/realtime-service/pom.xml | Tomcat 10.1.60 (10.1.58 release vote failed; later official advisories also checked) |
| org.apache.tomcat.embed:tomcat-embed-core | 10.1.52 | CVE-2026-65182 | CRITICAL | 11.0.25, 10.1.58, 9.0.121 | 8 | services/ai-service/pom.xml<br>services/booking-service/pom.xml<br>services/chat-service/pom.xml<br>services/hotel-service/pom.xml<br>services/identity-service/pom.xml<br>services/notification-service/pom.xml<br>services/payment-service/pom.xml<br>services/realtime-service/pom.xml | Tomcat 10.1.60 (10.1.58 release vote failed; later official advisories also checked) |
| org.apache.tomcat.embed:tomcat-embed-core | 10.1.52 | CVE-2026-65905 | CRITICAL | 11.0.25, 10.1.58, 9.0.121 | 8 | services/ai-service/pom.xml<br>services/booking-service/pom.xml<br>services/chat-service/pom.xml<br>services/hotel-service/pom.xml<br>services/identity-service/pom.xml<br>services/notification-service/pom.xml<br>services/payment-service/pom.xml<br>services/realtime-service/pom.xml | Tomcat 10.1.60 (10.1.58 release vote failed; later official advisories also checked) |
| org.apache.tomcat.embed:tomcat-embed-core | 10.1.52 | CVE-2026-68525 | CRITICAL | 11.0.25, 10.1.58, 9.0.121 | 8 | services/ai-service/pom.xml<br>services/booking-service/pom.xml<br>services/chat-service/pom.xml<br>services/hotel-service/pom.xml<br>services/identity-service/pom.xml<br>services/notification-service/pom.xml<br>services/payment-service/pom.xml<br>services/realtime-service/pom.xml | Tomcat 10.1.60 (10.1.58 release vote failed; later official advisories also checked) |
| org.bouncycastle:bcprov-jdk18on | 1.80.2 | CVE-2026-13506 | HIGH | 1.85 | 1 | services/api-gateway/pom.xml | bcprov 1.85 |
| org.bouncycastle:bcprov-jdk18on | 1.80.2 | CVE-2026-8763 | CRITICAL | 1.85 | 1 | services/api-gateway/pom.xml | bcprov 1.85 |
| org.springframework:spring-expression | 6.2.17 | CVE-2026-41850 | HIGH | 7.0.8, 6.2.19 | 9 | services/ai-service/pom.xml<br>services/api-gateway/pom.xml<br>services/booking-service/pom.xml<br>services/chat-service/pom.xml<br>services/hotel-service/pom.xml<br>services/identity-service/pom.xml<br>services/notification-service/pom.xml<br>services/payment-service/pom.xml<br>services/realtime-service/pom.xml | Boot 3.5.15 managed family |
| org.springframework:spring-webflux | 6.2.17 | CVE-2026-41842 | HIGH | 7.0.8, 6.2.19 | 2 | services/ai-service/pom.xml<br>services/api-gateway/pom.xml | Boot 3.5.15 managed family |
| org.springframework:spring-webmvc | 6.2.17 | CVE-2026-41842 | HIGH | 7.0.8, 6.2.19 | 8 | services/ai-service/pom.xml<br>services/booking-service/pom.xml<br>services/chat-service/pom.xml<br>services/hotel-service/pom.xml<br>services/identity-service/pom.xml<br>services/notification-service/pom.xml<br>services/payment-service/pom.xml<br>services/realtime-service/pom.xml | Boot 3.5.15 managed family |
| org.springframework:spring-webmvc | 6.2.17 | CVE-2026-41845 | HIGH | 7.0.8, 6.2.19 | 8 | services/ai-service/pom.xml<br>services/booking-service/pom.xml<br>services/chat-service/pom.xml<br>services/hotel-service/pom.xml<br>services/identity-service/pom.xml<br>services/notification-service/pom.xml<br>services/payment-service/pom.xml<br>services/realtime-service/pom.xml | Boot 3.5.15 managed family |
| org.springframework.boot:spring-boot | 3.5.12 | CVE-2026-40973 | HIGH | 4.0.6, 3.5.14 | 9 | services/ai-service/pom.xml<br>services/api-gateway/pom.xml<br>services/booking-service/pom.xml<br>services/chat-service/pom.xml<br>services/hotel-service/pom.xml<br>services/identity-service/pom.xml<br>services/notification-service/pom.xml<br>services/payment-service/pom.xml<br>services/realtime-service/pom.xml | Boot 3.5.15 managed family |
| org.springframework.data:spring-data-commons | 3.5.10 | CVE-2026-41695 | HIGH | 4.0.6, 3.5.12 | 6 | services/booking-service/pom.xml<br>services/chat-service/pom.xml<br>services/hotel-service/pom.xml<br>services/identity-service/pom.xml<br>services/notification-service/pom.xml<br>services/payment-service/pom.xml | Boot 3.5.15 managed family |
| org.springframework.data:spring-data-commons | 3.5.10 | CVE-2026-41716 | HIGH | 4.0.6, 3.5.12 | 6 | services/booking-service/pom.xml<br>services/chat-service/pom.xml<br>services/hotel-service/pom.xml<br>services/identity-service/pom.xml<br>services/notification-service/pom.xml<br>services/payment-service/pom.xml | Boot 3.5.15 managed family |

Raw candidate evidence: `trivy-resolved-rootfs.json` in the evidence directory below.
The intermediate Netty-4.1.135 observation is additionally addressed by the final six-service BOM alignment; its temporary JSON was overwritten by the final scan and is not presented as a retained independent artifact.

## E. Python and frontend patches

eKYC: python-multipart **0.0.29 → 0.0.30**, no other requirements pin changed.
[Official advisory](https://github.com/Kludex/python-multipart/security/advisories/GHSA-5rvq-cxj2-64vf).

Frontend: axios **1.19.0 → 1.20.0**, brace-expansion **5.0.9 → 5.0.12**, dev-only nanoid **3.3.16 → 3.3.19**.
The direct manifest changes only axios; lockfile changes are limited to these three patched packages. No React major change or UI business source edit.

Clean Node **22.23.3** Linux install/lint/build and all **4/4** existing complaint-workflow tests passed. npm audit has **0 HIGH / 0 CRITICAL** and three MODERATE findings through Capacitor CLI → xcode → uuid. No force-fix/downgrade, suppression or severity reduction was used.
An earlier host Node-24 lint process aborted and a first Linux process aborted after building; those attempts are not PASS evidence. The bounded Node-22 retry completed with exit 0.

eKYC: **25/25 pytest PASS**, plus real application/model startup and health UP with multipart 0.0.30. A four-part synthetic JPEG upload was parsed and correctly rejected by face business validation with 422; no real identity document/face was used. An unauthenticated internal request returned 401. AnyIO deprecation and pytest cache-on-read-only-bind warnings are disclosed; neither is a runtime permission failure.

## F. Docker non-root runtime

Frontend uses `nginxinc/nginx-unprivileged:1.30.5-alpine`, runtime **UID 101**, port **8080**. Root is build-time only. Static assets stay read-only, config ownership/mode is explicit, nginx temp/cache/PID paths use the unprivileged image's writable /tmp configuration.
The source-only Compose expose and reverse-proxy upstream port were paired from 80 to 8080; external public routing is unchanged. Neither production file was applied and no production container was accessed.

Realtime runs as **UID/GID 10001**, its JAR is owner app and mode 0444, /tmp writable, port 8087 and Java entrypoint unchanged. No world-writable permissions or blind USER insertion.

Both images built and actually ran non-root. Frontend: nginx config test, root and SPA routes HTTP 200, all referenced static assets HTTP 200/non-empty, no EACCES errors. Realtime: health UP and real Rabbit/WebSocket smoke with durable topic exchange/queue/binding, persistent routed messages, guest/customer/admin bootstrap and PONG, broadcast and targeted customer/admin delivery, audience isolation and no duplicate delivery.

Existing realtime invalid-JWT behavior rejects the WebSocket upgrade but returns HTTP 200, not 403. The smoke asserts no 101/session; no business/authentication code was changed to mask this observation.
This is security-platform runtime smoke, **not** a claim that PR #6's authenticated financial UI flows were rerun on a base that lacks that feature.

## G. Test isolation and Java validation

Six DB services have a **test-classpath-only initializer before DataSource/Flyway creation**. It requires an explicit loopback PostgreSQL URL, port 5432 or >=10000, *_ci/*_test database, ci_*/test_* user, no URL userinfo/query/fragment and no alternate Flyway connection/credentials. Production ports 5433–5438 are rejected. A fresh synthetic test JWT is generated, never inherited from production.

Payment permits only its existing exact in-memory H2 wallet fixture with Flyway disabled; no H2 file/TCP/INIT fallback. Identity test resources were moved to the actual test classpath and use synthetic loopback OAuth/mail, preventing external discovery or production credential fallback.
All **91** isolation-guard tests passed. These test-only changes do not ship in application runtime.

Sequential final Maven clean verify, Java 17, outside the Windows sandbox JAR-locking boundary:

| Service | Discovered | Executed in generic full run | Explicit opt-in cases | Failures/errors |
| --- | ---: | ---: | ---: | ---: |
| AI | 1 | 1 | 0 | 0 |
| Gateway | 10 | 10 | 0 | 0 |
| Booking | 84 | 77 | 7 | 0 |
| Chat | 18 | 18 | 0 | 0 |
| Hotel | 36 | 34 | 2 | 0 |
| Identity | 47 | 47 | 0 | 0 |
| Notification | 25 | 25 | 0 | 0 |
| Payment | 50 | 49 | 1 | 0 |
| Realtime | 0 | 0 (compile/package verified) | 0 | 0 |
| Total | 271 | 261 | 10 | 0 |

This is **not** “271/271 zero skips in one invocation”: ten opt-in tests skip in generic suites and all ten were executed separately against fresh isolated PostgreSQL 16/Redis after the final Tomcat patch.
After the last Tomcat patch, the eight affected full suites were rerun; Gateway's unchanged final suite is reused.
Existing Hotel Wallet transfer/finality/ownership tests pass in Payment's base suite. Six added PayOS platform-compatibility tests use an actual loopback HTTP stub and fresh synthetic keys: create-link serialization/headers/independent HMAC, status/cancel decoding, provider/HTTP failure without hidden retries, signed webhook/tamper rejection, disabled payment/payout no-call guard, and payout canonical JSON/URI encoding without sending a payout. No PayOS domain is contacted. Payment's final full suite discovers 50 cases, executes 49, and its one migration case passes separately; this is not financial PR #6's 90-test suite.

Gateway's six new real-HTTP compatibility cases cover route precedence, JWT rejection, System Admin authorization, authoritative role mismatch, CORS/deduplication and actuator/Prometheus access without permission widening.

## H. Real PostgreSQL and migrations

Fresh isolated PostgreSQL **16**, not production and not an already-upgraded DB:
Booking daily-pricing false case + six enabled/Redis/concurrency cases, Hotel customer-pricing case, Hotel daily-pricing upgrade and Payment V11→V12 upgrade: **10/10 PASS; zero failure/error/skip**.

Payment V12 preserves Hotel Admin wallet balance, withdrawals, ledger and HotelCustomerTransfer data. Hotel pre-pricing→20260920.01 verifies constraints and Flyway success. All six PostgreSQL application-context startups validate existing migrations under Flyway 11.7.2.
Migration SQL is byte-for-byte unchanged; naming/version validator PASS.
No production migration was run. V13/V14 remain exclusively in financial PR #6.

## I. Docker builds and archive-aware Trivy

All nine Java service images plus frontend/eKYC were built from their Dockerfiles.
To avoid repeatedly downloading public Maven artifacts, named build contexts supplied stock JDK/Maven builder images with **only public Maven repository cache**. No Maven settings, tokens, production environment, host-built application JAR or credentials were copied. Actual Docker Maven go-offline and package instructions ran; runtime images/entrypoints were not bypassed.
[Docker named build-context documentation](https://docs.docker.com/reference/cli/docker/buildx/build/#additional-build-contexts---build-context).

The published Trivy action v0.36.0 defaults to **Trivy 0.70.0**, verified from its [action inputs](https://raw.githubusercontent.com/aquasecurity/trivy-action/v0.36.0/action.yaml); the local CI-equivalent scan uses that same scanner version.

A filesystem scan does **not** inspect packaged JARs. Both final native JARs and extracted final Docker-image JARs were therefore scanned with **Trivy rootfs**. Native build and Docker build artifacts are separate evidence.
[Trivy Java archive coverage](https://trivy.dev/docs/v0.70/guide/coverage/language/java/).

Final gates:

- CI-equivalent source vulnerability/misconfiguration scan: **0 HIGH / 0 CRITICAL / 0 failed HIGH misconfigurations**, exit 0.
- Stricter source scan (dev dependencies, unfixed findings included, secrets): **0 HIGH / 0 CRITICAL / 0 failed HIGH misconfigurations / 0 secrets**, exit 0.
- Final native resolved Java JAR rootfs scan: **0 HIGH / 0 CRITICAL**, exit 0.
- Final Docker-image Java JAR rootfs scan: **0 HIGH / 0 CRITICAL**, exit 0.

No ignorefile, CVE exception, scanner disable, lowered severity or continue-on-error was added.
Scope is source/dependencies/configuration and real Java archives; this does not claim a complete OS-image vulnerability scan.
A Java vulnerability database fetch initially failed and a container-engine interruption stopped test containers/build attempts. Those are retained failed attempts, not source failures or substituted PASS evidence; only verified isolated containers were restarted for successful retries. No production service was restarted.

## J. CI and Dependency Review

Minimal CI repairs retain every security gate:
integration PR base trigger; ci-named synthetic matrix databases and TEST_DB aliases; python -m pytest import handling; valid published Trivy action `v0.36.0`; existing Hotel/Payment PostgreSQL upgrade jobs also selected on integration-targeted PRs.
[Published Trivy action release](https://github.com/aquasecurity/trivy-action/releases/tag/v0.36.0).

Dependency Review action and `fail-on-severity: high` are unchanged. No unsupported-capability fallback was added.
PR #6 run #22 reported:
**“Dependency review is not supported on this repository. Please ensure that Dependency graph is enabled”**.

Gate: **WAITING FOR REPO SETTING**, not PASS. Owner must enable Dependency Graph; this task does not change repository settings. Generic integration 403/public API 404 are not treated as proof of this repository's exact root cause.
The current authenticated compare API check returned **HTTP 403: Forbidden**; this generic response does not independently prove the repository setting. No repeated API workaround or setting write was attempted.
After owner confirmation, rerun the failed job/run and verify actual success. If unavailable, report the actual error and STOPPED, not fake green.

A separate Security PR targets the integration base. Its remote test/security result is not replaced by local evidence. Neither PR may be automatically merged. After whichever PR is approved/merged separately, the other must update normally against the new base and rerun affected validation; no history rewrite or force push here.

## K. Production, history and rollout

**Production touched: NO for this task.**
No production DB connection/query, payment/payout, flag/credential change, container inspection/restart/recreate, deployment, Cloudflare change, image prune, rollback retag or backup deletion occurred.
The source-only frontend port pair is a necessary reviewable non-root compatibility change, not a runtime production mutation.

This statement does not supersede the older security branch's documented production DB access incident; its historical report `docs/security-trivy-remediation-2026-10-02.md` and Git history remain intact. Its validation is not substituted for these isolated results.

No merge/deploy/cleanup is authorized. Preserve rollback images and database backups. An actual rollout needs independent approval, coordinated service compatibility and a rollback/drain plan; do not run mixed old/new financial writers or migrate from a stopped gate.

## L. Evidence locations

Local generated evidence remains **outside Git tracking**:
`C:\Users\DELL\AppData\Local\Temp\EnziuSecurityBaseline-ccc56ef3064843039b29ee2eea02c5e9`.

- Baseline mapping/raw scans above.
- `<service>-final-tomcat60.log` (Payment's latest: `payment-service-final-tomcat60-payos.log`) and preserved `final-tomcat60-full-evidence/` / `final-payment-payos-full-evidence/` Surefire XML for the eight affected services; `api-gateway-final-full.log` for unchanged Gateway.
- `tomcat60-integration-evidence/<database>/`: fresh PostgreSQL/Redis opt-in XML and logs.
- `frontend-linux-ci.log`, `frontend-linux-lint.log`, `frontend-linux-build.log`, `frontend-linux-tests.log`, `frontend-linux-audit.json`.
- `ekyc-tests.log`, `runtime-ekyc-final.log`, `runtime-realtime-tomcat60.log`, `runtime-frontend-final.log`.
- Final `*-tomcat60-docker-build.log` logs, unchanged `api-gateway-final-docker-build.log`, original frontend/eKYC Docker logs, extracted archives in `final-docker-image-jars/`; image IDs below.
- `trivy-final-source.json`, `trivy-final-strict.json`, `trivy-final-runtime.json`, `trivy-final-docker-jars.json`.

No target/, node_modules/, venv, binaries, logs, DB dumps, generated test scripts or ephemeral credentials are committed. The report records reproducible scope and actual outcomes, not secrets.

## M. Validated isolated image IDs

These are local test images, not production container/image IDs.

| Image/component | Docker image ID |
| --- | --- |
| AI | `sha256:5708d1110b34de850c26b133e6c2807bc87379059c998f65d0c1cbb0fc929451` |
| Gateway | `sha256:9983703fbfa4414ff07eaeef2d07f85a3c051ad97c69f66ab50a13966b17a2e3` |
| Booking | `sha256:a78e967a6e3d1abdd7947a438ce6cfc20e08cbd4e5b781d356aef41c0d5d3eff` |
| Chat | `sha256:54d9a12b8da8fbe20b8dcd5da10203084c38ebbde93b838a3236973c8c88e9b8` |
| Hotel | `sha256:59cdb3cbc7a0ad533bada35c8515ed7ab7270b6e5dc3bac24b3e337e95b3bb3e` |
| Identity | `sha256:5ce45a73acffb089d0299128e160fdc4dc6d10248b3b3ad6d4a2a98ae58cbaf7` |
| Notification | `sha256:ee60c18155066a7b1d88706b1b7afe4769d1f7c3a4757cbc37cbd7197ae31283` |
| Payment | `sha256:cacffa7d51b72b8e6927bd51380f6941695dd399dd9a7dba9c8ae374efa3c00f` |
| Realtime | `sha256:9d4b28dc27b1ed5c553c28caac2d53b0796a294124df7d0849d2287586aab36b` |
| Frontend | `sha256:5ac66d919c1fc326361d53123e1355e040793777195cde3e11416e04d96cd1f2` |
| eKYC | `sha256:fc6814ec3004a47742d4a68891ade9e77c5faa71b8af773a5b85fcbce5860967` |
