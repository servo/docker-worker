/**
Return the appropriate configuration defaults when on GCP.
*/

const got = require('got-promise');
const taskcluster = require('taskcluster-client');
const _ = require('lodash');
const { createLogger } = require('../log');
const { spawn } = require('child_process');

let log = createLogger({
  source: 'host/gcp'
});

let os = require('os');

function minutes(n) {
  return n * 60;
}

/**
AWS Metadata service endpoint.

@const
@see https://cloud.google.com/compute/docs/storing-retrieving-metadata
*/
const PROJECT_URL = 'http://metadata.google.internal/computeMetadata/v1/project/?recursive=true';
const INSTANCE_URL = 'http://metadata.google.internal/computeMetadata/v1/instance/?recursive=true';

async function getText(url) {
  try {
    const res = await got(url, {
      headers: {
        'Metadata-Flavor': 'Google',
      },
    });
    return res.body;
  }
  catch (e) {
    // Some meta-data endpoints 404 until they have a value to display (spot node termination)
    if (e.response.statusCode !== 404) throw e;
  }
}

async function getJsonData(url) {
  // query the user data for any instance specific overrides set by the
  // provisioner.
  try {
    const res = await getText(url);
    return JSON.parse(res);
  } catch (err) {
    log(`${url} not available: ${err.stack || err}`);
  }
}

module.exports = {
  getText,
  getJsonData,

  /**
  @return Number of seconds this worker has been running.
  */
  billingCycleUptime() {
    return os.uptime();
  },

  /**
  Read AWS metadata and user-data to build a configuration for the worker.

  @param {String} [baseUrl] optional base url override (for tests).
  @return {Object} configuration values.
  */
  async configure(projectUrl = PROJECT_URL, instanceUrl = INSTANCE_URL) {
    log('configure', { projectUrl, instanceUrl });

    let projectData = await getJsonData(projectUrl);
    let instanceData = await getJsonData(instanceUrl);

    let zone = instanceData.zone.split('/').reverse()[0];
    let instanceType = instanceData.machineType.split('/').reverse()[0];

    let config = {
      host: instanceData.hostname,
      publicIp: instanceData.networkInterfaces[0].accessConfigs.externalIp,
      privateIp: instanceData.networkInterfaces[0].ip,
      workerId: instanceData.id,
      workerGroup: zone,
      workerNodeType: instanceType,
      instanceId: instanceData.id,
      region: zone,
      instanceType,
      // AWS Specific shutdown parameters notice this can also be overridden.
      shutdown: {
        enabled: true,
        // AWS does per second billing. So every second we are idling is wasting
        // money. However, we want machines waiting on work not work waiting on
        // machines. Furthermore, the value of a running machine is higher than
        // the value of a new machine because a) it has already paid the startup
        // cost b) it may have populated caches that can result in subsequent
        // tasks executing faster.
        afterIdleSeconds: minutes(15),
      }
    };

    log('metadata', config);

    let userdata = projectData.attributes || {};
    let securityToken = userdata.securityToken;
    let provisionerBaseUrl = userdata.provisionerBaseUrl;

    log('read userdata', { text: userdata });

    let provisioner = new taskcluster.AwsProvisioner({
      baseUrl: provisionerBaseUrl
    });

    // Retrieve secrets
    let secrets;
    try {
      secrets = await provisioner.getSecret(securityToken);
    }
    catch (e) {
      // It's bad if secrets cannot be retrieved.  Either this could happen when
      // worker first starts up because of an issue communicating with the provisioner
      // or if the worker respawned (because of an uncaught exception).  Either way,
      // alert and set capacity to 0.
      log('[alert-operator] error retrieving secrets', {stack: e.stack});
      spawn('shutdown', ['-h', 'now']);
    }

    log('read secrets');

    await provisioner.removeSecret(securityToken);

    // Log config for record of configuration but without secrets
    log('config', config);

    // Order of these matter.  We want secret data to override all else, including
    // taskcluster credentials (if perma creds are provided by secrets.data)
    return _.defaultsDeep(
      secrets.data,
      {taskcluster: secrets.credentials},
      userdata.data,
      {
        capacity: userdata.capacity,
        workerType: userdata.workerType,
        provisionerId: userdata.provisionerId
      },
      config
    );
  },

  async getTerminationTime() {
    // TODO handle ACPI G2/S5 soft off events
    return false;
  }
};
