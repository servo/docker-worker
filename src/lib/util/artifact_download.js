const crypto = require('crypto');
const request = require('request');
const fs = require('mz/fs');
const sleep = require('../util/sleep');
const { fmtLog, fmtErrorLog } = require('../log');

/*
 * Downloads an artifact for a particular task and saves it locally.
 *
 * @param {Object} queue - Queue instance
 * @param {String} taskId - ID of the task
 * @param {String} name - Path to find the artifact for a given task
 * @param {String} filename - Path to store the file locally
 */
module.exports = function(queue, stream, taskId, name, filename) {
  stream.write(
    fmtLog(`Downloading artifact "${name}" from task ID: ${taskId}.`)
  );
  const artifact = new Artifact(queue);
  return artifact.get({ taskId, name, filename });
}

