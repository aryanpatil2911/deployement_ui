const deploymentLogsPath = "./DeploymentLogs";
const deploymentLogsCsvUrl =
  `${deploymentLogsPath}/DeploymentLogs.csv?v=` + Date.now();


const githubRepoOwner = window.GITHUB_REPO_OWNER || "LD-Global-Services";
const githubRepoName = window.GITHUB_REPO_NAME || "Deployment";
const githubWorkflowFile = window.GITHUB_ACTIONS_WORKFLOW_FILE || "create-deployment-issue.yml";
const githubWorkflowRef = window.GITHUB_ACTIONS_WORKFLOW_REF || "main";


// PAT stored in localStorage only — never in git
const PAT_STORAGE_KEY = "gh_deployment_pat";
let _pendingDeploymentAction = null;

function getStoredPat() {
  return localStorage.getItem(PAT_STORAGE_KEY) || "";
}


function storePatAndProceed() {
  const val = (document.getElementById("patInput")?.value || "").trim();
  if (!val) {
    document.getElementById("patInput")?.focus();
    return;
  }
  localStorage.setItem(PAT_STORAGE_KEY, val);
  document.getElementById("patModal")?.classList.add("hidden");
  document.getElementById("patInput").value = "";

  if (_pendingDeploymentAction) {
    const p = _pendingDeploymentAction;
    _pendingDeploymentAction = null;

    if (p.actionType === "CONFIG") {

        sessionStorage.setItem("configClient", p.client);
        sessionStorage.setItem("configApp", p.app);
        sessionStorage.setItem("configEnv", p.fromEnv);

        location.href = "config.html";

    } else {

        submitDeploymentRequest(
            p.client,
            p.app,
            p.fromEnv,
            p.toEnv,
            p.version,
            p.actionType
        );
    }
}
}



window.saveDeploymentToken = storePatAndProceed;

window.cancelPatModal = function () {
  document.getElementById("patModal")?.classList.add("hidden");
  document.getElementById("patInput").value = "";
  _pendingDeploymentAction = null;
  setActionStatus("Action cancelled — no token provided.", "error");
};
window.resetDeploymentToken = function () {
  localStorage.removeItem(PAT_STORAGE_KEY);
  setActionStatus("Token cleared. You will be prompted on next action.", "info");
};

function setActionStatus(message, status = "info") {
  const el = document.getElementById("actionStatus");
  if (!el) return;

  const statusClasses = {
    info: "border-blue-500/40 bg-blue-500/10 text-blue-200",
    success: "border-emerald-500/40 bg-emerald-500/10 text-emerald-200",
    error: "border-red-500/40 bg-red-500/10 text-red-200",
  };

  const selected = statusClasses[status] || statusClasses.info;
  el.className = `mb-6 rounded-xl border px-4 py-3 text-sm font-medium shadow-lg ${selected}`;
  el.textContent = message;
  el.classList.remove("hidden");
}

function hideActionStatus() {
  const el = document.getElementById("actionStatus");
  if (!el) return;
  el.classList.add("hidden");
}



let deployments = [];
let upgradeContext = null;

const parseVersionToNumericArray = (v) =>
  !v || v === "—" || v === "-"
    ? []
    : v
        .replace(/[^0-9.]/g, "")
        .split(".")
        .map((n) => parseInt(n || 0, 10));

/*
function compareVersions(vA, vB) {
  const tA = parseVersionToNumericArray(vA),
    tB = parseVersionToNumericArray(vB);
  const max = Math.max(tA.length, tB.length);
  for (let i = 0; i < max; i++) {
    const nA = tA[i] || 0,
      nB = tB[i] || 0;
    if (nA !== nB) return nA - nB;
  }
  return 0;
}
*/


function getVersion(file) {
  return file.match(/\d+\.\d+\.\d+\.\d+/)?.[0];
}
function compareVersions(v1, v2) {
  const a = v1.split('.').map(Number);
  const b = v2.split('.').map(Number);

  for (let i = 0; i < 4; i++) {
    if (a[i] !== b[i]) return a[i] - b[i];
  }
  return 0;
}


function parseDeploymentDateTime(value) {
  if (!value) {
    return 0;
  }

  const parsed = new Date(
    value.replace(" UTC", "Z").replace(" ", "T"),
  ).getTime();
  return Number.isNaN(parsed) ? 0 : parsed;
}

function getDeploymentDateTime(row) {
  return (
    row.DeploymentEndDateTime ||
    row.DeploymentStartDateTime ||
    row.DeploymentDateTime ||
    ""
  );
}


async function loadData() {
  const container = document.getElementById("matrix-body");
  try {
    const res = await fetch(deploymentLogsCsvUrl);
    if (!res.ok) throw new Error();
    deployments = parseCSV(await res.text());
    populateAppDropdown();
    renderTable();
  } catch (e) {
    if (bundledDeploymentLogs && bundledDeploymentLogs.length) {
      deployments = bundledDeploymentLogs;
      populateAppDropdown();
      renderTable();
      return;
    }

    container.innerHTML = `<tr><td colspan="4" class="p-6 text-center text-red-400 font-bold"><i class="fa-solid fa-triangle-exclamation mr-2"></i> Failed to load data</td></tr>`;
  }
}

function parseCSV(text) {
  const lines = text.trim().split(/\r?\n/);
  const headers = lines[0].split(",").map((h) => h.replace(/"/g, "").trim());

  return lines.slice(1).map((line) => {
    const values = line
      .match(/(".*?"|[^",]+)(?=\s*,|\s*$)/g)
      .map((v) => v.replace(/"/g, "").trim());

    const row = {};
    headers.forEach((h, i) => (row[h] = (values[i] || "").trim()));
    return row;
  });
}

function populateAppDropdown() {
  const apps = [
    ...new Set(deployments.map((d) => d.Application).filter(Boolean)),
  ].sort();
  const select = document.getElementById("appFilter");
  select.innerHTML = `<option value="">All Applications</option>`;
  apps.forEach(
    (app) => (select.innerHTML += `<option value="${app}">${app}</option>`),
  );
}

function renderTable() {
  const filterVal = document.getElementById("appFilter").value;
  const search = document.getElementById("search").value.toLowerCase().trim();

  const filtered = deployments.filter((d) => {
    const appMatch =
      !filterVal || d.Application === filterVal;

    const searchMatch =
      !search ||
      d.Client.toLowerCase().includes(search) ||
      d.Application.toLowerCase().includes(search) ||
      d.Version.toLowerCase().includes(search);

    return appMatch && searchMatch;
  });

  const grouped = {};

  filtered.forEach((row) => {
    const key = `${row.Client}-${row.Application}`;

    if (!grouped[key]) {
      grouped[key] = {
        client: row.Client,
        app: row.Application,
        uat: "-",
        prod: "-",
        uatTime: 0,
        prodTime: 0,
        uatStatus: "",
        prodStatus: "",
        uatActionUrl: "",
        prodActionUrl: "",
      };
    }

    const time = parseDeploymentDateTime(
    row.DeploymentEndDateTime || row.DeploymentStartDateTime
    );
    const env = (row.Environment || "").trim().toUpperCase();

    if (env === "UAT") {
      if (time > grouped[key].uatTime) {
        grouped[key].uat = row.Version;
        grouped[key].uatTime = time;
        grouped[key].uatStatus = row.DeploymentStatus;
        grouped[key].uatActionUrl = row.ActionRunUrl;
      }
    }

    if (env === "PROD") {
      if (time > grouped[key].prodTime) {
        grouped[key].prod = row.Version;
        grouped[key].prodTime = time;
        grouped[key].prodStatus = row.DeploymentStatus;
        grouped[key].prodActionUrl = row.ActionRunUrl;
      }
    }
  });

  let htmlBuffer = "";

  Object.values(grouped).forEach((item) => {
    if (item.client === "QA") return;

    const moduleName = item.app;

    htmlBuffer += `
        <tr class="hover:bg-slate-800/30 bg-slate-900/20 transition group">

            <td class="p-4 pl-8 font-extrabold text-white border-r border-slate-800/60">
                ${item.client.replace(/_/g, " ")}
            </td>

            <td class="p-4 font-bold text-slate-100 border-r border-slate-800/60">
                ${moduleName.replace(/_/g, " ")}
            </td>


            <!-- UAT -->
              <td class="p-4 text-center bg-slate-950/20 border-r border-slate-800/60">

              <div class="flex items-center justify-center">
              <div class="w-24 flex justify-start ml-6">


              

            </div>

             <div class="w-32 flex flex-col items-center">

             <span 
               onclick="${
                 item.uatActionUrl
                 ? `window.open('${item.uatActionUrl}','actionWindow','width=600,height=500,left=200,top=100,resizable=yes,scrollbars=yes')`
                 : `alert('No Action URL available.')`
                 }"
                class="font-mono text-xs font-bold px-2.5 py-1 rounded inline-block min-w-[90px] cursor-pointer
             
             ${
              item.uat === "-"
              ? "text-slate-600"
              : ["Failed", "Cancelled"].includes(item.uatStatus)
              ? "bg-slate-950 border border-red-500/60 text-red-600"
              : "bg-slate-950 border border-emerald-500/60 text-emerald-400"
              }">
              
             ${item.uat}
             <br>

            <span class="text-[9px] text-white text-center block">
             (${item.uatStatus === "Cancelled" ? "Failed" : item.uatStatus})
            </span>

              </div>

              <div class="w-24"></div>

              </div>

    <div class="mt-2 flex justify-center gap-1 flex-wrap">

  <!-- Rollback -->
  <button
    onclick="triggerPipelineAction('ROLLBACK','${item.client}','${moduleName}','UAT','UAT','','${item.uat}')"
    class="px-2 py-1 text-[9px] bg-slate-800 border border-slate-700 text-slate-300 rounded hover:bg-amber-600 hover:border-amber-500 hover:text-white font-bold uppercase tracking-wider transition-all shadow-sm">
    ROLLBACK
  </button>

  <!-- Redeploy -->
  <button
    onclick="triggerPipelineAction('REDEPLOY','${item.client}','${moduleName}','UAT','UAT','','${item.uat}')"
    class="px-2 py-1 text-[9px] bg-slate-800 border border-slate-700 text-slate-300 rounded hover:bg-amber-600 hover:border-amber-500 hover:text-white font-bold uppercase tracking-wider transition-all shadow-sm">
    REDEPLOY
  </button>

  <!-- Upgrade -->
  <button
    onclick="openUpgradeWizard('${item.client}','${moduleName}','${item.uat}','UAT')"
    class="px-2 py-1 text-[9px] rounded bg-blue-600/10 border border-blue-500/30 text-blue-500  hover:bg-blue-600 hover:border-blue-500 hover:text-white font-bold uppercase tracking-wider transition-all shadow-sm">
    UPGRADE
  </button>

  <!-- Promote -->
  ${
    item.uatStatus === "Succeeded"
      ? `
      <button
        onclick="triggerPipelineAction('PROMOTION','${item.client}','${moduleName}','UAT','PROD','','${item.uat}')"
        
        class="px-2 py-1 text-[9px] bg-purple-600/10 border border-purple-500/30 text-purple-500 rounded hover:bg-purple-600 hover:border-purple-500 hover:text-white font-bold uppercase tracking-wider transition-all shadow-sm">
        PROMOTE
      </button>
      `
      : `
      <button
        disabled
        class="px-2 py-1 text-[9px] bg-gray-700 text-gray-500 rounded cursor-not-allowed">
        PROMOTE
      </button>
      `
  }

<button
onclick="openConfig('${item.client}','${moduleName}','UAT')"
class="px-2 py-1 text-[9px] bg-slate-800 border border-slate-700 text-slate-300 rounded hover:bg-amber-600 hover:border-amber-500 hover:text-white font-bold uppercase tracking-wider transition-all shadow-sm">
CONFIG
</button>


</div>
       </td>


           <!-- PROD -->
           <td class="p-4 text-center bg-slate-950/10">

            <span 
               onclick="${
                  item.prodActionUrl
                  ? `window.open('${item.prodActionUrl}','actionWindow','width=600,height=500,left=200,top=100,resizable=yes,scrollbars=yes')`
                  : `alert('No Action URL available.')`
                }"
               class="font-mono text-xs font-bold px-2.5 py-1 rounded inline-block min-w-[90px] cursor-pointer
                
            ${
              item.prod === "-"
               ? "text-slate-600"
               : item.prodStatus === "Failed" || item.prodStatus === "Cancelled"
               ? "bg-slate-950 border border-red-500/60 text-red-400"
               : "bg-slate-950 border border-emerald-500/60 text-emerald-400"
            }">
              ${item.prod}
            </span>
            <br>
            ${item.prodStatus && item.prodStatus !== "Cancelled"
            ? `<span class="text-[9px] text-white text-center block">
            ${item.prodStatus}
            </span>`
           : item.prodStatus === "Cancelled"
            ? `<span class="text-[9px] text-white text-center block">
            Failed
           </span>`
           : ""
           }            
            

            <div class="mt-2 flex justify-center gap-1">

            ${
            item.prod !== "-" ? `
            <button
               onclick="triggerPipelineAction('ROLLBACK','${item.client}','${moduleName}','PROD','PROD','','${item.prod}')"
               class="px-2 py-1 text-[9px] bg-slate-800 border border-slate-700 text-slate-300 rounded hover:bg-amber-600 hover:border-amber-500 hover:text-white font-bold uppercase tracking-wider transition-all shadow-sm">
               ROLLBACK
            </button>
              `: `
           <button
            disabled
            class="px-2 py-1 text-[9px] bg-gray-700 text-gray-500 rounded cursor-not-allowed">
            ROLLBACK
            </button>
           `}

            ${
            item.prod !== "-" ? `
            <button
            onclick="triggerPipelineAction('REDEPLOY','${item.client}','${moduleName}','PROD','PROD','','${item.prod}')"
            class="px-2 py-1 text-[9px] bg-slate-800 border border-slate-700 text-slate-300 rounded hover:bg-emerald-600 hover:border-emerald-500 hover:text-white font-bold uppercase tracking-wider transition-all shadow-sm">
            REDEPLOY
            </button>
           ` : `
            <button
            disabled
            class="px-2 py-1 text-[9px] bg-gray-700 text-gray-500 rounded cursor-not-allowed">
            REDEPLOY
           </button>
           `}


${
item.prod !== "-" ? `
<button
onclick="openConfig('${item.client}','${moduleName}','PROD')"
class="px-2 py-1 text-[9px] bg-slate-800 border border-slate-700 text-slate-300 rounded hover:bg-emerald-600 hover:border-emerald-500 hover:text-white font-bold uppercase tracking-wider transition-all shadow-sm">
CONFIG
</button>
` : `
<button
    disabled
    class="px-2 py-1 text-[9px] bg-gray-700 text-gray-500 rounded cursor-not-allowed">
    CONFIG
</button>
`}
           </div>
          </td>

        </tr>`;
  });


  document.getElementById("matrix-body").innerHTML =
    htmlBuffer ||
    `<tr><td colspan="4" class="p-8 text-center text-slate-400">No records found</td></tr>`;
}

function getUpgradeSourceRoute(client, targetEnv) {
  if (targetEnv === "UAT") {
    return { sourceClient: client, sourceEnvironment: "UAT" };
  }
  if (targetEnv === "PROD") {
    return { sourceClient: client, sourceEnvironment: "UAT" };
  }
  return { sourceClient: client, sourceEnvironment: targetEnv };
}

function getRollbackVersion(client, app, env) {
  const successful = deployments
    .filter(
      (d) =>
        d.Client === client &&
        d.Application === app &&
        d.Environment === env &&
        d.DeploymentStatus === "Succeeded" &&
        d.Version
    )
    .sort((a, b) => compareVersions(a.Version, b.Version));

  if (successful.length < 2) return "";

  return successful[successful.length - 2].Version;
}

window.triggerPipelineAction = function () {
  const action = arguments[0];
  const client = arguments[1] || "";
  const app = arguments[2] || "";
  const fromEnv = arguments[3] || "";
  const toEnv = arguments[4] || "";
  const releaseId = arguments[5] || "";
  const version = arguments[6] || "";

  /*const workflowUrl = `https://github.com/LD-Global-Services/Deployment/actions/workflows/module-deploy.yml?query=branch%3Amain+event%3Aworkflow_dispatch`;*/
  
  hideActionStatus();

  if (action === "PROMOTION") {
    submitDeploymentRequest(
      client,
      app,
      fromEnv,
      toEnv,
      version,
      "PROMOTION",
    );
    return;
  }


 if (action === "UPGRADE") {

  const qaFiles = deployments
    .filter(d =>
      (d.Environment || "").trim().toUpperCase() === "QA" &&
      d.DeploymentStatus === "Succeeded" &&
      d.Version
    )
    .map(d => d.Version)
    .sort((a, b) => compareVersions(a, b));

  const latestQA = qaFiles.length
    ? qaFiles[qaFiles.length - 1]
    : version;

  submitDeploymentRequest(
    client, 
    app, 
    fromEnv, 
    toEnv, 
    latestQA, 
    "UPGRADE" 
  );
  return;
}
  

  if (action === "ROLLBACK") {
    const rollbackVersion = getRollbackVersion(client, app, fromEnv);

    if (!rollbackVersion) {
      setActionStatus(
        `No earlier successful version found for ${client} ${app} in ${fromEnv}. Rollback cannot be triggered.`,
        "error",
      );
      return;
    }

    submitDeploymentRequest(
      client,
      app,
      fromEnv,
      toEnv,
      rollbackVersion,
      "ROLLBACK",
    );
    return;
  }

  if (action === "REDEPLOY") {
    submitDeploymentRequest(
      client,
      app,
      fromEnv,
      toEnv,
      version,
      "REDEPLOY",
    );
    return;
  }

  submitDeploymentRequest(client, app, fromEnv, toEnv, version, "DEPLOY");
};

window.openConfig = function(client, app, env) {

  const pat = getStoredPat();

  if (!pat) {
    _pendingDeploymentAction = {
      actionType: "CONFIG",
      client,
      app,
      fromEnv: env,
      toEnv: env,
      version: ""
    };

    document.getElementById("patModal")?.classList.remove("hidden");
    document.getElementById("patInput")?.focus();
    return;
  }

  sessionStorage.setItem("configClient", client);
  sessionStorage.setItem("configApp", app);
  sessionStorage.setItem("configEnv", env);

  location.href = "config.html";
};


async function submitDeploymentRequest(
  client,
  app,
  fromEnv,
  toEnv,
  version,
  actionType = "PROMOTION",
) {
  const module = app;

  if (!client || !module || !version || !toEnv) {
    setActionStatus("Missing request details. Please refresh and retry.", "error");
    return;
  }

  const pat = getStoredPat();
  if (!pat) {
    _pendingDeploymentAction = { client, app, fromEnv, toEnv, version, actionType };
    document.getElementById("patModal")?.classList.remove("hidden");
    document.getElementById("patInput")?.focus();
    return;
  }

  setActionStatus(
    `Submitting ${actionType} request for ${client} ${module} ${version} (${toEnv})...`,
    "info",
  );

  try {
    const response = await fetch(
      `https://api.github.com/repos/${githubRepoOwner}/${githubRepoName}/actions/workflows/${githubWorkflowFile}/dispatches`,
      {
        method: "POST",
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${pat}`,
          "Content-Type": "application/json",
          "X-GitHub-Api-Version": "2022-11-28",
        },
        body: JSON.stringify({
          ref: githubWorkflowRef,
          inputs: {
            client,
            module,
            version,
            stage: toEnv,
            action: actionType,
            fromenv: fromEnv || "",
          },
        }),
      },
    );

    if (response.status === 401) {
      localStorage.removeItem(PAT_STORAGE_KEY);
      setActionStatus("Token rejected (401). Click the button again to re-enter your PAT.", "error");
      return;
    }

    if (!response.ok) {
      const errText = await response.text().catch(() => "");
      throw new Error(errText || `GitHub API error (${response.status})`);
    }

    setActionStatus(
      `${actionType} request submitted. GitHub Actions will create the issue and trigger deployment shortly.`,
      "success",
    );
  } catch (err) {
    setActionStatus(
      `Failed to submit request: ${err.message || "Unknown error"}`,
      "error",
    );
  }
}

/*
async function promoteAndDeploy(
  client,
  app,
  fromEnv,
  toEnv,
  releaseId,
  version,
  actionType = "PROMOTION",
) {
  const module = app;

  // ADDED PAT CHECK 
  const pat = getStoredPat();
  if (!pat) {
    _pendingDeploymentAction = {
      client,
      app,
      fromEnv,
      toEnv,
      releaseId,
      version,
      actionType,
    };

    document.getElementById("patModal")?.classList.remove("hidden");
    document.getElementById("patInput")?.focus();
    return;
  }

  const title = encodeURIComponent(
    `[${actionType}] ${module} deployment request for ${client}`,
  );

  const body = encodeURIComponent(
    `### Run Parameters
- **client**: ${client}
- **module**: ${module}
- **version**: ${version}
- **stage**: ${toEnv}
- **action**: ${actionType}`,
  );

  window.open(
    `https://github.com/LD-Global-Services/Deployment/issues/new?title=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}`,
    "_blank"
  );
}
*/

window.openUpgradeWizard = function (client, app, curVer, targetEnv) {
  upgradeContext = { client, app, currentVersion: curVer, targetEnv };

  document.getElementById("upgradeTargetSubtitle").textContent =
    `App: ${app} | Active ${targetEnv} Version: ${curVer}`;

  const label = document.getElementById("upgradeSelectLabel");

let matchedVersions = deployments
  .filter(
    (d) =>
      (d.Environment || "").trim().toUpperCase() === "QA" &&
      d.DeploymentStatus === "Succeeded" &&
      d.Version
  )
  .map((d) => d.Version);

  matchedVersions = [...new Set(matchedVersions)];

  const base = curVer && curVer !== "-" ? curVer : "0";

 const newerVers = matchedVersions
  .sort((a, b) => compareVersions(a, b));

  const select = document.getElementById("upgradeVersionSelect");
  const confirmBtn = document.getElementById("upgradeConfirmBtn");
  const warningBox = document.getElementById("upgradeNoVersionsWarning");

  select.innerHTML = "";

  if (newerVers.length === 0) {
    select.classList.add("hidden");
    confirmBtn.classList.add("hidden");
    warningBox.classList.remove("hidden");
  } else {
    select.classList.remove("hidden");
    confirmBtn.classList.remove("hidden");
    warningBox.classList.add("hidden");

    newerVers.forEach((v) => {
      select.innerHTML += `<option value="${v}">Version ${v}</option>`;
    });
  }

  document.getElementById("upgradeModal").classList.remove("hidden");
};

window.submitUpgradeAction = function () {
  if (!upgradeContext) return;

  const targetVersion = document.getElementById("upgradeVersionSelect").value;

  const match = deployments.find(
    (d) =>
      d.Application === upgradeContext.app &&
      d.Version === targetVersion &&
      d.Environment === "UAT",
  );

  const releaseId = match ? match.ReleaseId || "" : "";

  window.triggerPipelineAction(
    "UPGRADE",
    upgradeContext.client,
    upgradeContext.app,
    "UAT",
    upgradeContext.targetEnv,
    releaseId,
    targetVersion,
  );

  window.closeUpgradeModal();
};



window.closeUpgradeModal = () => {
  document.getElementById("upgradeModal").classList.add("hidden");
  upgradeContext = null;
};
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") window.closeUpgradeModal();
});
window.onload = loadData;

window.clearFilters = function () {
  document.getElementById("appFilter").value = "";
  document.getElementById("search").value = "";
  renderTable();
};