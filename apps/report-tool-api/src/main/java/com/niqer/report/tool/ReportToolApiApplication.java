package com.niqer.report.tool;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.cache.annotation.EnableCaching;

@SpringBootApplication
@EnableCaching
public class ReportToolApiApplication {

    public static void main(String[] args) {
        SpringApplication.run(ReportToolApiApplication.class, args);
    }
}
