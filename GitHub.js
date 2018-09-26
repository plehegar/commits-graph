"use strict";

const io = require("io-promise");
const graphql = require("./graphql.js");

// A GH Repository
class Repository {
  constructor(repository) {
    if (repository === undefined) {
      throw new Error("You need to specify a repository [owner]/[name]");
    } else {
      this.repository = repository;
    }
    // checks
    if (!(typeof this.repository === "string"
          && this.repository.indexOf('/') !== -1)) {
      throw new Error("invalid repository identifier [owner]/[name] but got \"" + this.repository + '"');
    }
    let s = this.repository.split('/');
    this.owner = s[0];
    this.name = s[1];
  }

  async apiStatus() {
    return graphql(`
    query {
       rateLimit { limit cost remaining resetAt }
    }`).then(res =>res.data.rateLimit);
  }

  // return the configuration of a GH repository
  // @@ this is unused at the moment
  async getConfig() {
    let variables = { owner: this.owner, name: this.name};
    const query = `
    query ($owner: String = "w3c", $name: String = "w3c.github.io") {
      repository(owner:$owner,name:$name) {
        nameWithOwner
        homepageUrl
        isArchived
        isPrivate
        pushedAt
        updatedAt
        mergeCommitAllowed
        squashMergeAllowed
        defaultBranch: defaultBranchRef {
          name
        }
        w3cJson: object(expression: "HEAD:w3c.json") {
          ... on Blob {
            text
          }
        }
        preview: object(expression: "HEAD:.pr-preview.json") {
          ... on Blob {
            text
          }
        }
      }
    }
    `;
    return graphql(query, variables).then(res => {
      if (res.repository === null) {
        return {};
      }
      if (res.repository.defaultBranch) {
        res.repository.defaultBranch = res.repository.defaultBranch.name;
      }
      if (res.repository.w3cJson) {
        res.repository.w3cJson = JSON.parse(res.repository.w3cJson.text);
      }
      if (res.repository.preview) {
        res.repository.preview = JSON.parse(res.repository.preview.text);
      }
      return res.repository;
    });
  }

  // return an array of commits, with their parents
  // @@parents are unused for now
  async getCommits(since) {
    // for this query, we're using edges and nodes
    //   (edges allow you to do pagination, while nodes don't)
    // we use fragments to simplify reading
    // we include the id of each commit to allow one to locate parents
    // first = 100 was obtained by experiment. GH doesn't seem to accept more.
    // we search by repository https://developer.github.com/v4/query/#repository
    const query = `
    query  ($owner: String = "w3c", $name: String = "w3c.github.io",
            $after: String = null,
            $since: GitTimestamp = null) {
      repository(owner:$owner,name:$name) {
        defaultBranchRef {
          target {
            ... on Commit {
              history(since: $since, after: $after, first: 100) {
                pageInfo{ endCursor hasNextPage }
                edges {
                  node {
                    ... on Commit {
                      ... commitFragment
                    }
                    parents(first: 10) {
                      nodes {
                        id
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
    fragment commitFragment on Commit { id committedDate }
    `;
    const edgesQuery = (after) => {
      let variables = { owner: this.owner, name: this.name};
      if (since) variables.since = since;
      if (after) variables.after = after;
      return graphql(query, variables)
       .then(res => {
         if (res.repository === null) {
           return [];
         }
         let pageInfo = res.repository.defaultBranchRef.target.history.pageInfo;
         let edges = res.repository.defaultBranchRef.target.history.edges;
         if (pageInfo.hasNextPage === true) {
           return edgesQuery(pageInfo.endCursor).then(moreEdges =>
            edges.concat(moreEdges));
         } else {
           return edges;
         }
        });
      };
    return edgesQuery().then(edges => edges.map(el => el.node));
  }
}

/*

const gh = new Repository();

console.log("%s/%s", gh.owner, gh.name);

gh.getCommits("2017-08-01T00:00:00+00:00")
.then(res => {
  console.log(res.length + " commits retrieved");
  console.log(gh);
  return res;
})
.catch(console.error);

*/

module.exports = Repository;
