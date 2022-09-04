"use strict";
const fs = require("fs/promises");
const { createWriteStream, readFileSync } = require("fs");
const path = require("path");
const { faker } = require("@faker-js/faker");
const bcrypt = require("bcrypt");

const yargs = require("yargs/yargs");
const { hideBin } = require("yargs/helpers");
const { default: mongoose, mongo } = require("mongoose");
const { randomInt } = require("crypto");

const schema = new mongoose.Schema({}, { strict: false });

const connectDB = async (url, db) => {
  try {
    await mongoose.connect(`mongodb://${url}:27017/${db}`);
  } catch (err) {
    console.log("Database connection error");
    throw err;
  }
};

const compileModel = async model => {
  try {
    const modelPath = path.join(__dirname, model);

    const file = await fs.readFile(modelPath, "ascii");
    const lines = file.split("\n");
    const modelArray = lines.map(line => {
      const item = line.split("=");
      return item;
    });
    const modelObject = Object.fromEntries(modelArray);

    return modelObject;
  } catch (err) {
    console.log("Cannot find model");
    throw err;
  }
};

const isRanged = range => {
  return range.includes(",");
};

const getRange = range => {
  return range.replace("}", "").split(",");
};

const getValue = range => {
  return range.replace("}", "");
};

const randomString = (
  len,
  chars = "abcbefghijklmnopqrstuvwxyz" +
    "ABCDEFGHIJKLMNOPQRSTUVWXYZ" +
    "1234567890",
  s = ""
) => {
  if (len === 0) return s;
  const char = chars[Math.floor(Math.random() * chars.length)];
  return randomString(len - 1, chars, s + char);
};

const calculateRelativeDate = rel => {
  const [v, unit] = [rel.slice(0, -1), rel.slice(-1)];
  const value = +v;
  const transforms = [1000, 60, 60, 24];
  const units = ["s", "m", "h", "d"];

  const unitIndex = units.findIndex(item => item === unit);
  let timestamp = +new Date();
  let range = value;
  for (let i = 0; i <= unitIndex; i++) {
    range *= transforms[i];
  }
  timestamp += range;

  return timestamp;
};

const getDate = (from, to) => {
  const fromDate = calculateRelativeDate(from);
  const toDate = calculateRelativeDate(to);

  const randomTime = Math.floor(Math.random() * (toDate - fromDate)) + fromDate;

  return new Date(randomTime);
};

const generateRandom = (type, min, max) => {
  const length = Math.floor(Math.random() * (max - min)) + +min;

  if (type === "string") return randomString(length);
  if (type === "integer") return randomInt(max - min) + +min;
  if (type === "number") return Math.random() * (max - min) + +min;
};

const getFromVars = varName => {
  const data = readFileSync(path.join(__dirname, varName + ".dat"), "ascii");
  const values = data.split("\n").filter(val => val !== "");
  const selected = values[Math.floor(Math.random() * values.length)];
  const parsed = JSON.parse(selected);
  if (varName === "ids") return new mongoose.Types.ObjectId(parsed);
  return parsed;
};

const getDefault = name => {
  switch (name.toLowerCase()) {
    case "array":
      return [];
    case "object":
      return {};
    case "hashtag":
      return "#";
    case "atsign":
      return "@";
    case "dollar":
      return "$";
    case "dash":
      return "-";
    case "true":
      return true;
    case "false":
      return false;
    case "now":
      return new Date();
  }
};

const generateValue = async value => {
  if (value === "$firstname") return faker.name.firstName();
  else if (value === "$lastname") return faker.name.lastName();
  else if (value === "$email") return faker.internet.email();
  else if (value === "$country") return faker.address.country();
  else if (value === "$url") return faker.internet.url();
  else if (value === "$avatar") return faker.internet.avatar();
  else if (value === "$btcAddress")
    return faker.finance.bitcoinAddress().replace("0x", "");
  else if (value === "$ethAddress")
    return faker.finance.ethereumAddress().replace("0x", "");
  else if (value.startsWith("!")) {
    const salt = await bcrypt.genSalt();
    return bcrypt.hash(await generateValue(value.slice(1)), salt);
  } else if (value.startsWith("#")) {
    value = value.slice(1);
    const [type, range] = value.split("{");
    if (isRanged(range)) {
      const [min, max] = getRange(range);
      if (type === "date") {
        return getDate(min, max);
      }
      return generateRandom(type, min, max);
    } else {
      const value = getValue(range);
      return generateRandom(type, value, value);
    }
  } else if (value.startsWith("@")) return getFromVars(value.slice(1));
  else if (value.startsWith("-")) return getDefault(value.slice(1));
  else return value;
};

const generate = async model => {
  try {
    const result = {};
    for (let [key, value] of Object.entries(model)) {
      result[key] = await generateValue(value);
    }
    return result;
  } catch (err) {
    console.log(err);
    throw err;
  }
};

const saveIds = async ids => {
  const file = createWriteStream("ids.dat");
  for (let id of ids) {
    file.write(JSON.stringify(id) + "\n");
  }
};

const argv = yargs(hideBin(process.argv))
  .alias("u", "url")
  .alias("d", "db")
  .alias("c", "collection")
  .alias("m", "model")
  .alias("n", "count")
  .alias("s", "save")
  .alias("i", "save-id")
  .array("save")
  .boolean("save-id")
  .usage(
    "Usage: node index.js " +
      "--url [database url] " +
      "--db [database name] " +
      "--collection [collection name] " +
      "--model [model name] " +
      "--count [count] " +
      "--save [model property]:[save name] " +
      "--save-id"
  )
  .demandOption(["url", "db", "collection", "model"]).argv;

const { url, db, collection, model, count, save, saveId } = argv;

let toSave = {};

if (save) {
  for (let item of save) {
    try {
      const [prop, name] = item.split(":");
      toSave[prop] = createWriteStream(path.join(__dirname, name + ".dat"));
    } catch (err) {
      console.log(`Save switch cannot accept value: ${item}`);
      throw err;
    }
  }
}

let compiled;

compileModel(model)
  .then(model => {
    compiled = model;
    return connectDB(url, db);
  })
  .then(() => {
    console.log("Connection established!");
    const items = [];
    const promises = [];
    for (let i = 0; i < (count || 1); i++) {
      promises.push(generate(compiled));
    }
    return Promise.all(promises);
  })
  .then(items => {
    for (let item of items) {
      for (let key of Object.keys(toSave)) {
        if (item[key]) {
          toSave[key].write(JSON.stringify(item[key]) + "\n");
        }
      }
    }

    return mongoose.model(collection, schema).insertMany(items);
  })
  .then(result => {
    const ids = result.map(res => res._id.toString());
    if (saveId) {
      return saveIds(ids);
    }
  })
  .then(() => {
    mongoose.disconnect();
  })
  .catch(err => console.log(err));
