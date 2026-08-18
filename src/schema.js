export const CURRENT_REPORT_SCHEMA_VERSION = 1

export function ensureReportSchemaVersion (templateData) {
  if ( templateData == null ) return templateData
  const v = templateData.schemaVersion
  if ( v != null && v !== '' ) {
    const n = Number( v )
    if ( Number.isFinite( n ) && n > CURRENT_REPORT_SCHEMA_VERSION ) {
      console.warn(
        `[report] template schemaVersion ${n} > supported ${CURRENT_REPORT_SCHEMA_VERSION}`
      )
    }
    return templateData
  }
  return { ...templateData, schemaVersion: CURRENT_REPORT_SCHEMA_VERSION }
}
