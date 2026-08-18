/**
 * Template print layout kind.
 * Missing / anything other than 'label' → document (flow pagination).
 */
export function isLabelPrintKind (templateData) {
  return !!(templateData && templateData.printKind === 'label')
}
