const GitHub = require("github-api");
const request = require("request-promise-native");
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

const gh = new GitHub({
    token: config.token
});

let urls = [];

let processRepo = async (repo) => {
    if ((!config.whitelist || config.whitelist.length === 0 || config.whitelist.indexOf(repo.full_name) !== -1) && (!config.blacklist || config.blacklist.indexOf(repo.full_name) === -1)) {
        let body = await request(repo.html_url);
        if (body.indexOf("sponsor-button-repo") === -1) {
            console.log(repo.full_name + " doesn't have sponsors enabled");
            urls.push(repo.html_url + "/settings");
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
        if (repo.archived || repo.fork) continue;
        try {
            await processRepo(repo);
        } catch (e) {
            console.warn(e);
        }
        // await sleep(200);
    }

    console.log(JSON.stringify(urls, null, 2));

};

setTimeout(() => {
    let user = (!!config.user && config.user.length > 0) ? gh.getUser(config.user) : gh.getUser();
    console.info("Using GitHub user " + (config.user || "me"));
    user.listRepos({}, repoListCallback);
}, 2000);
