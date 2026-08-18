import { cloneJson, exportTemplate } from './model.js'

export function createHistory (max) {
  const cap = max > 0 ? max : 50
  const stack = []
  let index = -1
  return {
    push (tpl) {
      const snap = cloneJson(exportTemplate(tpl))
      stack.splice(index + 1)
      stack.push(snap)
      if (stack.length > cap) stack.shift()
      index = stack.length - 1
    },
    canUndo () { return index > 0 },
    canRedo () { return index >= 0 && index < stack.length - 1 },
    undo () {
      if (index <= 0) return null
      index--
      return cloneJson(stack[index])
    },
    redo () {
      if (index >= stack.length - 1) return null
      index++
      return cloneJson(stack[index])
    },
    reset (tpl) {
      stack.length = 0
      index = -1
      this.push(tpl)
    }
  }
}
