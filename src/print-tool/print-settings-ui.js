import { loadPrintSettings, savePrintSettings } from './print-settings.js'
import {
  agentShareUrl,
  downloadPrintAgentPackage,
  ensureLocalCustomPaper,
  fetchOnlinePrintAgents,
  getAgentBaseUrl,
  getPreferredPrinter,
  isSilentPrintEnabled,
  listAgentPrinters,
  paperMetaToMm,
  probePrintAgent,
  setAgentBaseUrl,
  setPreferredPrinter,
  setSilentPrintEnabled,
  syncLocalAgentShare
} from './print-agent.js'
import { toast } from './util.js'

function esc (s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;')
}

function hasTemplatePaper (meta) {
  if (!meta || typeof meta !== 'object') return false
  const widthMm = Number(meta.widthMm)
  const heightMm = Number(meta.heightMm)
  if (widthMm > 0 && heightMm > 0) return true
  const widthPx = Number(meta.customPaperSize?.width ?? meta.widthPx ?? meta.paperWidth)
  const heightPx = Number(meta.customPaperSize?.height ?? meta.heightPx ?? meta.paperHeight)
  if (widthPx > 0 && heightPx > 0) return true
  return ['A4', 'A5', 'B5'].includes(String(meta.paperPreset || meta.preset || '').toUpperCase())
}

function templatePaperLabel (meta) {
  if (!hasTemplatePaper(meta)) return '未获取到模板纸张'
  const paper = paperMetaToMm(meta)
  const orientation = paper.orientation === 'landscape' ? '横向' : '纵向'
  return paper.widthMm.toFixed(2) + ' × ' + paper.heightMm.toFixed(2) + ' mm (' + orientation + ')'
}

function onlineLabel (a) {
  const host = a.hostname || a.machineId || 'agent'
  const url = agentShareUrl(a)
  return url ? host + ' (' + url + ')' : host
}

export function mountPrintSettingsDialog (host, ctx) {
  const doc = host.ownerDocument
  const root = host.shadowRoot || host
  let mask = null
  let currentAgent = null
  let printers = []
  let onlineAgents = []

  function close () {
    if (mask) mask.remove()
    mask = null
    currentAgent = null
  }

  function readForm () {
    if (!mask) return null
    return {
      baseUrl: (mask.querySelector('[data-f=baseUrl]') || {}).value || '',
      printerName: (mask.querySelector('[data-f=printerName]') || {}).value || '',
      silentPrint: !!(mask.querySelector('[data-f=silentPrint]') && mask.querySelector('[data-f=silentPrint]').checked),
      printerNote: (mask.querySelector('[data-f=printerNote]') || {}).value || '',
      selectedOnline: (mask.querySelector('[data-f=online]') || {}).value || ''
    }
  }

  function paint (opts) {
    const agentOnline = !!opts.agentOnline
    const paperMeta = ctx.getPaperMeta ? ctx.getPaperMeta() : null
    const printerOpts = printers.map((p) => {
      const name = p.name || ''
      return '<option value="' + esc(name) + '"' + (name === opts.printerName ? ' selected' : '') + '>' + esc(name) + '</option>'
    }).join('')
    const onlineOpts = onlineAgents.map((a) => {
      const url = agentShareUrl(a)
      return '<option value="' + esc(url) + '"' + (url === opts.selectedOnline ? ' selected' : '') + '>' + esc(onlineLabel(a)) + '</option>'
    }).join('')
    mask.innerHTML = '<div class="npt-dlg ps-dlg">' +
      '<h4>打印设置</h4>' +
      '<div class="ps-section">代理连接</div>' +
      '<div class="ps-form">' +
      '<label>打印代理</label><div class="ps-agent-row"><span class="' + (agentOnline ? 'agent-ok' : 'agent-off') + '">' +
      (agentOnline ? '已连接（可静默打印）' : '未检测到（可下载安装或用浏览器打印）') +
      '</span>' + (agentOnline ? '' : '<button type="button" class="action-button" data-act="dlagent">下载代理</button>') + '</div>' +
      '<label>代理地址</label><input data-f="baseUrl" value="' + esc(opts.baseUrl) + '" placeholder="本机默认 http://127.0.0.1:19290，或共享机局域网地址">' +
      (onlineAgents.length
        ? '<label>在线共享代理</label><select data-f="online"><option value="">从 ERP 在线列表选择</option>' + onlineOpts + '</select>'
        : '') +
      '</div>' +
      '<div class="ps-section">打印参数</div>' +
      '<div class="ps-form">' +
      '<label>模板纸张</label><div class="template-paper">' + esc(templatePaperLabel(paperMeta)) + '</div>' +
      (agentOnline
        ? '<label>打印机</label><select data-f="printerName"><option value="">选择本机打印机</option>' + printerOpts + '</select>' +
          '<label>静默打印</label><label class="ps-check"><input type="checkbox" data-f="silentPrint"' + (opts.silentPrint ? ' checked' : '') + '> 开启</label>'
        : '<label>打印机备注</label><input data-f="printerNote" value="' + esc(opts.printerNote) + '" placeholder="可选，如仓库针式打印机">') +
      '</div>' +
      '<p class="print-settings-hint">' + (agentOnline
        ? '保存后将使用所选打印机。自定义模板在本机代理会自动匹配或创建纸型；共享代理不会修改纸型。'
        : '1. 下载 zip 并解压\n2. 双击 tk-print-agent.exe（自动安装、开机启动、默认局域网共享）\n3. 回到本页打开打印设置（自动登记）\n其他电脑在「在线共享代理」里选这台即可。\n说明：浏览器会拦截未签名的 exe 直链，故以 zip 提供。') +
      '</p>' +
      '<div class="npt-dlg-act">' +
      '<button type="button" class="action-button" data-act="close">关闭</button>' +
      '<button type="button" class="action-button action-button--primary" data-act="save">保存</button>' +
      '</div></div>'
  }

  async function refreshAgent (baseUrl) {
    currentAgent = null
    printers = []
    try {
      const agent = await probePrintAgent(baseUrl || getAgentBaseUrl())
      if (agent) {
        currentAgent = agent
        await syncLocalAgentShare(agent)
        printers = await listAgentPrinters(agent)
      }
    } catch {
      currentAgent = null
    }
  }

  async function open () {
    if (mask) mask.remove()
    mask = doc.createElement('div')
    mask.className = 'npt-mask ps-mask'
    root.appendChild(mask)
    const saved = loadPrintSettings()
    let printerName = getPreferredPrinter() || ''
    const baseUrl = getAgentBaseUrl()
    onlineAgents = await fetchOnlinePrintAgents()
    await refreshAgent(baseUrl)
    if (!printerName && printers.length) printerName = printers[0].name
    paint({
      agentOnline: !!currentAgent,
      baseUrl: currentAgent ? currentAgent.baseUrl : baseUrl,
      printerName,
      silentPrint: isSilentPrintEnabled(),
      printerNote: saved.printerNote,
      selectedOnline: ''
    })

    mask.addEventListener('click', async (ev) => {
      if (ev.target === mask) return
      const act = ev.target.closest('[data-act]')
      const name = act ? act.dataset.act : ''
      if (name === 'close') return close()
      if (name === 'dlagent') {
        act.disabled = true
        try {
          await downloadPrintAgentPackage(ctx.http)
          toast(host, '安装包已开始下载', 'ok')
        } catch (e) {
          toast(host, e?.message || '下载失败', 'err')
        } finally {
          act.disabled = false
        }
        return
      }
      if (name === 'save') {
        const form = readForm()
        act.disabled = true
        try {
          const ensured = await ensureLocalCustomPaper(
            currentAgent,
            form.printerName,
            ctx.getPaperMeta ? ctx.getPaperMeta() : {}
          )
          if (!ensured.ok) {
            toast(host, '无法为当前模板创建纸型：' + (ensured.error || ''), 'err')
            return
          }
          savePrintSettings({ printerNote: form.printerNote })
          if (form.printerName) setPreferredPrinter(form.printerName)
          setSilentPrintEnabled(!!form.silentPrint)
          setAgentBaseUrl(form.baseUrl)
          toast(host, '打印设置已保存', 'ok')
          close()
        } finally {
          act.disabled = false
        }
      }
    })

    mask.addEventListener('change', async (ev) => {
      const el = ev.target
      if (el.dataset.f === 'baseUrl') {
        setAgentBaseUrl(el.value)
        const form = readForm()
        await refreshAgent(el.value)
        paint({
          agentOnline: !!currentAgent,
          baseUrl: currentAgent ? currentAgent.baseUrl : el.value,
          printerName: form.printerName,
          silentPrint: form.silentPrint,
          printerNote: form.printerNote,
          selectedOnline: form.selectedOnline
        })
      }
      if (el.dataset.f === 'online' && el.value) {
        setAgentBaseUrl(el.value)
        const form = readForm()
        await refreshAgent(el.value)
        paint({
          agentOnline: !!currentAgent,
          baseUrl: currentAgent ? currentAgent.baseUrl : el.value,
          printerName: form.printerName,
          silentPrint: form.silentPrint,
          printerNote: form.printerNote,
          selectedOnline: el.value
        })
      }
    })
  }

  return { open, close }
}
