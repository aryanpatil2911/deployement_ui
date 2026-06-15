const deploymentLogsPath = "../applications";
const deploymentLogsIndexUrl = `${deploymentLogsPath}/index.json`;
let deployments = [];

function parseCSV(text) {
    const lines = text.trim().split("\n");
    if (lines.length < 2) return [];
    const headers = lines[0]
        .split(",")
        .map(h => h.replace(/"/g, "").trim());
    return lines.slice(1).map(line => {
        const values = line
            .split(",")
            .map(v => v.replace(/"/g, "").trim());
        const row = {};
        headers.forEach((header, index) => {
            row[header] = values[index] || "";
        });
        return row;
    });
}

async function loadData() {
    try {
        const indexResponse = await fetch(deploymentLogsIndexUrl);
        if (!indexResponse.ok) {
            throw new Error(`Unable to load ${deploymentLogsIndexUrl}`);
        }
        const folderItems = await indexResponse.json();
        const files = (Array.isArray(folderItems) ? folderItems : folderItems.files || [])
            .filter(fileName =>
                typeof fileName === "string" &&
                fileName.toLowerCase().endsWith(".csv")
            );
        deployments = [];
        for (const file of files) {
            const fileResponse = await fetch(`${deploymentLogsPath}/${file}`);
            if (!fileResponse.ok) continue;
            const text = await fileResponse.text();
            deployments.push(...parseCSV(text));
        }
        loadFilters();
        renderTable();
    } catch (error) {
        console.error(error);
        document.getElementById("tableContainer").innerHTML =
            "<div class='text-red-500'>Failed to load data</div>";
    }
}

function loadFilters() {
    fillSelect("clientFilter", [...new Set(deployments.map(x => x.Client))]);
    fillSelect("applicationFilter", [...new Set(deployments.map(x => x.Application))]);
    fillSelect("versionFilter", [...new Set(deployments.map(x => x.Version))]);
    fillSelect("environmentFilter", [...new Set(deployments.map(x => x.Environment))]);
}

function fillSelect(id, values) {
    const select = document.getElementById(id);
    values
        .filter(Boolean)
        .sort()
        .forEach(value => {
            select.innerHTML += `<option value="${value}">${value}</option>`;
        });
}

function renderTable() {
    const search = document.getElementById("search").value.toLowerCase();
    const client = document.getElementById("clientFilter").value;
    const application = document.getElementById("applicationFilter").value;
    const version = document.getElementById("versionFilter").value;
    const environment = document.getElementById("environmentFilter").value;

    const rows = deployments.filter(row => {
        const matchSearch = !search ||
            row.Client?.toLowerCase().includes(search) ||
            row.Application?.toLowerCase().includes(search) ||
            row.Version?.toLowerCase().includes(search) ||
            row.Environment?.toLowerCase().includes(search);

        return (
            matchSearch &&
            (!client || row.Client === client) &&
            (!application || row.Application === application) &&
            (!version || row.Version === version) &&
            (!environment || row.Environment === environment)
        );
    });

    document.getElementById("tableContainer").innerHTML = `
        <table class="w-full border border-slate-800">
            <thead>
                <tr class="bg-slate-900">
                    <th class="p-3 text-left">Client</th>
                    <th class="p-3 text-left">Application</th>
                    <th class="p-3 text-left">Version</th>
                    <th class="p-3 text-left">Environment</th>
                    <th class="p-3 text-left">Status</th>
                    <th class="p-3 text-left">Deployment Time</th>
                    <th class="p-3 text-left">Triggered By</th>
                </tr>
            </thead>
            <tbody>
                ${rows.map(row => `
                    <tr class="border-t border-slate-800">
                        <td class="p-3">${row.Client || "-"}</td>
                        <td class="p-3">${row.Application || "-"}</td>
                        <td class="p-3">${row.Version || "-"}</td>
                        <td class="p-3 font-medium ${row.Environment === 'PROD' ? 'text-amber-400' : 'text-blue-400'}">
                            ${row.Environment || "-"}
                        </td>
                        <td class="p-3 ${
                            row.DeploymentStatus === "Succeeded"
                            ? "text-green-500" : "text-red-500"
                        }">
                            ${row.DeploymentStatus || "-"}
                        </td>
                        <td class="p-3">${row.DeploymentDateTime || "-"}</td>
                        <td class="p-3">${row.TriggeredBy || "-"}</td>
                    </tr>
                `).join("")}
            </tbody>
        </table>
        <div class="mt-3 text-slate-400">
            Showing ${rows.length} of ${deployments.length} deployments
        </div>
    `;
}

// Event Listeners
document.getElementById("search").addEventListener("input", renderTable);
document.getElementById("clientFilter").addEventListener("change", renderTable);
document.getElementById("applicationFilter").addEventListener("change", renderTable);
document.getElementById("versionFilter").addEventListener("change", renderTable);
document.getElementById("environmentFilter").addEventListener("change", renderTable);

loadData();