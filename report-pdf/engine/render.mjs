// 编排:模板 JSON(已填 dataset)→ 多页 PDF / XLSX / HTML。
// 单一引擎:flow 流式分带。PDF / XLSX / HTML 消费同一份 flow 模型,彻底一致;
// 前端设计器实时预览复用同一套 flow 布局核心(@niqer/report-core/layout 的 flow + DOM 度量)。
import './fonts.mjs'
import {
  renderTemplateToPdfFlowBuffer,
  renderTemplateToXlsxFlowBuffer,
  renderTemplateToHtmlFlowBuffer
} from './render-flow.mjs'
import fs from 'node:fs'

/**
 * 渲染为 PDF Buffer(服务/后端集成用,不落盘)。
 * @param {object} templateData 已填 dataset 的模板 JSON
 * @returns {Promise<{ buffer: Buffer, totalPages: number, pageCount: number, elementCount: number }>}
 */
export async function renderTemplateToPdfBuffer (templateData, opts) {
  return renderTemplateToPdfFlowBuffer(templateData, opts)
}

/**
 * 渲染为 Excel Buffer(服务/后端集成用,不落盘)。
 * @param {object} templateData 已填 dataset 的模板 JSON
 * @returns {Promise<{ buffer: Buffer, totalPages: number, pageCount: number, elementCount: number }>}
 */
export async function renderTemplateToXlsxBuffer (templateData) {
  return renderTemplateToXlsxFlowBuffer(templateData)
}

/**
 * 渲染为预览 HTML Buffer(服务/后端集成用,不落盘)。
 * @param {object} templateData 已填 dataset 的模板 JSON
 * @returns {Promise<{ buffer: Buffer, totalPages: number, pageCount: number, elementCount: number }>}
 */
export async function renderTemplateToHtmlBuffer (templateData, opts) {
  return renderTemplateToHtmlFlowBuffer(templateData, opts)
}

/**
 * 渲染为 PDF 文件(CLI/冒烟用)。
 * @param {object} templateData 已填 dataset 的模板 JSON
 * @param {string} outPath 输出 PDF 路径
 */
export async function renderTemplateToPdf (templateData, outPath) {
  const { buffer, totalPages, pageCount, elementCount } = await renderTemplateToPdfBuffer(templateData)
  fs.writeFileSync(outPath, buffer)
  return { outPath, bytes: buffer.length, totalPages, pageCount, elementCount }
}

/**
 * 渲染为 Excel 文件(CLI/冒烟用)。
 * @param {object} templateData 已填 dataset 的模板 JSON
 * @param {string} outPath 输出 xlsx 路径
 */
export async function renderTemplateToXlsx (templateData, outPath) {
  const { buffer, totalPages, pageCount, elementCount } = await renderTemplateToXlsxBuffer(templateData)
  fs.writeFileSync(outPath, buffer)
  return { outPath, bytes: buffer.length, totalPages, pageCount, elementCount }
}
