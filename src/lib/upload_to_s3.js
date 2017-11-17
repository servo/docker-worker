const Debug = require('debug');
const https = require('https');
const assert = require('assert');
const url = require('url');
const fs = require('mz/fs');
const temporary = require('temporary');
const { Artifact } = require('taskcluster-lib-artifact');
const { createLogger } = require('./log');
const _ = require('lodash');
const waitForEvent = require('./wait_for_event');

let debug = Debug('taskcluster-docker-worker:uploadToS3');

// Upload an S3 artifact to the queue for the given taskId/runId.  Source can be
// a string or a stream.
module.exports = async function uploadToS3 (
  queue,
  taskId,
  runId,
  source,
  artifactName,
  expires,
  headers)
{
  let size;
  const tmp = new temporary.File();

  try {
    // write the source out to a temporary file so that it can be
    // re-read into the request repeatedly
    if (typeof source === "string") {
      await tmp.writeFile(source);
    } else {
      await new Promise((accept, reject) => {
        const output = fs.createWriteStream(tmp.path);
        output.once('error', reject);
        source.once('error', reject);
        output.once('finish', accept);
        source.pipe(output);
      });
    }

    debug(`created temporary file ${tmp.path} for ${artifactName}`);

    const stat = fs.statSync(tmp.path);
    size = stat.size;
    assert(size > 0, `Artifact ${artifactName} must have have length greater than zero`);
    debug(`Artifact size = ${size} bytes`);

    const artifact = new Artifact({ queue });
    await artifact.put({
      taskId,
      runId: runId.toString(),
      name: artifactName,
      contentType: headers['content-type'],
      filename: tmp.path,
      compression: headers['content-encoding'],
      expires
    });

  } finally {
    tmp.unlink();
  }

  return {digest: '', size};
}
