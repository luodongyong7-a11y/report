# 构建上下文必须是仓库根目录（需要先 install report-starter）。
#   docker build -f apps/report-tool-api/Dockerfile -t report-tool-api:tag .
FROM maven:3.9-eclipse-temurin-21 AS build
WORKDIR /src
COPY report-starter /src/report-starter
COPY apps/report-tool-api /src/apps/report-tool-api
RUN mvn -f /src/report-starter/pom.xml -DskipTests install \
    && mvn -f /src/apps/report-tool-api/pom.xml -DskipTests package

FROM eclipse-temurin:21-jre
WORKDIR /app
COPY --from=build /src/apps/report-tool-api/target/report-tool-api-1.0.0.jar app.jar
EXPOSE 8088
ENTRYPOINT ["java", "-jar", "/app/app.jar"]
