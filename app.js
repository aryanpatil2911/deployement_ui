const url ="https://api.github.com/repos/sugaredcookie/linedata-config-store/contents/applications/applications.json";

// change the url to the actual working url

// the url should be changed with the actual url of the location of the json file
// note - along with the csv file, there must be a json file with the same data (just json format) for the frontend to fetch
// so the url should look like: https://api.github.com/repos/github_username/github_repo_name/folder_name/file_name/file_name.json

let rows = [];
let deployments = [];

async function loadData() {
    try {
        const response =
            await fetch(url);

        const githubFile =
            await response.json();

        rows =
            JSON.parse(
                atob(
                    githubFile.content.replace(/\n/g, "")
                )
            );

        buildDeployments();
        loadFilters();
        renderTable();
    }
    catch(error){

        console.error(error);

        document.getElementById(
            "tableContainer"
        ).innerHTML =
        "<div class='text-red-500'>Failed to load data</div>";
    }
}

function buildDeployments(){
    const map = {};
    rows.forEach(row => {
        const key =
            `${row.Client}_${row.Application}_${row.Module}`;

        if(!map[key]){

            map[key] = {
                client: row.Client,
                application: row.Application,
                module: row.Module,
                uat: null,
                prod: null
            };
        }

        if(row.Environment === "UAT"){
            map[key].uat = row;
        }

        if(row.Environment === "PROD"){
            map[key].prod = row;
        }
    });

    deployments = Object.values(map);
}

function loadFilters(){
    const versions =
        [...new Set(
            rows.map(row => row.Version)
        )];
    const clients =
        [...new Set(
            deployments.map(x => x.client)
        )];
    const apps =
        [...new Set(
            deployments.map(x => x.application)
        )];
    const clientSelect =
        document.getElementById(
            "clientFilter"
        );
    const appSelect =
        document.getElementById(
            "applicationFilter"
        );
    clients.forEach(client => {

        clientSelect.innerHTML +=
        `<option>${client}</option>`;
    });
    apps.forEach(app => {

        appSelect.innerHTML +=
        `<option>${app}</option>`;
    });
    
    const versionSelect =
        document.getElementById(
            "versionFilter"
        );

    versions.forEach(version => {

        versionSelect.innerHTML +=
        `<option>${version}</option>`;
    });
}

function createIssue(
    type,
    client,
    project,
    sourceEnv,
    targetEnv,
    releaseId,
    version
){
    const title = encodeURIComponent(
        `[${type.toUpperCase()}]`
    );

    const body = encodeURIComponent(
        `Client
        ${client}

        Project
        ${project}

        Source Environment
        ${sourceEnv}

        Target Environment
        ${targetEnv}

        Release ID
        ${releaseId}

        Version
        ${version}

        Request Type
        ${type.toUpperCase()}

        Change Reason
        Requested from Dashboard`
    );

    // window.open(
        // `https://github.com/sugaredcookie/linedata_task_1/issues/new?title=${title}&body=${body}`,
    //     "_blank"
    // );

    // this will be changed according to the workflow of promote and rollback feature
    // even the names of variables should change according to the nam edescribed in the workflow 
    // issue templates must be created in the workflow dir to link these features with the github actions
    // final flow must look like: ui (rollback or promote) -> issues (create) -> actions (deployement)
    // the issue url must be like: https://github.com/github_username/github_repo_name/issues/new?title=${title}&body=${body}
}

function renderEnv(
    env,
    client,
    module,
    isUAT = false,
    isPROD = false
){

    if(!env){
        return "-";
    }

    const color =
        env.Status === "FAILED"
        ? "text-red-500"
        : "text-green-500";

    const icon = 
        env.Status === "FAILED"
        ? "✖"
        : "✔";

    return `
        <div>

            <div class="font-medium">
                ${env.Version}
            </div>

            <div class="text-xs text-slate-500">
                ${env.ReleaseId}
            </div>

            <div class="${color} text-xs">
                ${icon} ${env.Status}
            </div>

            ${
                isUAT
                ?
                `
                <div class="mt-2 flex gap-2">
                    <button
                    onclick="createIssue(
                        'Promotion',
                        '${client}',
                        '${module}',
                        'UAT',
                        'PROD',
                        '${env.ReleaseId}',
                        '${env.Version}'
                    )"
                    class="bg-green-700 px-2 py-1 rounded text-xs">
                        Promote
                    </button>

                    <button
                    onclick="createIssue(
                        'Rollback',
                        '${client}',
                        '${module}',
                        'UAT',
                        'QA',
                        '${env.ReleaseId}',
                        '${env.Version}'
                    )"
                    class="bg-orange-700 px-2 py-1 rounded text-xs">
                        Rollback
                    </button>

                </div>
                `
                : ""
            }

            ${
                isPROD
                ?
                `
                <div class="mt-2">

                    <button
                    onclick="createIssue(
                        'Rollback',
                        '${client}',
                        '${module}',
                        'PROD',
                        'UAT',
                        '${env.ReleaseId}',
                        '${env.Version}'
                    )"
                    class="bg-orange-700 px-2 py-1 rounded text-xs">
                        Rollback
                    </button>

                </div>
                `
                : ""
            }

        </div>
    `;
}

window.createIssue = createIssue;
function renderTable(){
    const search =
        document.getElementById(
            "search"
        ).value.toLowerCase();

    const client =
        document.getElementById(
            "clientFilter"
        ).value;

    const app =
        document.getElementById(
            "applicationFilter"
        ).value;
        
    const version =
        document.getElementById(
            "versionFilter"
        ).value;

    const filtered = deployments.filter(row => {

            const matchSearch =
                row.client.toLowerCase().includes(search)
                ||
                row.application.toLowerCase().includes(search)
                ||
                row.module.toLowerCase().includes(search);

            const matchClient =
                !client ||
                row.client === client;

            const matchApp =
                !app ||
                row.application === app;
            const matchVersion =
                !version ||
                row.uat?.Version === version ||
                row.prod?.Version === version;

            return (
                matchSearch &&
                matchClient &&
                matchApp &&
                matchVersion
            );
        });

    let html = `
        <table class="w-full border border-slate-800">

            <thead>

                <tr class="bg-slate-900">

                    <th class="p-3 text-left">Client</th>
                    <th class="p-3 text-left">Application</th>
                    <th class="p-3 text-left">Module</th>
                    <th class="p-3 text-left">UAT</th>
                    <th class="p-3 text-left">PROD</th>

                </tr>

            </thead>

            <tbody>
    `;

    filtered.forEach(row => {

        html += `
            <tr class="border-t border-slate-800">

                <td class="p-3">
                    ${row.client}
                </td>

                <td class="p-3">
                    ${row.application}
                </td>

                <td class="p-3 font-semibold">
                    ${row.module}
                </td>

                <td class="p-3">
                    ${renderEnv(
                        row.uat,
                        row.client,
                        row.module,
                        true,
                        false
                    )}
                </td>

                <td class="p-3">
                    ${renderEnv(
                        row.prod,
                        row.client,
                        row.module,
                        false,
                        true
                    )}
                </td>

            </tr>
        `;
    });

    html += `
            </tbody>

        </table>
    `;

    document.getElementById(
        "tableContainer"
    ).innerHTML = html;
}

document
.getElementById("search")
.addEventListener(
    "input",
    renderTable
);

document
.getElementById("clientFilter")
.addEventListener(
    "change",
    renderTable
);

document
.getElementById("applicationFilter")
.addEventListener(
    "change",
    renderTable
);

document
.getElementById("versionFilter")
.addEventListener(
    "change",
    renderTable
);

loadData();