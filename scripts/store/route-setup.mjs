import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";

const DEFAULT_ROUTE = "bensonperry.com/api/store/*";
const DEFAULT_PUBLIC_URL = "https://bensonperry.com";
const WRANGLER_CONFIG = "wrangler.store-checkout.jsonc";

export function parseArgs(argv) {
  const args = {
    deploy: false,
    dryRun: false,
    help: false,
    publicUrl: DEFAULT_PUBLIC_URL,
    route: DEFAULT_ROUTE
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--deploy") args.deploy = true;
    else if (arg === "--dry-run") args.dryRun = true;
    else if (arg === "--help" || arg === "-h") args.help = true;
    else if (arg === "--public-url") args.publicUrl = argv[(index += 1)] || "";
    else if (arg.startsWith("--public-url=")) args.publicUrl = arg.slice("--public-url=".length);
    else if (arg === "--route") args.route = argv[(index += 1)] || "";
    else if (arg.startsWith("--route=")) args.route = arg.slice("--route=".length);
    else throw new Error(`Unknown option: ${arg}`);
  }

  return args;
}

export function sameOriginConfigUrl(publicUrl = DEFAULT_PUBLIC_URL) {
  const base = String(publicUrl || DEFAULT_PUBLIC_URL).replace(/\/+$/, "");
  return `${base}/api/store/config`;
}

export async function checkSameOriginRoute({ publicUrl = DEFAULT_PUBLIC_URL, fetchImpl = fetch } = {}) {
  const url = sameOriginConfigUrl(publicUrl);
  try {
    const response = await fetchImpl(url, { cache: "no-store" });
    const contentType = response.headers.get("content-type") || "";
    const data = contentType.includes("application/json") ? await response.json().catch(() => ({})) : {};
    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        url,
        detail: data.error || `HTTP ${response.status}`
      };
    }
    if (!contentType.includes("application/json")) {
      return {
        ok: false,
        status: response.status,
        url,
        detail: `unexpected content type: ${contentType || "missing"}`
      };
    }
    return {
      ok: true,
      status: response.status,
      url,
      detail: data.mode || "checkout API responded",
      config: data
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      url,
      detail: error.message
    };
  }
}

export function wranglerRouteDeployArgs({ route = DEFAULT_ROUTE, dryRun = false } = {}) {
  const args = ["--yes", "wrangler@latest", "deploy", "--config", WRANGLER_CONFIG, "--route", route];
  if (dryRun) args.push("--dry-run");
  return args;
}

export function routePermissionHint(output) {
  const text = String(output || "");
  if (/Authentication error|code:\s*10000|permission|not authorized|unauthorized/i.test(text)) {
    return "Cloudflare token needs Workers Routes edit permission for the bensonperry.com zone.";
  }
  return "";
}

export async function runWranglerRouteDeploy({ route = DEFAULT_ROUTE, dryRun = false, spawnImpl = spawn } = {}) {
  const args = wranglerRouteDeployArgs({ route, dryRun });
  const child = spawnImpl("npx", args, {
    shell: process.platform === "win32",
    stdio: ["ignore", "pipe", "pipe"]
  });

  let output = "";
  child.stdout.on("data", (chunk) => {
    output += chunk;
  });
  child.stderr.on("data", (chunk) => {
    output += chunk;
  });

  const code = await new Promise((resolve) => child.on("close", resolve));
  return {
    ok: code === 0,
    code,
    output,
    hint: code === 0 ? "" : routePermissionHint(output)
  };
}

function printStatus(label, status, detail = "") {
  console.log(`${status.padEnd(8)} ${label}${detail ? ` - ${detail}` : ""}`);
}

function usage() {
  console.log(`Store checkout route setup

Checks or attaches the preferred same-origin checkout API route.

Usage:
  npm run store:route:setup
  npm run store:route:setup -- --dry-run
  npm run store:route:setup -- --deploy

Options:
  --deploy            Deploy the Worker with the preferred route attached.
  --dry-run           Run Wrangler route deployment checks without uploading.
  --public-url <url>  Public site URL to check. Defaults to https://bensonperry.com.
  --route <pattern>   Cloudflare Worker route. Defaults to bensonperry.com/api/store/*.
`);
}

export async function runRouteSetup({
  deploy = false,
  dryRun = false,
  publicUrl = DEFAULT_PUBLIC_URL,
  route = DEFAULT_ROUTE,
  fetchImpl = fetch,
  spawnImpl = spawn
} = {}) {
  const before = await checkSameOriginRoute({ publicUrl, fetchImpl });
  const result = {
    before,
    deploy: null,
    after: null,
    route
  };

  if (dryRun || deploy) {
    result.deploy = await runWranglerRouteDeploy({ route, dryRun, spawnImpl });
    if (deploy && result.deploy.ok) {
      result.after = await checkSameOriginRoute({ publicUrl, fetchImpl });
    }
  }

  return result;
}

async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (args.help) {
    usage();
    return;
  }

  const result = await runRouteSetup(args);
  console.log("Store checkout route setup");
  console.log("");
  printStatus("route", "target", result.route);
  printStatus("same-origin API", result.before.ok ? "ok" : "missing", result.before.detail);

  if (!args.deploy && !args.dryRun) {
    console.log("");
    console.log("Route deployment skipped. Pass --deploy after the Cloudflare token has Workers Routes edit permission.");
    if (!result.before.ok) process.exitCode = 1;
    return;
  }

  printStatus("wrangler route deploy", result.deploy.ok ? (args.dryRun ? "dry-run" : "deployed") : "failed", result.deploy.hint || "");
  if (result.after) {
    printStatus("same-origin API after deploy", result.after.ok ? "ok" : "missing", result.after.detail);
  }

  if (!result.deploy.ok || result.after?.ok === false) {
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
