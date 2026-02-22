import isURL from "validator/lib/isURL"

const isValidAuth = (auth) => {
  const { server, token, username, password, sessionToken } = auth ?? {}
  const validServer = server && isURL(server, { require_protocol: true })
  if (sessionToken && validServer && token) {
    return true
  }
  if (!validServer) {
    return false
  }
  return !!(token || (username && password))
}

export default isValidAuth
