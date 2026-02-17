// TODO: Adjust this script to work with the new CI/CD pipeline
import { execSync } from "node:child_process"
import { writeFileSync, existsSync, readFileSync } from "node:fs"

let versionInfo = {
  gitHash: "unknown",
  gitDate: new Date().toISOString(),
}

try {
  versionInfo.gitHash = execSync("git rev-parse --short HEAD").toString().trim()
  versionInfo.gitDate = execSync("git log -1 --format=%cd --date=iso").toString().trim()
} catch (e) {
  // Git not available, use existing version-info.json or defaults
  if (existsSync("src/version-info.json")) {
    try {
      const existing = JSON.parse(readFileSync("src/version-info.json", "utf8"))
      versionInfo = existing
    } catch (err) {
      // Ignore parse errors
    }
  }
}

writeFileSync("src/version-info.json", JSON.stringify(versionInfo, null, 2))
