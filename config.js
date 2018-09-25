"use strict";

let config = require("./config.json");

exports.has = function (key) {
  return config[key] !== undefined;
};

exports.find = function (key) {
  return config[key];
};

exports.get = function (key) {
  let value = config[key];
  if (value === undefined) {
    throw new Error("Missing " + key + " in configuration");
  }
  return value;
};
