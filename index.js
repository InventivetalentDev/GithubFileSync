const GitHub = require("github-api");
const fs = require("fs");
const path = require("path");

const config = require("./config");

if (!config) {
    console.warn("Missing config.js");
    return;
}
if (config.token === "MY_GITHUB_TOKEN") {
    console.warn("Please add your GitHub access token to config.js");
    return;
}

const BRANCH_NAME = "gh-file-sync";

const args = process.argv.slice(2);
const mode = args.length > 0 ? args[0].toLowerCase() : "list";

console.log(mode.toUpperCase() + " MODE");

const gh = new GitHub({
    token: config.token
});

let pullRequests = [];

// https://stackoverflow.com/a/16684530/6257838
let walk = function (dir) {
    let results = [];
    let list = fs.readdirSync(dir);
    list.forEach(function (file) {
        file = path.join(dir, file);
        let stat = fs.statSync(file);
        if (stat && stat.isDirectory()) {
            /* Recurse into a subdirectory */
            results = results.concat(walk(file));
        } else {
            /* Is a file */
            results.push(file);
        }
    });
    return results;
};

let sleep = (millis) => {
    return new Promise(resolve => {
        setTimeout(() => resolve, millis);
    });
}

let syncFile = async (repoObject, filePath, file) => {
    let content = await fs.promises.readFile(file);
    let name = path.basename(file);
    // let masterFile;
    // try{
    //  masterFile =  await repoObject.getContents("master", filePath);
    // }catch (e) {
    //     if (e.response.status !== 404) {
    //         throw e;
    //     }
    // }
    // let branchFile;
    // try{
    //     branchFile=await repoObject.getContents(BRANCH_NAME, filePath);
    // }catch (e) {
    //     if (e.response.status !== 404) {
    //         throw e;
    //     }
    // }
    // if(!masterFile&&!branchFile) {
    await repoObject.writeFile(BRANCH_NAME, filePath, content, "Sync " + name, {encode: true})
    // }
};

let syncFilesToRepo = async (repoObj, repo) => {
    console.log("Syncing files to " + repo.full_name);

    let source = config.source || "./files";
    let files = walk(source);
    for await (let file of files) {
        let relative = path.relative(source, file);
        await syncFile(repoObj, relative, file);
    }

    try {
        let prResponse = await repoObj.createPullRequest({
            title: "[file-sync] Sync " + files.length + " Files",
            head: BRANCH_NAME,
            base: repo.default_branch
        });
        if (prResponse && prResponse.data) {
            pullRequests.push(prResponse.data.html_url);
        }
    } catch (e) {
        // if (e.response.status !== 404) {
        //     throw e;
        // }
    }
};

let mergePullRequest = async (repoObj, repo, pullRequest) => {
    if (pullRequest.author_association === "OWNER" || pullRequest.author_association === "MEMBER" || pullRequest.author_association === "COLLABORATOR") {
        console.log("Merging PR#" + pullRequest.number + " (" + pullRequest.title + ") in " + repo.full_name + " by " + pullRequest.user.login);
        try {
            await repoObj.mergePullRequest(pullRequest.number)
        } catch (e) {
            console.warn(e);
        }
    } else {
        console.warn("Found unauthorized open pull request with file-sync tag in " + repo.full_name + " (" + pullRequest.html_url + ")");
    }
};

let checkExistingPullRequests = async (repoObj, repo) => {
    let q = "file-sync repo:" + repo.full_name + " type:pr in:title state:open";
    let searchResponse = await gh.search({
        q: q,
        per_page: 10
    }).forIssues();
    if (searchResponse && searchResponse.data) {
        for await (let item of searchResponse.data) {
            if ("list" === mode) {
                console.log("    Open sync PR: " + item.html_url);
            }
            if ("merge" === mode) {
                await mergePullRequest(repoObj, repo, item);
            }
        }
    }
};

let processRepo = async (repo) => {
    if ((!config.whitelist || config.whitelist.length === 0 || config.whitelist.indexOf(repo.full_name) !== -1) && (!config.blacklist || config.blacklist.indexOf(repo.full_name) === -1)) {
        if ("list" === mode) {
            console.log(repo.full_name)
        }
        let repoObj = gh.getRepo(repo.owner.login, repo.name);
        if (!repoObj) return;
        let branchCallback = async (branch) => {
            if ("list" === mode) {
                console.log("  Has " + BRANCH_NAME + " branch");
            }
            if ("sync" === mode) {
                await syncFilesToRepo(repoObj, repo);
            }
            if ("merge" === mode || "list" === mode) {
                await checkExistingPullRequests(repoObj, repo);
            }
        };
        let createBranch = async () => {
            console.log("Creating branch " + BRANCH_NAME + " in " + repo.full_name);
            let branchResponse = await repoObj.createBranch(repo.default_branch, BRANCH_NAME);
            await branchCallback(branchResponse.data);
        };
        try {
            let branchResponse = await repoObj.getBranch(BRANCH_NAME);
            if (branchResponse && branchResponse.data) {
                if ("sync" === mode) console.log("Using existing branch " + BRANCH_NAME + " in " + repo.full_name);
                await branchCallback(branchResponse.data);
            } else if ("sync" === mode) {
                await createBranch();
            }
        } catch (e) {
            if ("sync" === mode && e.response && e.response.status === 404) {
                await createBranch();
            } else {
                throw e;
            }
        }
    }
};


let repoListCallback = async (err, repos) => {
    if (err) {
        console.warn("Failed to get repo list");
        console.warn(err);
        return;
    }
    console.log("Found " + repos.length + " repos");
    for await (let repo of repos) {
        if (repo.archived) continue;
        try {
            await processRepo(repo);
        } catch (e) {
            console.warn(e);
        }

        // await sleep(200);
    }

    console.log(" ");
    console.log("Done!");
    if ("list" === mode) {
        console.log("Run with 'npm run sync' / 'node index.js sync' to create file-sync PRs");
    }
    if ("sync" === mode) {
        console.log("Created " + pullRequests.length + " PRs");
        console.log(JSON.stringify(pullRequests, null, 2));
        console.log("Run with 'npm run merge' / 'node index.js merge' to auto-merge them!");
    }


};

setTimeout(() => {
    let user = (!!config.user && config.user.length > 0) ? gh.getUser(config.user) : gh.getUser();
    console.info("Using GitHub user " + (config.user || "me"));
    user.listRepos({}, repoListCallback);
}, 2000);
