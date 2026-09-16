import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  serverExternalPackages: ['better-sqlite3'],
  // 產生自帶最小 node_modules 的 server.js，Docker 映像可以小很多
  output: 'standalone',
}

export default nextConfig
