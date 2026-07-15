import { spawnSync } from "node:child_process";
import { readdirSync, statSync } from "node:fs";
import path from "node:path";

const rootDir = path.resolve(import.meta.dirname, "..");
const targets = process.argv.slice(2);
const chunkSize = Number(process.env.AOL_STAGE_CHUNK || 75);

function walk(absDir) {
  const files = [];
  for (const entry of readdirSync(absDir, { withFileTypes: true })) {
    const abs = path.join(absDir, entry.name);
    if (entry.isDirectory()) files.push(...walk(abs));
    else if (entry.isFile()) files.push(abs);
  }
  return files;
}

function relPath(abs) {
  return path.relative(rootDir, abs).replaceAll("\\", "/");
}

function git(args, input = "") {
  const result = spawnSync("git", ["-c", `safe.directory=${rootDir.replaceAll("\\", "/")}`, "-C", rootDir, ...args], {
    input,
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 100,
  });
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || `git ${args.join(" ")} failed`);
  }
  return result.stdout;
}

function isTracked(rel) {
  const result = spawnSync(
    "git",
    ["-c", `safe.directory=${rootDir.replaceAll("\\", "/")}`, "-C", rootDir, "ls-files", "--error-unmatch", rel],
    { encoding: "utf8", stdio: ["ignore", "ignore", "ignore"] },
  );
  return result.status === 0;
}

const allFiles = targets.flatMap((target) => {
  const abs = path.resolve(rootDir, target);
  return statSync(abs).isDirectory() ? walk(abs) : [abs];
});

const relFiles = allFiles.map(relPath).filter((rel) => !isTracked(rel));
console.log(`Staging ${relFiles.length} files with git plumbing.`);

for (let i = 0; i < relFiles.length; i += chunkSize) {
  const chunk = relFiles.slice(i, i + chunkSize);
  console.log(`chunk ${i + 1}-${Math.min(i + chunkSize, relFiles.length)} of ${relFiles.length}`);
  const input = chunk.join("\n");
  const shas = git(["hash-object", "-w", "--stdin-paths"], input)
    .trim()
    .split(/\r?\n/)
    .filter(Boolean);
  if (shas.length !== chunk.length) {
    throw new Error(`Expected ${chunk.length} shas, got ${shas.length}`);
  }
  const indexInfo = chunk.map((file, idx) => `100644 ${shas[idx]}\t${file}`).join("\n") + "\n";
  git(["update-index", "--add", "--index-info"], indexInfo);
}

console.log("Done.");
