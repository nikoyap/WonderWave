require('dotenv').config();

const JobRunner = require("./jobs/JobRunner");

const runner = new JobRunner();

runner.start();
