/**
 * Small helpers shared by every /api function.
 *
 * Files and folders starting with "_" inside /api are not deployed as routes
 * by Vercel, so everything in api/_lib is private server code.
 */

export class HttpError extends Error {
  constructor(status, code, message) {
    super(message)
    this.status = status
    this.code = code
  }
}

export function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  })
}

/** A required environment variable, or a 503 that says which one is missing. */
export function env(name) {
  const value = process.env[name]
  if (!value) {
    throw new HttpError(503, 'not_configured', `Server is missing the ${name} setting.`)
  }
  return value
}

/** Wraps a handler so any thrown error becomes a JSON response, never a crash. */
export function route(handler) {
  return async (request) => {
    try {
      return await handler(request)
    } catch (error) {
      if (error instanceof HttpError) {
        if (error.status >= 500) console.error(`[api] ${error.code}: ${error.message}`)
        return json({ error: error.code, message: error.message }, error.status)
      }
      console.error('[api] unexpected error', error)
      return json(
        { error: 'server_error', message: 'Something went wrong on our side. Nothing has been charged.' },
        500,
      )
    }
  }
}

export async function readJson(request) {
  try {
    return await request.json()
  } catch {
    throw new HttpError(400, 'bad_request', 'The request body was not valid JSON.')
  }
}
