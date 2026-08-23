// 단일 .exe 패키징 스크립트.
// 1) frontend를 빌드하고 dist 전체를 SEA 자산(web/...)으로 등록한다.
// 2) db/migrations/*.sql을 SEA 자산(migrations/...)으로 등록한다.
// 3) esbuild로 backend를 CJS 번들 하나로 묶는다(node:* 내장 모듈은 그대로 둠).
// 4) Node의 Single Executable Applications 기능으로 blob을 만들고,
//    node.exe 사본에 postject로 주입해 최종 exe를 만든다.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import esbuild from "esbuild";
import { inject } from "postject";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const BACKEND_ROOT = path.resolve(__dirname, "..");
const REPO_ROOT = path.resolve(BACKEND_ROOT, "..");
const FRONTEND_DIST = path.join(REPO_ROOT, "frontend", "dist");
const MIGRATIONS_DIR = path.join(BACKEND_ROOT, "src", "db", "migrations");
const SYSTRAY_HELPER_PATH = path.join(
  path.dirname(require.resolve("systray2/package.json")),
  "traybin",
  "tray_windows_release.exe"
);
const OUT_DIR = path.join(BACKEND_ROOT, "dist-exe");
const BUNDLE_PATH = path.join(OUT_DIR, "bundle.cjs");
const BLOB_PATH = path.join(OUT_DIR, "sea-prep.blob");
const SEA_CONFIG_PATH = path.join(OUT_DIR, "sea-config.json");
const EXE_NAME = "CogCommLog.exe";
const EXE_PATH = path.join(OUT_DIR, EXE_NAME);
const SEA_FUSE = "NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2";

// npm/npx는 Windows에서 .cmd 래퍼라 shell:true가 필요하지만, node.exe를 직접
// 실행할 때 shell:true를 쓰면 경로에 공백(예: "Program Files")이 있을 때
// cmd.exe가 명령 자체를 못 찾는다. 그래서 shell 여부를 호출부에서 지정한다.
function run(cmd, args, { shell = false, ...options } = {}) {
  console.log(`$ ${cmd} ${args.join(" ")}`);
  execFileSync(cmd, args, { stdio: "inherit", shell, ...options });
}

function walk(dir, base = dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...walk(full, base));
    } else {
      out.push(path.relative(base, full).split(path.sep).join("/"));
    }
  }
  return out;
}

async function main() {
  fs.rmSync(OUT_DIR, { recursive: true, force: true });
  fs.mkdirSync(OUT_DIR, { recursive: true });

  console.log("\n[1/5] frontend 빌드");
  run("npm", ["run", "build", "-w", "frontend"], { cwd: REPO_ROOT, shell: true });
  if (!fs.existsSync(FRONTEND_DIST)) {
    throw new Error(`frontend build output not found: ${FRONTEND_DIST}`);
  }

  console.log("\n[2/5] backend 번들(esbuild)");
  esbuild.buildSync({
    entryPoints: [path.join(BACKEND_ROOT, "src", "index.ts")],
    outfile: BUNDLE_PATH,
    bundle: true,
    platform: "node",
    format: "cjs",
    target: "node22",
    logLevel: "info",
  });

  console.log("\n[3/5] sea-config.json 생성 (frontend/dist + migrations 내장)");
  const assets = {};
  for (const rel of walk(FRONTEND_DIST)) {
    assets[`web/${rel}`] = path.join(FRONTEND_DIST, rel).split(path.sep).join("/");
  }
  for (const file of fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql"))) {
    assets[`migrations/${file}`] = path.join(MIGRATIONS_DIR, file).split(path.sep).join("/");
  }
  if (!fs.existsSync(SYSTRAY_HELPER_PATH)) {
    throw new Error(`systray helper binary not found: ${SYSTRAY_HELPER_PATH}`);
  }
  assets["systray-helper.exe"] = SYSTRAY_HELPER_PATH.split(path.sep).join("/");
  const seaConfig = {
    main: BUNDLE_PATH.split(path.sep).join("/"),
    output: BLOB_PATH.split(path.sep).join("/"),
    disableExperimentalSEAWarning: true,
    assets,
  };
  fs.writeFileSync(SEA_CONFIG_PATH, JSON.stringify(seaConfig, null, 2));
  console.log(`자산 ${Object.keys(assets).length}개 등록됨`);

  console.log("\n[4/5] SEA blob 생성");
  run(process.execPath, ["--experimental-sea-config", SEA_CONFIG_PATH]);

  console.log("\n[5/5] node.exe 복사 + blob 주입(postject)");
  // CLI(npx postject ...)로 셸을 거치면 저장소 경로에 있는 공백/한글 때문에
  // Windows에서 "Can't read resource file" 오류가 났다 — 셸 없이 postject의
  // JS API를 직접 호출해서 우회한다.
  fs.copyFileSync(process.execPath, EXE_PATH);
  await inject(EXE_PATH, "NODE_SEA_BLOB", fs.readFileSync(BLOB_PATH), {
    sentinelFuse: SEA_FUSE,
    overwrite: true,
  });

  console.log(`\n완료: ${EXE_PATH}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
