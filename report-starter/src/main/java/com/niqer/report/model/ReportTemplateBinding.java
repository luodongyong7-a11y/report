package com.niqer.report.model;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ReportTemplateBinding {

    private String id;
    private String menuId;
    private String templateCode;
    private LocalDateTime updateTime;
    private String updaterId;
    private String updater;
    private LocalDateTime createTime;
    private String creatorId;
    private String creator;
    private String remark;
    private Integer version;
}
