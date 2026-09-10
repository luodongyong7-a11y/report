import http from './http.js'

export function createStoragePlugin () {
  return {
    async get () {
      const [storage, status] = await Promise.all([
        http.get('/report/tool/storage'),
        http.get('/report/tool/status')
      ])
      const out = storage && typeof storage === 'object' ? Object.assign({}, storage) : {}
      if (status && status.dataDir) out.dataDir = status.dataDir
      return out
    },
    save (body) {
      return http.put('/report/tool/storage', body)
    },
    test (body) {
      return http.post('/report/tool/storage/test', body)
    }
  }
}

export function createDatasourcePlugin () {
  return {
    list () {
      return http.get('/report/tool/connections')
    },
    drivers () {
      return http.get('/report/tool/connections/meta/drivers')
    },
    save (body) {
      return http.put('/report/tool/connections', body)
    },
    test (body) {
      return http.post('/report/tool/connections/test', body)
    },
    remove (id) {
      return http.delete('/report/tool/connections/' + encodeURIComponent(id))
    },
    setDefault (id) {
      return http.post('/report/tool/connections/' + encodeURIComponent(id) + '/default')
    }
  }
}
