// 边车流式引擎:复用 report-core 的 flow 布局核心(@niqer/report-core/layout),
// 注入 napi 无头度量(measureCell)。前端设计器实时预览用同一份 core flow + DOM 度量适配器,
// 因此「设计器预览 = 边车 PDF / HTML / Excel」彻底同源、零漂移。
import './fonts.mjs'
import { buildFlowModel as coreBuildFlowModel } from '@niqer/report-core/layout'
import { measureCell } from './measure.mjs'

/**
 * 构建流式布局模型(边车侧:napi 度量后端)。
 * @param {object} templateData 已填 dataset 的模板
 * @returns {{ paperSize, columns, colBounds, totalPages, pages }}
 */
export function buildFlowModel (templateData) {
  return coreBuildFlowModel(templateData, { measureCell })
}
