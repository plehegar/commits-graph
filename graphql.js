"use strict";

const config = require("./config.json");
const io = require("io-promise");

const GH_API = "https://api.github.com/graphql";

// use https://developer.github.com/v4/explorer/ to debug queries

const GH_HEADERS =  {
  "Accept": "application/vnd.github.v4.idl",
  "User-Agent": "graphql-github/0.1",
  "Authorization": "bearer " + config.ghToken
};

// Make a GraphQL query to GitHub
async function graphql(query, variables) {
  let options = { headers: GH_HEADERS },
      postObj = { query: query };
  if (variables !== undefined) {
    postObj.variables = variables;
  }

  let obj = await io.post(GH_API, postObj, options).then(res => res.json());

  if (obj.errors) {
    let ghErr = obj.errors[0]; // just return the first error
    let err = new Error(ghErr.message, "unknown",
                        (ghErr.locations)? ghErr.locations[0].line : -1);
    if (ghErr.type) err.type = ghErr.type;
    err.all = obj.errors;
    throw err;
  }
  return obj.data;
}

module.exports = graphql;
