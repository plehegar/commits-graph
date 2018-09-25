"use strict";


const Repository = require("./GitHub.js");
const io = require("io-promise");

const GAPS = require("./gaps.json");

// use the spec-dashboard to gather information about repositories

const DASHBOARD = "https://w3c.github.io/spec-dashboard/";

async function gatherRepos() {
  const ALLGROUPS = await io.fetch(DASHBOARD+"groups.json").then(res => res.json());
  let allRepos = {};
  let subset = {};
  let all = [];
  for (let key in ALLGROUPS) {
    all.push(io.fetch(DASHBOARD+"pergroup/"+key+"-repo.json")
     .then(res => res.json())
     .then(specs => {
      let obj = {};
      obj.name = ALLGROUPS[key].name;
      obj.id = key;
      obj.repos = [];
      obj.specs = [];
      for (let spec in specs) {
        let repo = specs[spec].repo.owner + '/' + specs[spec].repo.name;
        if (!obj.repos.includes(repo)
            && specs[spec].repo.owner != "whatwg" // whatwg/encoding
            && specs[spec].repo.owner != "wicg") // for now
         {
          if (allRepos[repo]) {
            console.warn("[WARN] Duplicate repository " + repo + " from " + allRepos[repo].name);
          } else {
            obj.repos.push(repo);
            allRepos[repo] = obj;
          }
        }
        obj.specs.push(spec);
      }
      // fill some of the gaps in our input, such as EO WG
      if (GAPS[key]) {
        for (let spec in GAPS[key].specs) {
          let so = GAPS[key].specs[spec];
          let repo = so.repo;
          if (!obj.repos.includes(repo)) {
            if (allRepos[repo]) {
              console.warn("[WARN] Duplicate repository " + repo + " from " + allRepos[repo].name);
            } else {
              obj.repos.push(repo);
              allRepos[repo] = obj;
            }
          }
          if (so.isSpec === undefined)
          obj.specs.push(spec);
        }
      }
      if (obj.repos.length > 0) {
        subset[key] = obj;
      } else {
        console.warn("[WARN] No repositories found/known for " + obj.name);
      }
      return subset;
    }).catch(err => {
      console.warn("[WARN] Missing json for " + ALLGROUPS[key].name);
      return null;
    }));
  }
  return Promise.all(all).then(values => {
    let r = [];
    for (let key in subset) {
      r.push(subset[key]);
    }
    return r;
  });
}


// track foolip data source to make additional suggestions
async function foolipInfos(groups) {
  let repos = groups.reduce((ac, g) => ac.concat(g.repos), []);
  // await forces the function to wait until the error console messages have been printed
  let result = await io.fetch("https://foolip.github.io/day-to-day/data.json").then(res=>res.json())
    .then(data =>
      data.specs.forEach(s => {
        if (s.specrepo.indexOf("w3c/") === 0) {
          if (!repos.includes(s.specrepo)) {
            console.warn("[WARN] Consider adding " + s.specrepo + " " + s.href);
          }
        }
      })
    )
}


// For all GH repositories, return their commits
async function gatherCommits(gr) {
  let repos = [];
  let delayIndex = 0;
  let all = [];
  gr.forEach(g => {
    g.repos.forEach(r => {
      let ghRepo = new Repository(r);
      let fileName = "data/" + ghRepo.owner + "-"
        + ghRepo.name + "-commits.json";
      all.push(io.readJSON(fileName).catch(err => {
          // https://developer.github.com/v3/guides/best-practices-for-integrators/#dealing-with-abuse-rate-limits
          return io.wait((delayIndex++ * 1000),
            () => {
              console.log("Fetching commits from %s/%s", ghRepo.owner, ghRepo.name);
              return ghRepo.getCommits("2016-08-01T00:00:00+00:00");
            }).then(res => io.save(fileName, res));
        })
        .then(res => {
          repos.push({ "name": r, "commits": res});
          return null;
        })
      );
    });
  });
  return Promise.all(all).then(values => repos);
}

// main
//  allow me to use await in the code instead of Promise style-writing.
async function main() {
  let groups = await io.readJSON("commits.json").catch(err => gatherRepos().then(groups => io.save("commits.json", groups)));

  console.log("We found " + groups.length + " groups with repositories");

  let count = groups.reduce((ac, g) => ac + g.repos.length, 0);
  console.log("We found " + count + " repositories");

  count = groups.reduce((ac, g) => ac + g.specs.length, 0);
  console.log("We found " + count + " specifications");

  // wait until the error messages are printed
  let ignore = await foolipInfos(groups);

  let commits = await gatherCommits(groups);

  count = commits.reduce((ac, repo) => ac + repo.commits.length, 0);
  console.log("We found " + count + " commits");

  groups.forEach(g => {
    g.commits = [];
    ["2016", "2017", "2018"].forEach((year, idx, years) => {
      let start = (idx === 0)? 8 : 1;
      let end = (idx+1 === years.length)? 9 : 13;
      for (let n = start; n < end; n++) {
        const month = year + "-" + (n + "").padStart(2, '0');
        let gmonth = {"date": month + "-15", "count": 0};
        g.commits.push(gmonth);
        g.repos.forEach(r => {
          let repo = commits.find(e => e.name === r);
          if (repo) {
            let cm = repo.commits.filter(c => c.committedDate.indexOf(month) === 0);
            gmonth.count += cm.length;
          }
        })
      }
    })
  })
  await io.save("commits.json", groups);
}

main();
