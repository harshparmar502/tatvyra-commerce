import fs from 'node:fs'
import path from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

/**
 * Serves the /api functions during `npm run dev`, the same way Vercel serves
 * them in production: api/checkout/create.js answers /api/checkout/create,
 * through its exported GET / POST handler. Files under api/_lib are private.
 */
function localApi() {
  return {
    name: 'tatvyra-local-api',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith('/api/')) return next()
        const url = new URL(req.url, 'http://localhost')
        const file = path.join(server.config.root, `${url.pathname}.js`)
        if (url.pathname.includes('/_') || !fs.existsSync(file)) return next()

        try {
          const mod = await server.ssrLoadModule(file)
          const handler = mod[req.method]
          if (typeof handler !== 'function') {
            res.statusCode = 405
            return res.end()
          }

          const chunks = []
          for await (const chunk of req) chunks.push(chunk)
          const headers = {}
          for (const [key, value] of Object.entries(req.headers)) {
            if (typeof value === 'string' && !['host', 'connection', 'content-length'].includes(key)) {
              headers[key] = value
            }
          }
          const hasBody = !['GET', 'HEAD'].includes(req.method)
          const request = new Request(`http://localhost${req.url}`, {
            method: req.method,
            headers,
            body: hasBody ? Buffer.concat(chunks) : undefined,
          })

          const response = await handler(request)
          res.statusCode = response.status
          response.headers.forEach((value, key) => res.setHeader(key, value))
          res.end(Buffer.from(await response.arrayBuffer()))
        } catch (error) {
          server.ssrFixStacktrace(error)
          next(error)
        }
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // Make .env / .env.local server secrets visible to the /api functions in dev.
  // (Only VITE_* variables ever reach the browser bundle.)
  for (const [key, value] of Object.entries(loadEnv(mode, process.cwd(), ''))) {
    if (process.env[key] === undefined) process.env[key] = value
  }

  return {
    plugins: [react(), localApi()],
    server: {
      watch: {
        /*
         * This project lives inside a OneDrive folder, which locks files while it
         * syncs them. Vite's watcher treats that lock as a fatal EBUSY and takes
         * the whole dev server down with it — the crash looks unrelated to the
         * app, because nothing in the app caused it.
         *
         * `product images/` is working source art that nothing imports (the
         * served copies are converted into public/images/), so there is no
         * reason to watch it and every reason not to: it is the largest folder
         * in the project and the one OneDrive touches most.
         */
        ignored: ['**/product images/**'],
      },
    },
  }
})
