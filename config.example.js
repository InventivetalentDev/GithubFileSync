module.exports = {
    token: "MY_GITHUB_TOKEN", // GitHub personal access token
    user: "", // GitHub user - access token owner is used if empty
    whitelist: [], // Whitelisted repositories to include (user/repo)
    blacklist: [], // Blacklisted repositories to exclude (user/repo)
    repoType: "public", // https://developer.github.com/v3/repos/#parameters-2
    source: "./files",
};
