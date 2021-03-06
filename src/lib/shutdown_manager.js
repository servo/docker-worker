const { EventEmitter } = require('events');
const { spawn } = require('child_process');
const Debug = require('debug');

let debug = Debug('docker-worker:shutdown_manager');

class ShutdownManager extends EventEmitter {
  constructor(host, config) {
    super();
    this.idleTimeout = null;
    this.host = config.hostManager;
    this.config = config;
    this.monitor = config.monitor;
    this.nodeTerminationPoll = config.shutdown.nodeTerminationPoll || 5000;
    this.onIdle = this.onIdle.bind(this);
    this.onWorking = this.onWorking.bind(this);
  }

  async shutdown() {
    this.monitor.count('shutdown');
    // Add some vague assurance that we are not still claiming tasks.
    await this.taskListener.close();

    this.config.log('shutdown');
    spawn('shutdown', ['-h', 'now']);
  }

  onIdle() {
    let stats = {
      uptime: this.host.billingCycleUptime(),
      idleInterval: this.config.shutdown.afterIdleSeconds
    };

    this.config.log('uptime', stats);

    var shutdownTime = stats.idleInterval;
    this.config.log('pending shutdown', {
      time: shutdownTime
    });

    this.idleTimeout =
      setTimeout(this.shutdown.bind(this), shutdownTime * 1000);
  }

  onWorking() {
    if (this.idleTimeout !== null) {
      this.config.log('cancel pending shutdown');
      clearTimeout(this.idleTimeout);
      this.idleTimeout = null;
    }
  }

  observe(taskListener) {
    if (!this.config.shutdown.enabled) {
      this.config.log('shutdowns disabled');
      return;
    }

    this.taskListener = taskListener;
    this.taskListener.on('idle', this.onIdle);
    this.taskListener.on('working', this.onWorking);

    // Kick off the idle timer if we started in an idle state.
    if (taskListener.isIdle()) this.onIdle();
  }

  scheduleTerminationPoll() {
    return (async () => {
      if (this.terminationTimeout) clearTimeout(this.terminationTimeout);

      let terminated = await this.host.getTerminationTime();

      if (terminated) {
        this.config.capacity = 0;
        this.emit('nodeTermination', terminated);
      }

      this.terminationTimeout = setTimeout(
        this.scheduleTerminationPoll.bind(this), this.nodeTerminationPoll
      );
    })();
  }
}

module.exports = ShutdownManager;
