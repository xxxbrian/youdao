export type AppEnv = {
  Bindings: {
    API_KEY?: string
    PORT?: string
    /** Optional override cookie for Youdao requests (deployment secret only). */
    YOUDAO_COOKIE?: string
  }
}
