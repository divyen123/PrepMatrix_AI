import { createHash } from "node:crypto"
import { readFile, writeFile } from "node:fs/promises"
import { resolve } from "node:path"
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export const PWA_BUILD_VERSION_PLACEHOLDER = "__PREPMATRIX_BUILD_VERSION__"
export const PWA_PUBLIC_FINGERPRINT_PATHS = Object.freeze([
  "public/sw.js",
  "public/manifest.webmanifest",
  "public/pwa/brand-icon-192.png",
  "public/pwa/brand-icon-512.png",
  "public/pwa/brand-icon-maskable-192.png",
  "public/pwa/brand-icon-maskable-512.png",
  "public/pwa/brand-apple-touch-icon-180.png",
  "public/pwa/notification-badge-96.png",
])

function outputContents(output) {
  if (output.type === "chunk") return output.code
  if (typeof output.source === "string") return output.source
  if (output.source instanceof Uint8Array) return output.source
  return ""
}

export function createPwaAssetManifest(bundle, publicFingerprintInputs = []) {
  const outputs = Object.values(bundle)
    .filter((output) => !output.fileName.endsWith(".map"))
    .sort((left, right) => left.fileName.localeCompare(right.fileName))
  const assets = outputs
    .map((output) => output.fileName.replaceAll("\\", "/"))
    .filter((fileName) => fileName.startsWith("assets/"))
    .filter((fileName) => !fileName.startsWith("assets/backgrounds/"))
    .filter((fileName) => !fileName.startsWith("assets/pets/"))
    .map((fileName) => `/${fileName}`)
  const fingerprint = createHash("sha256")

  for (const output of outputs) {
    fingerprint.update(output.type)
    fingerprint.update("\0")
    fingerprint.update(output.fileName)
    fingerprint.update("\0")
    fingerprint.update(outputContents(output))
    fingerprint.update("\0")
  }

  const publicInputs = [...publicFingerprintInputs]
    .sort((left, right) => left.fileName.localeCompare(right.fileName))
  for (const input of publicInputs) {
    if (typeof input.fileName !== "string" || !(typeof input.contents === "string" || input.contents instanceof Uint8Array)) {
      throw new TypeError("PWA public fingerprint inputs require a fileName and string or byte contents.")
    }
    fingerprint.update("public\0")
    fingerprint.update(input.fileName.replaceAll("\\", "/"))
    fingerprint.update("\0")
    fingerprint.update(input.contents)
    fingerprint.update("\0")
  }

  return {
    version: fingerprint.digest("hex").slice(0, 20),
    assets: [...new Set(assets)].sort(),
  }
}

async function loadPwaPublicFingerprintInputs(projectRoot) {
  return Promise.all(PWA_PUBLIC_FINGERPRINT_PATHS.map(async (fileName) => ({
    fileName,
    contents: await readFile(resolve(projectRoot, fileName)),
  })))
}

export function prepmatrixPwaBuildPlugin() {
  let config
  let manifest

  return {
    name: "prepmatrix-pwa-build",
    apply: "build",
    configResolved(resolvedConfig) {
      config = resolvedConfig
    },
    async generateBundle(_outputOptions, bundle) {
      const publicFingerprintInputs = await loadPwaPublicFingerprintInputs(config.root)
      manifest = createPwaAssetManifest(bundle, publicFingerprintInputs)
      this.emitFile({
        type: "asset",
        fileName: "asset-manifest.json",
        source: `${JSON.stringify(manifest, null, 2)}\n`,
      })
    },
    async writeBundle(outputOptions) {
      if (!config || !manifest) {
        throw new Error("The PrepMatrix PWA asset manifest was not created.")
      }

      const workerSource = await readFile(resolve(config.root, "public", "sw.js"), "utf8")
      const placeholderCount = workerSource.split(PWA_BUILD_VERSION_PLACEHOLDER).length - 1
      if (placeholderCount !== 1) {
        throw new Error("public/sw.js must contain exactly one PWA build-version placeholder.")
      }

      const outputDirectory = outputOptions.dir
        ? resolve(config.root, outputOptions.dir)
        : resolve(config.root, config.build.outDir)
      const stampedWorker = workerSource.replace(PWA_BUILD_VERSION_PLACEHOLDER, manifest.version)
      await writeFile(resolve(outputDirectory, "sw.js"), stampedWorker)
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), prepmatrixPwaBuildPlugin()],
  server: {
    proxy: {
      "/api": {
        target: "http://localhost:8787",
        changeOrigin: true,
      },
    },
  },
})
